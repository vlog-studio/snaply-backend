import { useIsFocused, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MovieSnapLimit } from '@/entities/movie';
import { useFailedUploadCount, useRetryFailedUploads, type Snap } from '@/entities/snap';
import { useComposeMovie } from '@/features/compose-movie';
import { useDeleteSnaps } from '@/features/delete-snap';
import { formatDuration, formatSeconds } from '@/shared/lib/datetime';
import { movieHref } from '@/shared/routes';
import { pickVideoFromLibrary } from '@/shared/lib/video-picker';
import { useSetTabBarHidden } from '@/shared/ui/tab-bar-chrome';
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

import { useMovieDeleteImpact } from '../model/use-movie-delete-impact';
import { SnapDeleteDialog } from './snap-delete-dialog';

export type SnapsPageProps = {
  /** `?select=1` — the studio sends the user here to pick for a new movie. */
  startSelecting?: boolean;
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
export function SnapsPage({ startSelecting = false }: SnapsPageProps) {
  const theme = useTheme();
  const router = useRouter();
  const topInset = useTopContentInset();
  const tabBarHeight = useTabBarHeight();
  const { days, totalCount, totalDurationSec, isHydrated } = useSnapDays();
  const { startMovieFromSnaps } = useComposeMovie();
  const { deleteSnaps, deletingIds, errorMessage, clearError } = useDeleteSnaps();
  const setTabBarHidden = useSetTabBarHidden();
  const isFocused = useIsFocused();
  const failedUploadCount = useFailedUploadCount();
  const retryFailedUploads = useRetryFailedUploads();

  // Re-tapping the 스냅 tab returns to today; switching tabs keeps the day the
  // user had scrolled to. Selection mode takes the tab bar away entirely, so
  // there is no tab to re-tap while picks are in progress.
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const [selecting, setSelecting] = useState(startSelecting);
  const [playing, setPlaying] = useState<Snap>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [importError, setImportError] = useState<string>();
  // The bar reports its real height (it varies with the safe-area inset, the
  // font scale, and the notice line); the estimate only covers the frames
  // before the first layout.
  const [selectionBarHeight, setSelectionBarHeight] = useState(SelectionBarRoomEstimate);

  // A new movie starts empty, so nothing in the library is "held" here — unlike
  // a movie's picker, where the movie's own cuts are.
  const { picked, notice, toggle, drop, clear, reset } = useSnapPicking({
    heldIds: NoHeldIds,
    heldCount: 0,
    capacity: MovieSnapLimit,
    describeRefusal: () => `한 편에는 스냅 ${MovieSnapLimit}개까지 들어가요.`,
  });

  const impact = useMovieDeleteImpact(deleteOpen ? picked : EmptySelection);

  // Arriving with `?select=1` (the studio sending the user to pick for a new
  // movie) opens selection mode. The tab stays mounted across visits, so the initial
  // state is not enough — the prop change has to be noticed. Adjusted during
  // render rather than in an effect: React re-runs this render before painting,
  // so the screen never flashes out of selection mode first.
  const [lastStartSelecting, setLastStartSelecting] = useState(startSelecting);
  if (startSelecting !== lastStartSelecting) {
    setLastStartSelecting(startSelecting);
    if (startSelecting) setSelecting(true);
  }

  const exitSelection = useCallback(() => {
    setSelecting(false);
    reset();
  }, [reset]);

  // Android hardware back leaves selection mode instead of leaving the tab.
  useEffect(() => {
    if (!selecting) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      exitSelection();
      return true;
    });
    return () => subscription.remove();
  }, [selecting, exitSelection]);

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
    // The draft is where the picks land, so open it — the cap was enforced pick
    // by pick, so a non-empty selection always makes a movie.
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

    const deletedIds = await deleteSnaps(targets);
    if (deletedIds.length === targets.length) {
      setDeleteOpen(false);
      exitSelection();
    } else {
      // Some files survived; keep the sheet open with its error and drop the
      // ones that did go, so a retry only targets what is left.
      drop(deletedIds);
    }
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
              스냅 {failedUploadCount}개를 업로드하지 못했어요.
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="업로드 다시 시도"
              hitSlop={12}
              onPress={retryFailedUploads}
            >
              <ThemedText selectable={false} type="smallBold" themeColor="primary">
                다시 시도
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
      </ScrollView>

      {selecting ? (
        <SnapSelectionBar
          selectedCount={picked.length}
          heldCount={0}
          capacity={MovieSnapLimit}
          targetLabel="새 무비"
          confirmLabel="이 스냅으로 새 무비"
          notice={notice}
          onClear={clear}
          onConfirm={confirmPicks}
          onDelete={() => setDeleteOpen(true)}
          onHeight={setSelectionBarHeight}
        />
      ) : null}

      <VideoPlayerModal
        uri={playing?.uri}
        closeLabel="스냅 닫기"
        edgeLabel={playing ? formatSeconds(playing.durationSec) : undefined}
        onClose={() => setPlaying(undefined)}
      />

      <SnapDeleteDialog
        visible={deleteOpen}
        count={picked.length}
        impact={impact}
        isDeleting={deletingIds.size > 0}
        errorMessage={errorMessage}
        onCancel={closeDelete}
        onConfirm={confirmDelete}
      />
    </View>
  );
}

/** Stable reference, so the impact hook does not recompute on every render. */
const EmptySelection: string[] = [];

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
});
