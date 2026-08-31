import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isAiArranged, movieStyleLabel, useDeleteMovie } from '@/entities/movie';
import { useComposeMovie, useRenderSource } from '@/features/compose-movie';
import { RenameMovieSheet } from '@/features/rename-movie';
import { useShareMovie } from '@/features/share-movie';
import { BackBar } from '@/shared/ui/back-bar';
import { MaxContentWidth, Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { toCutIndex, toPlaybackCuts, toPlaybackIndex } from '../model/playback-cuts';
import type { TimelinePlayhead } from '../model/timeline-layout';
import { useMovieCuts } from '../model/use-movie-cuts';
import { useWatchCuts } from '../model/watch-cuts';
import { CancelRunControl } from './cancel-run-control';
import { CutInspector } from './cut-inspector';
import { CutPlayer, type CutPlayerHandle } from './cut-player';
import { DetailSheet } from './detail-sheet';
import { EditExitSheet } from './edit-exit-sheet';
import { GenerateFooter } from './generate-footer';
import { GenerationProgress } from './generation-progress';
import { MovieActionsSheet } from './movie-actions-sheet';
import { MovieWatch } from './movie-watch';
import { CutsRefusalMessages, generationRefusalMessage, RefusalNotice } from './refusal-notice';
import { StylePickerSheet } from './style-picker-sheet';
import { TimelineStrip } from './timeline-strip';

export type MoviePageProps = {
  movieId?: string;
};

/**
 * One movie, at whatever point of its life it is at — laid out as a timeline
 * studio rather than a long scroll.
 *
 * The stage (the player) is always on screen, the cuts run under it as a
 * timeline, and the selected cut's controls stand in for the footer's generate
 * button while a cut is held, so an edit and its result are one glance apart
 * instead of a scroll apart — and taking or releasing a cut swaps a fixed
 * slot's occupant instead of adding and removing a row. Edits commit
 * as they land and the transport under the stage walks them back and forward
 * (되돌리기/복원) — there is no staged copy and no save button. Style and 세부
 * live in sheets opened from chips — settings are visited, cuts are worked on.
 *
 * The stage gets the height every other zone leaves over, so nothing here is
 * allowed to cost a row twice. The movie's name and its rename action ride the
 * back bar; the status line under the title and the footer's summary line are
 * both gone, because between them they only restated what the zones already
 * show — the strip draws the cuts on a seconds ruler, the chips carry the
 * current style and track, the ring says a job is running, and the footer's
 * notice says why one failed.
 *
 * There is still no separate editor screen and no separate playback screen,
 * because there is no separate object: a movie is picked, run, watched, fixed,
 * and run again. What changes with the status is what fills the stage and what
 * the footer offers:
 *
 * - `draft` — the stage previews the cuts, and the footer runs the first job.
 * - `generating` — the stage holds the progress ring; everything else is a
 *   read-out except the footer's 만들기 취소. Leaving is expected.
 * - `ready` — **watch mode**: the stage plays the render's own composition and
 *   every edit tool is out of sight; the ⋯ sheet holds 편집·이름 바꾸기·공유·
 *   삭제. "무비 편집하기" brings the studio (this screen's other face) back,
 *   with the same controls plus "이 구성으로 다시 만들기" — and its ← undoes
 *   the switch rather than the visit, back to watch mode, asking about this
 *   visit's drift on the way out (`EditExitSheet`).
 * - `failed` — the studio controls, led by the reason and a retry in the
 *   footer.
 */
export function MoviePage({ movieId }: MoviePageProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { saveStyle, setArranger, startGeneration, cancelGeneration } = useComposeMovie();
  const list = useMovieCuts(movieId);
  const { movie, cuts, totalSec, canEdit, refusal, editedSinceRender, editCount } = list;
  // Resolved once here and handed to both consumers: the watch stage plays
  // this address and 공유 downloads it, and the two must never disagree about
  // which file "the render" is.
  const renderSource = useRenderSource(movie);
  const sharing = useShareMovie(movie, renderSource);
  const deleteMovie = useDeleteMovie();
  const watchCuts = useWatchCuts(movie);

  const [renaming, setRenaming] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  // A ready movie opens as something to watch; the studio is asked for ("무비
  // 편집하기" in the ⋯ sheet) rather than being the screen's default face.
  // Cleared when a run starts, so the next result opens as a result again.
  const [editing, setEditing] = useState(false);
  // The back-out question for a finished movie's studio (`EditExitSheet`).
  const [exitAsking, setExitAsking] = useState(false);
  // The refusal already in the user's words: one of them (`rejected`) is worded
  // by the backend, so the message is resolved where the outcome arrives rather
  // than by the footer that draws it.
  const [refusalMessage, setRefusalMessage] = useState<string>();

  // Which cut is being *worked on* — the strip's held clip and the inspector's
  // subject. Only an explicit pick sets it (a strip tap, or a move carrying its
  // own cut along); playback and scrubbing move the playhead below and leave
  // this alone, because passing over a cut is not choosing it. Clamped rather
  // than reset when the list shrinks, so removing a cut holds its neighbor
  // instead of jumping home. Opens at -1 — nothing held, so the footer's slot
  // offers the run rather than one cut's edit controls.
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const playerRef = useRef<CutPlayerHandle>(null);
  const selected = cuts.length > 0 ? Math.min(selectedIndex, cuts.length - 1) : -1;
  // Mirrors the stage, for the transport's play/pause button.
  const [isPlaying, setIsPlaying] = useState(false);
  // Where the stage is, for the strip's playhead — the *playback* position, kept
  // apart from the selection above. The player reports it (`onProgress`, which
  // carries the cut it is on, so landing on a cut and running through one both
  // arrive here); a strip tap or scrub sets it up front so the timeline settles
  // on the picked moment without waiting for the seek to land, and so a dead cut
  // — which the stage cannot follow — still moves the playhead.
  const [playhead, setPlayhead] = useState<TimelinePlayhead>({ index: 0, secIntoCut: 0 });

  // A direct link can land here with nothing behind it, and the screen has no
  // navigation bar to fall back on — so going back means the studio.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // Watch mode's "무비 편집하기" switches faces in place, so the studio's back
  // must leave in place too: on a finished movie it returns to watch mode
  // instead of popping the route. Drift made *since this studio entry* gets one
  // question on the way out (`EditExitSheet`); drift already answered for — an
  // earlier entry's, or an earlier visit's — is watch mode's standing notice
  // instead, so peeking into the studio and backing out is never re-asked.
  const studioOnReady = movie?.status === 'ready' && editing;
  const editsAtStudioEntry = useRef(0);
  const openStudio = () => {
    editsAtStudioEntry.current = editCount;
    // Same opening as a first visit: nothing held, so the footer offers the run
    // rather than the cut controls a previous visit left behind.
    setSelectedIndex(-1);
    setEditing(true);
  };
  const closeStudio = () => {
    setExitAsking(false);
    setEditing(false);
  };
  const leaveStudio = () => {
    if (editedSinceRender && editCount > editsAtStudioEntry.current) setExitAsking(true);
    else closeStudio();
  };

  // Android's hardware back follows the same rule as the bar's ←: out of the
  // studio face first, off the screen only from watch mode.
  useEffect(() => {
    if (!studioOnReady) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editedSinceRender && editCount > editsAtStudioEntry.current) setExitAsking(true);
      else {
        setExitAsking(false);
        setEditing(false);
      }
      return true;
    });
    return () => subscription.remove();
  }, [studioOnReady, editedSinceRender, editCount]);

  if (!movie) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <BackBar onPress={goBack} />
        <View style={[styles.screen, styles.centered]}>
          <ThemedText type="heading">무비를 찾을 수 없어요</ThemedText>
          <ThemedText themeColor="textSecondary">이미 사라졌거나 잘못된 주소예요.</ThemedText>
        </View>
      </View>
    );
  }

  const playbackCuts = toPlaybackCuts(cuts);
  const isGenerating = movie.status === 'generating';
  const viewing = movie.status === 'ready' && !editing;
  // Worded exactly as the 세부 sheet words it, since the chip is that row's
  // read-out standing outside the sheet.
  const arrangementLabel = isAiArranged(movie) ? '찍은 시각 순' : '지금 순서';

  // The picker is a screen of its own on the root stack, not the Snap tab: a
  // pushed tab route brings a whole second tab navigator with it, and that
  // navigator — not the stack — is what would answer the confirming `back`.
  const addSnaps = () =>
    router.push({ pathname: '/movie/[id]/add-snaps', params: { id: movie.id } });

  // Asynchronous now: the run is queued on the backend and the movie only enters
  // `generating` once there is a job to follow, so a refusal can be reported
  // instead of having to be undone.
  const runGeneration = async () => {
    const outcome = await startGeneration(movie.id);
    setRefusalMessage(
      outcome.refused
        ? generationRefusalMessage(outcome.refused, outcome.message, outcome.shortfall)
        : undefined,
    );
    // The result of this run should open as a result: back to watch mode when
    // the job lands on `ready`.
    if (!outcome.refused) setEditing(false);
  };

  // A strip tap is the one act that picks a cut to work on: it takes the cut and
  // shows its frame, paused — playing is the transport's job. A dead cut is
  // still selectable — the inspector is where it is removed — the stage just
  // cannot follow it there.
  const selectCut = (index: number) => {
    setSelectedIndex(index);
    setPlayhead({ index, secIntoCut: 0 });
    const playbackIndex = toPlaybackIndex(cuts, index);
    if (playbackIndex !== undefined) playerRef.current?.jumpTo(playbackIndex);
  };

  // A tap on the strip's empty space lets go of the cut: the trim handles
  // retract and the inspector row closes. The playhead stays put — releasing
  // a cut is not a seek, and nothing re-takes the cut on its own.
  const deselectCut = () => setSelectedIndex(-1);

  // A strip drag come to rest: whatever moment stopped under the playhead
  // becomes the playback position, paused on its frame — playing stays the
  // transport's job. The selection is left alone: scrubbing is looking through
  // the movie, and every cut the finger passed would otherwise end up held. A
  // dead cut can be landed on but not shown; the playhead still moves there.
  const scrubTo = (target: TimelinePlayhead) => {
    if (target.index < 0) return;
    setPlayhead(target);
    const playbackIndex = toPlaybackIndex(cuts, target.index);
    if (playbackIndex !== undefined) playerRef.current?.seekTo(playbackIndex, target.secIntoCut);
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* The movie names itself on the bar rather than in a row of its own —
          this screen spends every dp it can on the stage. Watch mode's one
          trailing act is the ⋯ sheet; the studio keeps the rename pencil. */}
      <BackBar
        onPress={studioOnReady ? leaveStudio : goBack}
        title={movie.title}
        action={
          viewing
            ? { icon: 'ellipsis-horizontal', label: '더보기', onPress: () => setActionsOpen(true) }
            : { icon: 'pencil', label: '무비 이름 바꾸기', onPress: () => setRenaming(true) }
        }
      />

      {viewing ? (
        <MovieWatch
          movie={movie}
          cuts={watchCuts}
          renderSource={renderSource}
          sharing={sharing}
          editedSinceRender={editedSinceRender}
          onReviewEdits={openStudio}
        />
      ) : (
        <>
          {/* The stage: the player on an editable movie, the ring under a job. It
          takes whatever height the timeline below leaves over. */}
          <View style={styles.stage}>
            {isGenerating ? (
              <ScrollView contentContainerStyle={styles.progressScroll}>
                <GenerationProgress movie={movie} />
              </ScrollView>
            ) : playbackCuts.length > 0 ? (
              <View style={styles.playerBox}>
                <CutPlayer
                  ref={playerRef}
                  cuts={playbackCuts}
                  editIndex={selected >= 0 ? toPlaybackIndex(cuts, selected) : undefined}
                  onProgress={(playbackIndex, secIntoCut) =>
                    setPlayhead({ index: toCutIndex(cuts, playbackIndex), secIntoCut })
                  }
                  onPlayingChange={setIsPlaying}
                  style={styles.player}
                />
                {/* What this stage is, in one word: the raw cuts, without the
                    grading, music, or subtitles the run will add. A sentence
                    saying so would be the screen explaining itself; the badge
                    is the state, and it sits opposite the player's own 컷 n/N
                    so the two never collide. */}
                <View style={[styles.previewTag, { backgroundColor: theme.media }]}>
                  <ThemedText selectable={false} type="note" style={styles.previewTagText}>
                    미리보기
                  </ThemedText>
                </View>
              </View>
            ) : (
              <View style={[styles.empty, { borderColor: theme.border }]}>
                <ThemedText type="heading">재생할 컷이 없어요</ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.centerText}>
                  이 무비가 쓰던 스냅 원본이 모두 지워졌어요.
                </ThemedText>
              </View>
            )}
          </View>

          {/* The transport, right under the stage: play on the left, the edit
          history on the right — watching and undoing are both about what the
          stage just showed. */}
          {!isGenerating ? (
            <View style={styles.transport}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? '일시정지' : '재생'}
                accessibilityState={{ disabled: playbackCuts.length === 0 }}
                disabled={playbackCuts.length === 0}
                onPress={() => playerRef.current?.togglePlayback()}
                style={[
                  styles.transportTool,
                  { borderColor: theme.border, opacity: playbackCuts.length === 0 ? 0.35 : 1 },
                ]}
              >
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color={theme.text} />
              </Pressable>

              {canEdit ? (
                <View style={styles.historyTools}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="되돌리기"
                    accessibilityState={{ disabled: !list.canUndo }}
                    disabled={!list.canUndo}
                    onPress={list.undo}
                    style={[
                      styles.transportTool,
                      { borderColor: theme.border, opacity: list.canUndo ? 1 : 0.35 },
                    ]}
                  >
                    <Ionicons name="arrow-undo" size={18} color={theme.text} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="복원하기"
                    accessibilityState={{ disabled: !list.canRedo }}
                    disabled={!list.canRedo}
                    onPress={list.redo}
                    style={[
                      styles.transportTool,
                      { borderColor: theme.border, opacity: list.canRedo ? 1 : 0.35 },
                    ]}
                  >
                    <Ionicons name="arrow-redo" size={18} color={theme.text} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

          <TimelineStrip
            cuts={cuts}
            selectedIndex={selected}
            playhead={playhead}
            isPlaying={isPlaying}
            canEdit={canEdit}
            onSelect={selectCut}
            onScrub={scrubTo}
            onDeselect={deselectCut}
            onTrim={list.trimCut}
            onAddSnaps={addSnaps}
          />

          <View style={styles.content}>
            {/* Settings are visited, cuts are worked on: the chips carry the current
            values so the sheets only need opening to change something. */}
            <View style={styles.chips}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`스타일 ${movieStyleLabel(movie.style)}`}
                onPress={() => setStyleOpen(true)}
                style={[styles.chip, { borderColor: theme.border }]}
              >
                <ThemedText selectable={false} type="smallBold">
                  스타일
                </ThemedText>
                <ThemedText selectable={false} type="small" themeColor="textSecondary">
                  {movieStyleLabel(movie.style)}
                </ThemedText>
              </Pressable>
              {/* The chip's second line is the one thing inside the sheet the
                  user can still change — since 배경 음악 left it (2026-08-13),
                  that is 순서 고정, read out in the sheet's own words. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`세부 설정, 컷 순서 ${arrangementLabel}`}
                onPress={() => setDetailOpen(true)}
                style={[styles.chip, { borderColor: theme.border }]}
              >
                <ThemedText selectable={false} type="smallBold">
                  세부
                </ThemedText>
                <ThemedText selectable={false} type="small" themeColor="textSecondary">
                  {arrangementLabel}
                </ThemedText>
              </Pressable>
            </View>
          </View>

          <View
            style={[
              styles.footer,
              {
                borderTopColor: theme.border,
                paddingBottom: insets.bottom + Spacing.three,
              },
            ]}
          >
            {/* An edit refused while the footer's own notices are hidden (a job
            owns the movie) still has to be answered somewhere. */}
            {isGenerating && refusal ? (
              <RefusalNotice message={CutsRefusalMessages[refusal]} />
            ) : null}

            {/* The one act a run offers: stopping it. Keyed by the job so a new
            run always opens on the resting button, not a previous run's
            half-answered confirm. */}
            {isGenerating ? (
              <CancelRunControl key={movie.job?.id} cancel={() => cancelGeneration(movie.id)} />
            ) : null}

            {isGenerating ? null : (
              <GenerateFooter
                movie={movie}
                cutCount={cuts.length}
                refusalMessage={refusalMessage}
                cutsRefusal={refusal}
                editedSinceRender={list.editedSinceRender}
                onRestoreCuts={list.restoreRenderCuts}
                sharing={sharing}
                onStart={runGeneration}
                // The selected cut's controls take the generate button's slot
                // rather than a row of their own: the slot's height is fixed, so
                // selecting and releasing a cut cannot resize the zones the stage
                // is sized against.
                inspector={
                  canEdit && selected >= 0 ? (
                    <CutInspector
                      cut={cuts[selected]}
                      index={selected}
                      count={cuts.length}
                      canRemove={cuts.length > 1}
                      onMove={(index, direction) => {
                        list.moveCut(index, direction);
                        setSelectedIndex(index + direction);
                      }}
                      onRemove={list.removeCut}
                      onResetTrim={list.resetTrim}
                      onDeselect={deselectCut}
                    />
                  ) : undefined
                }
              />
            )}
          </View>
        </>
      )}

      <MovieActionsSheet
        visible={actionsOpen}
        movie={movie}
        cutCount={watchCuts.length}
        totalSec={watchCuts.reduce((sum, cut) => sum + cut.usedSec, 0)}
        shareBlock={sharing.blocked}
        onEdit={() => {
          setActionsOpen(false);
          openStudio();
        }}
        onShare={() => {
          setActionsOpen(false);
          sharing.share();
        }}
        onConfirmDelete={() => {
          setActionsOpen(false);
          // Leave first: a deleted movie renders this screen's not-found state,
          // and the user should see the studio instead of that flash.
          goBack();
          deleteMovie(movie.id);
        }}
        onClose={() => setActionsOpen(false)}
      />

      <EditExitSheet
        visible={exitAsking}
        onRemake={() => {
          setExitAsking(false);
          // A refused start keeps the studio open with the refusal in the
          // footer — leaving would hide the answer to what was just asked.
          void runGeneration();
        }}
        onKeep={closeStudio}
        onDiscard={() => {
          list.restoreRenderCuts();
          closeStudio();
        }}
        onClose={() => setExitAsking(false)}
      />

      <StylePickerSheet
        visible={styleOpen}
        movie={movie}
        canEdit={canEdit}
        onChange={(patch) => saveStyle(movie.id, patch)}
        onClose={() => setStyleOpen(false)}
      />
      <DetailSheet
        visible={detailOpen}
        movie={movie}
        totalSec={totalSec}
        canEdit={canEdit}
        onChangeArranger={(locked) => setArranger(movie.id, locked ? 'user' : 'ai')}
        onClose={() => setDetailOpen(false)}
      />

      {/* The studio's ✎ — watch mode renames inside the ⋯ sheet instead, where
          a second Modal would be racing the first one's animation. Keyed by the
          movie so the field opens on the name that is stored now. */}
      <RenameMovieSheet
        key={`${movie.id}:${movie.title}`}
        visible={renaming}
        movieId={movie.id}
        title={movie.title}
        onClose={() => setRenaming(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.six,
  },
  stage: {
    flex: 1,
    minHeight: 160,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
  },
  // Height-bound: the stage hands the player its leftover height and the 9:16
  // ratio sets the width, so the timeline never gets pushed off screen.
  playerBox: { flex: 1, aspectRatio: 9 / 16, maxWidth: '100%' },
  player: { width: '100%', height: '100%' },
  previewTag: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  // Drawn over arbitrary footage, so plain white rather than a palette color.
  previewTagText: { color: '#FFFFFF' },
  progressScroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: Spacing.four },
  centerText: { textAlign: 'center' },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    padding: Spacing.five,
    gap: Spacing.two,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  chips: { flexDirection: 'row', gap: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.four,
    borderWidth: 1,
    borderRadius: Radius.pill,
  },
  footer: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  transport: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.two,
  },
  historyTools: { flexDirection: 'row', gap: Spacing.two },
  transportTool: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
