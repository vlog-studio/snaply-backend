import { useIsFocused, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MovieSnapLimit } from '@/entities/movie';
import {
  isSnapFileLocal,
  useExpiredSnapIds,
  useFailedUploadCount,
  useRetryFailedUploads,
  useSnapFiles,
  useSnapSyncEntries,
  type Snap,
  type SnapSyncEntry,
} from '@/entities/snap';
import { useComposeMovie } from '@/features/compose-movie';
import { canDeleteFromDevice, restorableAfterDelete, useDeleteSnaps } from '@/features/delete-snap';
import { requestSnapReconcile } from '@/features/reconcile-snaps';
import { useRestoreSnaps } from '@/features/restore-snap';
import { useSaveSnapToAlbum } from '@/features/save-snap-to-album';
import { formatDuration, formatSeconds } from '@/shared/lib/datetime';
import { movieHref } from '@/shared/routes';
import { pickVideoFromLibrary } from '@/shared/lib/video-picker';
import { useSetTabBarHidden } from '@/shared/ui/tab-bar-chrome';
import { Toast } from '@/shared/ui/toast';
import {
  MaxContentWidth,
  Radius,
  Spacing,
  useTabBarHeight,
  useTheme,
  useTopContentInset,
} from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { VideoPlayerModal } from '@/shared/ui/video-player-modal';
import { SnapDayGrid, SnapSelectionBar, useSnapDays, useSnapPicking } from '@/widgets/snap-grid';

import { draftConfirmation, useEditDraft } from '../model/use-edit-draft';
import { playerAlbumAction } from '../model/player-album-action';
import { useMovieDeleteImpact } from '../model/use-movie-delete-impact';
import {
  SnapDeleteDialog,
  type DeviceOnlyDelete,
  type RestorableDelete,
} from './snap-delete-dialog';

/**
 * What a selection is for. `movie` — the user's own cut list, in pick order,
 * up to {@link MovieSnapLimit}. `draft` — material handed to the edit draft
 * (MOV-21), up to the draft's cap (`useEditDraft`'s `limit`), which chooses
 * among it.
 */
export type SelectionPurpose = 'movie' | 'draft';

export type SnapsPageProps = {
  /**
   * The studio sends the user here to pick: `?select=1` for a new movie,
   * `?select=draft` for the edit draft.
   */
  startSelecting?: SelectionPurpose;
  /**
   * Which request to pick this is (`?at=`, minted per tap by the hrefs). This
   * tab stays mounted, and the same `?select=` arriving a second time — the
   * studio's row tapped again after a movie was made — would change no prop at
   * all: navigation does not re-apply nested params equal to the last ones. A
   * new request is what re-opens selection, not a new value.
   */
  selectionRequest?: string;
};

/**
 * The snap library — every 3–5 second original the user has shot, grouped by day.
 *
 * A tap plays a snap; there is no blur and nothing to unlock, because the app no
 * longer withholds what was just recorded. Selection mode is what turns the
 * library into a picking surface: confirming the picks starts a draft movie and
 * lands on it. The draft is the basket the 담기 트레이 used to be (2026-08-12) —
 * it persists, takes more snaps later through 스냅 더 넣기, and several can be
 * gathered at once — so the tray's extra stop (담기 → 스튜디오 → 새 무비) is
 * gone.
 *
 * The header carries one control — the mode switch — and one read-out: what the
 * library holds. 가져오기 is not up there; it leads the grid as a cell of its
 * own (`SnapImportCell`), where the snaps it produces will land. Two same-weight
 * header actions gave the mode switch no more standing than an import, and
 * taking one of them away on entering selection slid the other sideways under
 * the user's finger.
 *
 * Picking *into a movie* is a different screen — `/movie/[id]/add-snaps`, on the
 * root stack — even though it draws the same grid. It used to be this one under
 * `?for=<movieId>`, which meant a movie screen had to push a tab route: that
 * mounts a second copy of the tab navigator over the movie, and the tab
 * navigator then answers the confirming `back` by switching tabs instead of
 * returning to the movie the user came from.
 */
export function SnapsPage({ startSelecting, selectionRequest }: SnapsPageProps) {
  const theme = useTheme();
  const router = useRouter();
  const topInset = useTopContentInset();
  const tabBarHeight = useTabBarHeight();
  const { days, totalCount, totalDurationSec, isHydrated } = useSnapDays();
  const { startMovieFromSnaps } = useComposeMovie();
  const { deleteSnaps, deleteFromDevice, deletingIds, errorMessage, clearError } = useDeleteSnaps();
  const { restoreSnaps, restoringIds } = useRestoreSnaps();
  // The notice after a delete everywhere: what went, and the server copies a
  // 되돌리기 can bring back (SNAP-20).
  const [deleted, setDeleted] = useState<{ message: string; videoIds: string[] }>();
  const albumSave = useSaveSnapToAlbum();
  const syncEntries = useSnapSyncEntries();
  const setTabBarHidden = useSetTabBarHidden();
  const isFocused = useIsFocused();
  const failedUploadCount = useFailedUploadCount();
  const retryFailedUploads = useRetryFailedUploads();

  // Re-tapping the 스냅 tab returns to today; switching tabs keeps the day the
  // user had scrolled to. Selection mode takes the tab bar away entirely, so
  // there is no tab to re-tap while picks are in progress.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const [selecting, setSelecting] = useState(startSelecting !== undefined);
  // Selecting from the library itself (선택, a long press) is for a new movie;
  // only the studio's 자동 편집 row asks for the draft.
  const [purpose, setPurpose] = useState<SelectionPurpose>(startSelecting ?? 'movie');
  // The draft's cap is the app's own until the server names a lower one
  // (`TOO_MANY_SNAPS`); the picking follows whichever holds.
  const {
    state: draftState,
    start: startDraft,
    reset: resetDraft,
    limit: draftLimit,
  } = useEditDraft();
  const capacity = purpose === 'draft' ? draftLimit : MovieSnapLimit;
  const [playing, setPlaying] = useState<Snap>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteOpenedAt, setDeleteOpenedAt] = useState(0);
  const [importError, setImportError] = useState<string>();
  // The bar reports its real height (it varies with the safe-area inset, the
  // font scale, and the notice line); the estimate only covers the frames
  // before the first layout.
  const [selectionBarHeight, setSelectionBarHeight] = useState(SelectionBarRoomEstimate);

  // A new movie starts empty, so nothing in the library is "held" here — unlike
  // a movie's picker, where the movie's own cuts are.
  const { picked, notice, toggle, drop, clear, reset, announce } = useSnapPicking({
    heldIds: NoHeldIds,
    heldCount: 0,
    capacity,
    describeRefusal: () =>
      purpose === 'draft'
        ? `자동 편집에는 스냅 ${draftLimit}개까지 넣을 수 있어요.`
        : `한 편에는 스냅 ${MovieSnapLimit}개까지 들어가요.`,
  });

  const impact = useMovieDeleteImpact(deleteOpen ? picked : EmptySelection);
  const expiredIds = useExpiredSnapIds();

  // A snap whose file is only the server's copy plays from that copy, fetched on
  // first play; the player opens at once and says so while it is on its way.
  // Once the copy has expired there is nothing left to fetch, so the player says
  // that instead of retrying a download that cannot succeed.
  const playingExpired = playing !== undefined && expiredIds.has(playing.id);
  const playingGone = playing !== undefined && playingExpired && !isSnapFileLocal(playing);
  const playingSnaps = useMemo(
    () => (playing && !playingGone ? [playing] : []),
    [playing, playingGone],
  );
  const playingFile = useSnapFiles(playingSnaps);
  const playingUri =
    playing && !playingGone && !playingFile.fetching && !playingFile.failed
      ? playing.uri
      : undefined;
  const playingPlaceholder = !playing
    ? undefined
    : playingGone
      ? { text: '보관 기간이 끝나 볼 수 없어요' }
      : playingFile.failed
        ? {
            text: '스냅을 불러오지 못했어요',
            actionLabel: '다시 시도',
            onAction: playingFile.retry,
          }
        : playingFile.fetching
          ? { text: '불러오는 중…' }
          : undefined;
  // The user's own copy (SNAP-17): offered for every snap that still has a file
  // somewhere — here, or the server's to fetch.
  const playingAlbum =
    playing && !playingGone
      ? playerAlbumAction(albumSave.stateOf(playing.id), {
          save: () => void albumSave.save(playing),
          openSettings: () => void Linking.openSettings(),
        })
      : undefined;
  const closePlayer = () => {
    setPlaying(undefined);
    albumSave.reset();
  };

  // The picks the server still keeps can be deleted from this device only
  // (SNAP-19); the sheet asks where to delete only when there are some.
  const pickedSnaps = useMemo(() => {
    const byId = new Map(days.flatMap((day) => day.snaps).map((snap) => [snap.id, snap]));
    return picked.flatMap((snapId) => byId.get(snapId) ?? []);
  }, [days, picked]);
  // Judged at the moment the sheet opened: a kept copy can run out while the
  // page stays mounted, and the delete itself asks again when it runs.
  const deviceOnlySnaps = useMemo(
    () =>
      pickedSnaps.filter((snap) => canDeleteFromDevice(snap, syncEntries[snap.id], deleteOpenedAt)),
    [pickedSnaps, syncEntries, deleteOpenedAt],
  );
  const deviceOnly: DeviceOnlyDelete | undefined =
    deviceOnlySnaps.length > 0
      ? { count: deviceOnlySnaps.length, keptUntil: keptUntilOf(deviceOnlySnaps, syncEntries) }
      : undefined;
  // What a delete everywhere would leave in 최근 삭제, judged at the same moment.
  const restorablePicks = useMemo(
    () =>
      pickedSnaps.flatMap((snap) => {
        const copy = restorableAfterDelete(syncEntries[snap.id], deleteOpenedAt);
        return copy ? [{ snapId: snap.id, ...copy }] : [];
      }),
    [pickedSnaps, syncEntries, deleteOpenedAt],
  );
  const restorable: RestorableDelete | undefined =
    restorablePicks.length > 0
      ? {
          count: restorablePicks.length,
          until: restorablePicks.length === 1 ? restorablePicks[0].until : undefined,
        }
      : undefined;

  // Arriving with `?select=1` (the studio sending the user to pick for a new
  // movie) opens selection mode. The tab stays mounted across visits, so the initial
  // state is not enough — the prop change has to be noticed. Adjusted during
  // render rather than in an effect: React re-runs this render before painting,
  // so the screen never flashes out of selection mode first.
  const arrival = startSelecting ? `${startSelecting}:${selectionRequest ?? ''}` : undefined;
  const [lastArrival, setLastArrival] = useState(arrival);
  if (arrival !== lastArrival) {
    setLastArrival(arrival);
    if (startSelecting) {
      // Picks made for one purpose do not carry into the other: the caps differ,
      // and so does what confirming does with them.
      if (startSelecting !== purpose) reset();
      setPurpose(startSelecting);
      setSelecting(true);
    }
  }

  const confirmation =
    purpose === 'draft' ? draftConfirmation(draftState, picked, draftLimit) : undefined;
  const draftBusy = confirmation?.busy === true;

  const exitSelection = useCallback(() => {
    setSelecting(false);
    setPurpose('movie');
    reset();
    resetDraft();
  }, [reset, resetDraft]);

  // Android hardware back leaves selection mode instead of leaving the tab.
  useEffect(() => {
    if (!selecting) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // Mid-request, back is held: leaving would still open the movie it makes.
      if (!draftBusy) exitSelection();
      return true;
    });
    return () => subscription.remove();
  }, [selecting, exitSelection, draftBusy]);

  // Selection swaps the bottom chrome: the tab bar and the capture button out,
  // the SnapSelectionBar in. The navigator paints its bar above every scene, so
  // without this the tab items and the capture button cover the selection bar's
  // actions and take the taps aimed at them.
  //
  // Derived from `selecting` rather than flipped at each enter and exit, since
  // selection can also begin during render (the `?select=1` arrival below): one
  // effect covers every path in and out, and its cleanup always puts the bar
  // back. Focus belongs in the condition, not just the cleanup — this tab stays
  // mounted if something navigates away mid-selection, and a hidden bar on a
  // screen whose selection bar is not on display would leave the app with no
  // bottom chrome at all. Returning re-hides it, so the picks survive the trip.
  useEffect(() => {
    if (!selecting || !isFocused) return;
    setTabBarHidden(true);
    return () => setTabBarHidden(false);
  }, [selecting, isFocused, setTabBarHidden]);

  const handlePress = (snap: Snap) => {
    // The draft is being made from these picks; changing them now would open a
    // movie the screen no longer describes.
    if (selecting && draftBusy) return;
    if (selecting) toggle(snap.id);
    else setPlaying(snap);
  };

  const handleLongPress = (snap: Snap) => {
    if (selecting) return;
    setSelecting(true);
    toggle(snap.id);
  };

  // Extraction — cutting snaps out of a longer gallery video — is its own
  // full-screen visit (`/extract`); this only chooses the source. The system
  // photo picker needs no permission, and backing out of it goes nowhere.
  const openExtract = async () => {
    try {
      const picked = await pickVideoFromLibrary();
      if (!picked) return;
      setImportError(undefined);
      router.push({
        pathname: '/extract',
        params: {
          source: picked.uri,
          ...(picked.durationSec !== undefined ? { duration: String(picked.durationSec) } : {}),
        },
      });
    } catch {
      setImportError('영상을 불러오지 못했어요. 다시 시도해 주세요.');
    }
  };

  const confirmPicks = () => {
    // Selection here also deletes, so an expired snap may be picked — but a
    // movie is made from the server's copies, and its copy is gone (SNAP-12).
    // It is taken out of the picks, which leaves the rest ready to confirm.
    const expiredPicks = picked.filter((snapId) => expiredIds.has(snapId));
    if (expiredPicks.length > 0) {
      drop(expiredPicks);
      announce(ExpiredSnapRefusal);
      return;
    }
    // The edit draft asks the server first; the bar shows it working, and the
    // movie it makes opens once the answer is in.
    if (confirmation?.action === 'draft') {
      void startDraft(picked).then((movie) => {
        if (!movie) return;
        exitSelection();
        router.push(movieHref(movie.id));
      });
      return;
    }
    // The draft is where the picks land, so open it — the cap was enforced pick
    // by pick, so a non-empty selection always makes a movie. (Past today's edit
    // drafts the hand-made movie is offered, and only for picks that fit one.)
    const movie = startMovieFromSnaps(picked);
    if (!movie) return;
    exitSelection();
    router.push(movieHref(movie.id));
  };

  const confirmDelete = async () => {
    const targets = days
      .flatMap((day) => day.snaps)
      .filter((snap) => picked.includes(snap.id))
      .map((snap) => ({ id: snap.id, uri: snap.uri }));

    // Read before the delete retires the sync entries they come from.
    const copies = new Map(restorablePicks.map((pick) => [pick.snapId, pick.videoId]));
    const deletedIds = await deleteSnaps(targets);
    const undoable = deletedIds.flatMap((snapId) => copies.get(snapId) ?? []);
    if (undoable.length > 0) {
      setDeleted({ message: `스냅 ${deletedIds.length}개를 삭제했어요`, videoIds: undoable });
    }
    if (deletedIds.length === targets.length) {
      setDeleteOpen(false);
      exitSelection();
    } else {
      // Some files survived; keep the sheet open with its error and drop the
      // ones that did go, so a retry only targets what is left.
      drop(deletedIds);
    }
  };

  const confirmDeleteFromDevice = async () => {
    const targets = deviceOnlySnaps;
    const removedIds = await deleteFromDevice(targets);
    // Every file that could go is gone; the snaps stay in the library either way.
    drop(removedIds);
    if (removedIds.length < targets.length) return; // The sheet stays open with its error.
    setDeleteOpen(false);
    const untouched = picked.length - removedIds.length;
    if (untouched === 0) exitSelection();
    else announce(`스냅 ${untouched}개는 이 기기에서만 삭제할 수 없어 그대로 뒀어요.`);
  };

  const undoDelete = async () => {
    if (!deleted) return;
    const outcome = await restoreSnaps(deleted.videoIds);
    if (outcome.restored.length > 0) requestSnapReconcile();
    setDeleted({
      message:
        outcome.restored.length === deleted.videoIds.length
          ? `스냅 ${outcome.restored.length}개를 되돌렸어요`
          : '되돌리지 못했어요. 최근 삭제에서 되살릴 수 있어요.',
      videoIds: [],
    });
  };

  const closeDelete = () => {
    setDeleteOpen(false);
    clearError();
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView
        ref={scrollRef}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Spacing.six + topInset,
            paddingBottom: Spacing.seven + (selecting ? selectionBarHeight : tabBarHeight),
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <ThemedText type="title">스냅</ThemedText>
            {totalCount > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={selecting ? '선택 취소' : '스냅 선택'}
                // Leaving mid-request would still open the movie it makes.
                accessibilityState={{ disabled: draftBusy }}
                disabled={draftBusy}
                hitSlop={12}
                onPress={() => (selecting ? exitSelection() : setSelecting(true))}
                style={styles.headerAction}
              >
                <ThemedText selectable={false} type="smallBold" themeColor="primary">
                  {selecting ? '취소' : '선택'}
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.stateRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {totalCount}개 · {formatDuration(totalDurationSec)}
            </ThemedText>
          </View>
        </View>

        {importError ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setImportError(undefined)}
            style={[
              styles.notice,
              { borderColor: theme.danger, backgroundColor: theme.warmSurface },
            ]}
          >
            <ThemedText type="small">{importError}</ThemedText>
          </Pressable>
        ) : null}

        {/* While selecting, refusals show in the selection bar instead — the
            user's eye and thumb are down there, and a block appearing up here
            would shift the grid they are picking from. */}
        {notice && !selecting ? (
          <View
            style={[
              styles.notice,
              { borderColor: theme.border, backgroundColor: theme.warmSurface },
            ]}
          >
            <ThemedText type="small">{notice}</ThemedText>
          </View>
        ) : null}

        {failedUploadCount > 0 ? (
          <View
            style={[
              styles.notice,
              styles.uploadNotice,
              { borderColor: theme.danger, backgroundColor: theme.warmSurface },
            ]}
          >
            <ThemedText type="small" style={styles.uploadNoticeText}>
              스냅 {failedUploadCount}개를 올리지 못했어요.
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="다시 올리기"
              hitSlop={12}
              onPress={retryFailedUploads}
            >
              <ThemedText selectable={false} type="smallBold" themeColor="primary">
                다시 올리기
              </ThemedText>
            </Pressable>
          </View>
        ) : null}

        <SnapDayGrid
          days={days}
          selecting={selecting}
          picked={picked}
          heldIds={NoHeldIds}
          onPress={handlePress}
          onLongPress={handleLongPress}
          // Held back until the store has read itself back from disk, so the
          // tile does not stand alone for a frame in a library that is only
          // hydrating. During selection the grid keeps the cell and disables
          // it — unmounting it here shifted the whole leading row one cell
          // over under the user's finger.
          onImport={isHydrated ? () => void openExtract() : undefined}
        />

        {/* Deleted everywhere is not gone at once: 최근 삭제 keeps what the
            server held until its retention ends (SNAP-20). Always offered,
            quietly, at the end of the library — whether anything waits there
            is the next screen's to say. */}
        {!selecting ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="최근 삭제"
            onPress={() => router.push('/recently-deleted')}
            style={({ pressed }) => [styles.trashRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <ThemedText selectable={false} type="small" themeColor="textSecondary">
              최근 삭제
            </ThemedText>
          </Pressable>
        ) : null}
      </ScrollView>

      {selecting ? (
        <SnapSelectionBar
          selectedCount={picked.length}
          heldCount={0}
          capacity={capacity}
          targetLabel={purpose === 'draft' ? '자동 편집' : '새 무비'}
          confirmLabel={confirmation?.label ?? '이 스냅으로 새 무비'}
          notice={notice ?? confirmation?.notice}
          busy={confirmation?.busy}
          confirmDisabled={confirmation?.disabled}
          onClear={clear}
          onConfirm={confirmPicks}
          onDelete={() => {
            setDeleteOpenedAt(Date.now());
            setDeleteOpen(true);
          }}
          onHeight={setSelectionBarHeight}
        />
      ) : null}

      <VideoPlayerModal
        uri={playingUri}
        placeholder={playingPlaceholder}
        closeLabel="스냅 닫기"
        edgeLabel={playing ? formatSeconds(playing.durationSec) : undefined}
        caption={playingAlbum?.problem ?? (playingExpired ? '보관 기간이 끝났어요' : undefined)}
        action={playingAlbum?.action}
        onClose={closePlayer}
      />

      <Toast
        message={deleted?.message}
        action={
          deleted && deleted.videoIds.length > 0
            ? {
                label: '되돌리기',
                accessibilityLabel: `삭제한 스냅 ${deleted.videoIds.length}개 되돌리기`,
                disabled: restoringIds.size > 0,
                onPress: () => void undoDelete(),
              }
            : undefined
        }
        onDismiss={() => setDeleted(undefined)}
        bottomOffset={tabBarHeight + Spacing.three}
      />

      <SnapDeleteDialog
        visible={deleteOpen}
        count={picked.length}
        impact={impact}
        deviceOnly={deviceOnly}
        restorable={restorable}
        isDeleting={deletingIds.size > 0}
        errorMessage={errorMessage}
        onCancel={closeDelete}
        onConfirm={confirmDelete}
        onConfirmDeviceOnly={() => void confirmDeleteFromDevice()}
      />
    </View>
  );
}

/** Stable reference, so the impact hook does not recompute on every render. */
const EmptySelection: string[] = [];

/** When a lone snap's kept copy ends, for the sheet to name; several get no date. */
function keptUntilOf(
  snaps: readonly Snap[],
  entries: Readonly<Record<string, SnapSyncEntry>>,
): number | undefined {
  if (snaps.length !== 1) return undefined;
  const entry = entries[snaps[0].id];
  return entry?.status === 'uploaded' ? entry.expiresAt : undefined;
}

/** A movie is made from the server's copies, and this snap's is gone (SNAP-12). */
const ExpiredSnapRefusal = '보관 기간이 끝난 스냅은 무비에 넣을 수 없어요.';

/** A new movie holds nothing yet, so no snap in the library reads as 담김. */
const NoHeldIds: ReadonlySet<string> = new Set();

// What the selection bar roughly takes at the bottom of the scroll — only the
// starting value; the bar reports its real height on layout.
const SelectionBarRoomEstimate = 132;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.five,
  },
  header: { gap: Spacing.half },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  headerAction: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  notice: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    padding: Spacing.three,
  },
  uploadNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  uploadNoticeText: { flexShrink: 1 },
  trashRow: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
