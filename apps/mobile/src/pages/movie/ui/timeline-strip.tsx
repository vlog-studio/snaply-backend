import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { MovieSnapLimit } from '@/entities/movie';
import { Radius, Spacing, useReducedMotion, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { PlaybackProgressIntervalSec } from '../model/playback-cuts';
import {
  TimelinePxPerSec,
  playheadAtX,
  playheadXPx,
  rulerTicks,
  timelineCutMetrics,
  type TimelineCutSize,
  type TimelinePlayhead,
} from '../model/timeline-layout';
import type { Cut } from '../model/use-movie-cuts';
import { TimelineCut, TimelineCutHeight } from './timeline-cut';

export type TimelineStripProps = {
  cuts: Cut[];
  /**
   * Which cut is being worked on — the held clip. -1 when none is; playback and
   * scrubbing do not set it, they move the playhead.
   */
  selectedIndex: number;
  /** Where the stage is right now — what the playhead points at. */
  playhead: TimelinePlayhead;
  /** Whether the stage is playing, which is what decides how the strip glides. */
  isPlaying: boolean;
  /** False while a job owns the movie — thumbs stay tappable, the add tile hides. */
  canEdit: boolean;
  onSelect: (index: number) => void;
  /**
   * A hand-drag of the strip come to rest: the moment now under the playhead,
   * for the stage to seek to. Never fired with an empty cut list.
   */
  onScrub: (playhead: TimelinePlayhead) => void;
  /** A settled trim-handle drag; the cut list holds it locally until a save. */
  onTrim: (index: number, startSec: number, endSec: number) => void;
  /** A tap on the strip's empty space — anywhere that is not a clip or a tile. */
  onDeselect: () => void;
  onAddSnaps: () => void;
};

const TickLabelWidth = 48;
const PlayheadWidth = 12;

/**
 * A drag released faster than this (points/ms, from the scroll event) keeps
 * going as momentum, so the scrub settles at `onMomentumScrollEnd` instead of
 * at the release.
 */
const ScrubMomentumMinVelocity = 0.05;

/** How long a jump — a strip tap, an edit landing — takes to settle. */
const JumpMs = 260;

/** The strip's scroll position, and whether the playhead currently owns it. */
type FollowState = {
  x: SharedValue<number>;
  active: SharedValue<boolean>;
};

type FollowInput = {
  /** Where the playhead sits, or `undefined` when there is nothing to point at. */
  targetX: number | undefined;
  playing: boolean;
  /**
   * True while a trim handle is down or the strip itself is being hand-scrolled:
   * the drag owns the axis, not the playhead.
   */
  dragging: boolean;
  reducedMotion: boolean;
  /** The last cut's right edge — the furthest the strip may be aimed. */
  stripWidth: number;
};

/**
 * Aims the strip's scroll at the playhead.
 *
 * A module-level function taking the shared values as arguments rather than a
 * closure in the component body: the React Compiler lint reads a shared value
 * handed to `useAnimatedReaction` as immutable and rejects every later `.value`
 * write, and this is the project's established way around it
 * (`docs/frameworks/animations-and-gestures.md`).
 */
function followPlayhead(follow: FollowState, input: FollowInput) {
  const { targetX, playing, dragging, reducedMotion, stripWidth } = input;
  if (targetX === undefined || dragging) {
    follow.active.value = false;
    return;
  }
  follow.active.value = true;
  if (reducedMotion) {
    follow.x.value = targetX;
    return;
  }
  // While playing, aim one report ahead and take exactly one report interval to
  // get there: each report then arrives as the glide it started lands, and the
  // strip moves at the speed the movie does instead of stepping four times a
  // second.
  follow.x.value = playing
    ? withTiming(Math.min(targetX + PlaybackProgressIntervalSec * TimelinePxPerSec, stripWidth), {
        duration: PlaybackProgressIntervalSec * 1000,
        easing: Easing.linear,
      })
    : withTiming(targetX, { duration: JumpMs, easing: Easing.out(Easing.cubic) });
}

/**
 * Re-arms the follow position at where the strip actually rests. The follow
 * position goes stale while a hand owns the axis (the strip moves, `follow.x`
 * does not), so resuming without this makes the resume animation start from
 * the pre-drag position — a visible jump back and re-glide. Module-level for
 * the same React Compiler reason as `followPlayhead`.
 */
function syncFollow(follow: FollowState, restX: number) {
  follow.x.value = restX;
}

/**
 * The movie as a timeline: every cut drawn as long as it plays, on one shared
 * seconds scale, under a ruler of second marks — running under a playhead that
 * does not move.
 *
 * **The playhead is fixed at the middle of the screen and the strip scrolls
 * under it**, the way an editing timeline works, rather than the strip standing
 * still while a marker travels along it. "Now" is therefore always in the same
 * place, and reading the movie is reading what is under one line instead of
 * hunting for a marker. That is what the half-screen of padding on each end is
 * for: the first and last moments of the movie have to be able to reach the
 * middle. Between the stage's position reports the playhead glides linearly over
 * exactly one report interval, so the motion is continuous rather than four
 * steps a second.
 *
 * The strip is also the scrubber: hand-scrolling it drags the movie under the
 * fixed playhead, and when the drag (and its momentum) comes to rest, whatever
 * moment stopped under the line is reported through `onScrub` for the stage to
 * seek to. While the hand is on the strip the playhead's own following is off —
 * the drag owns the axis — and it takes the axis back when the scrub settles.
 *
 * **Being played over is not being picked.** The playhead and the held clip are
 * two different things and only the first follows the stage: playing through the
 * movie, letting it run to the end, and dragging the strip past a cut all move
 * the playhead and leave the selection where it was. Only a tap on a clip takes
 * it. Merging the two meant the movie ending left its last cut held, and
 * scrubbing back to the front swapped that for the first — the user was handed
 * an edit target by watching.
 *
 * Tapping a clip selects the cut — the stage jumps there and the inspector below
 * picks it up — and the strip runs to that cut's start. The selected clip is
 * also where the cut's length is set: while editable it grows trim handles at
 * its edges (`TimelineCut`) and resizes under the drag, and the strip neither
 * scrolls nor follows while a handle is down, so the drag owns the axis. Tapping
 * the strip's empty space lets the cut go again (`onDeselect`), and so does
 * tapping the focused clip itself — the second tap folds the handles back in.
 * The toggle keys off the *focused* clip, not the selected one: while the stage
 * plays, the handles are folded away, so a tap there has to stay a jump. A cut
 * whose original was deleted keeps its clip (marked, selectable) — a cut the
 * user cannot see is a cut they cannot remove.
 */
export function TimelineStrip({
  cuts,
  selectedIndex,
  playhead,
  isPlaying,
  canEdit,
  onSelect,
  onScrub,
  onTrim,
  onDeselect,
  onAddSnaps,
}: TimelineStripProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const room = Math.max(MovieSnapLimit - cuts.length, 0);

  // True while a trim handle is down; the scroll hands the axis to the drag.
  const [trimming, setTrimming] = useState(false);
  // True from a hand-scroll's first move until it (and its momentum) rests;
  // the playhead's following stays off so the drag owns the axis.
  const [scrubbing, setScrubbing] = useState(false);

  // The held clip grows its trim handles only while the stage is stopped: a
  // handle is something to drag, and it cannot be dragged against a strip that
  // is gliding under the playhead. They come back when playback stops, on the
  // same cut — the selection itself is untouched by playing.
  const focusedIndex =
    canEdit && !isPlaying && selectedIndex >= 0 && cuts[selectedIndex]?.snap !== undefined
      ? selectedIndex
      : -1;
  const sizes: TimelineCutSize[] = cuts.map((cut) => ({
    usedSec: cut.usedSec,
    fullSec: cut.snap?.durationSec,
  }));
  const metrics = timelineCutMetrics(sizes, TimelinePxPerSec);
  const lastMetric = metrics.length > 0 ? metrics[metrics.length - 1] : undefined;
  const stripWidth = lastMetric ? lastMetric.x + lastMetric.width : 0;
  const ticks = rulerTicks(stripWidth, TimelinePxPerSec);

  // The strip is full-bleed, so the viewport is the window: deriving the centre
  // rather than measuring it keeps the row from rendering empty for a frame
  // (`docs/frameworks/animations-and-gestures.md`).
  const halfViewport = windowWidth / 2;

  // A clip's content coordinate and the scroll offset that centres it are the
  // same number, because the content leads with exactly half a viewport.
  const playheadMetric = playhead.index >= 0 ? metrics[playhead.index] : undefined;
  const playheadX = playheadMetric
    ? playheadXPx(playheadMetric, playhead.secIntoCut, TimelinePxPerSec)
    : undefined;

  // Per-frame scrolling stays on the UI thread: the position is a shared value
  // the reaction writes straight to the scroll view, so following playback costs
  // no renders and no bridge traffic. The reaction fires on changes only, so a
  // settled strip is left alone and the user can scroll it by hand until the
  // next report moves the playhead.
  const follow: FollowState = { x: useSharedValue(0), active: useSharedValue(false) };
  useAnimatedReaction(
    () => (follow.active.value ? follow.x.value : undefined),
    (x) => {
      if (x !== undefined) scrollTo(scrollRef, x, 0, false);
    },
  );

  useEffect(() => {
    followPlayhead(follow, {
      targetX: playheadX,
      playing: isPlaying,
      dragging: trimming || scrubbing,
      reducedMotion,
      stripWidth,
    });
    // `follow` holds the same two shared values every render; the inputs above
    // are what actually moves the strip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playheadX, isPlaying, trimming, scrubbing, reducedMotion, stripWidth]);

  // Tapping the focused clip again releases it — the same let-go as tapping
  // empty space. Keyed to `focusedIndex`, not `selectedIndex`: a clip whose
  // handles are folded away (the stage is playing) has nothing to fold back, so
  // a tap on it stays a jump.
  const handleSelect = (index: number) => {
    if (index === focusedIndex) onDeselect();
    else onSelect(index);
  };

  // The scrub settles where the strip rests: at the drag's release, or — when
  // the release still carries momentum — where the momentum runs out. The
  // scroll offset *is* the strip coordinate under the playhead (see below), so
  // the rest offset converts straight into a cut and a moment inside it.
  const settleScrub = (offsetX: number) => {
    syncFollow(follow, offsetX);
    setScrubbing(false);
    if (cuts.length === 0) return;
    onScrub(playheadAtX(metrics, offsetX, TimelinePxPerSec));
  };

  return (
    <View>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        scrollEnabled={!trimming}
        onScrollBeginDrag={() => setScrubbing(true)}
        onScrollEndDrag={(event) => {
          // A fast release keeps going as momentum; settle when that ends.
          if (Math.abs(event.nativeEvent.velocity?.x ?? 0) > ScrubMomentumMinVelocity) return;
          settleScrub(event.nativeEvent.contentOffset.x);
        }}
        onMomentumScrollEnd={(event) => {
          // Guarded so a programmatic follow settling never reads as a scrub.
          if (scrubbing) settleScrub(event.nativeEvent.contentOffset.x);
        }}
        showsHorizontalScrollIndicator={false}
      >
        {/* The whole content area is the tap-away target: a tap that lands on a
            clip or the add tile goes to them (the deeper responder wins), so
            what reaches this Pressable is exactly the empty space — the ruler,
            the gaps, the half-viewport lead-ins — and tapping it clears the
            selection. A drag is not a tap: the scroll cancels the press, so
            scrubbing never deselects. */}
        <Pressable
          accessible={false}
          onPress={onDeselect}
          style={[styles.strip, { paddingHorizontal: halfViewport }]}
        >
          {/* The ruler shares the clips' origin and scale, so a mark is over the
              moment it names. */}
          <View style={[styles.ruler, { width: stripWidth }]}>
            {ticks.map((tick) =>
              tick.labelSec !== undefined ? (
                <View
                  key={tick.x}
                  style={[styles.tickLabel, { left: tick.x - TickLabelWidth / 2 }]}
                >
                  <ThemedText selectable={false} type="xsmall" themeColor="textSecondary">
                    {tick.labelSec}초
                  </ThemedText>
                </View>
              ) : (
                <View
                  key={tick.x}
                  style={[styles.tickDot, { left: tick.x - 1.5, backgroundColor: theme.border }]}
                />
              ),
            )}
          </View>

          <View style={styles.row}>
            {cuts.map((cut, index) => (
              <TimelineCut
                key={cut.ref.snapId}
                cut={cut}
                index={index}
                selected={index === selectedIndex}
                focused={index === focusedIndex}
                width={metrics[index].width}
                x={metrics[index].x}
                pxPerSec={TimelinePxPerSec}
                onSelect={handleSelect}
                onTrim={onTrim}
                onTrimmingChange={setTrimming}
              />
            ))}

            {canEdit ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="스냅 더 넣기"
                accessibilityState={{ disabled: room === 0 }}
                disabled={room === 0}
                onPress={onAddSnaps}
                style={[
                  styles.addTile,
                  { borderColor: theme.border, opacity: room === 0 ? 0.45 : 1 },
                ]}
              >
                <Ionicons name="add" size={20} color={theme.primary} />
                <ThemedText selectable={false} type="xsmall" themeColor="textSecondary">
                  {room > 0 ? `${room}개 더` : '가득 참'}
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Animated.ScrollView>

      {/* Outside the scroll view on purpose: "now" is a fixed place on the
          screen, and the movie is what moves. Nothing to point at on an empty
          cut list, so nothing is drawn. */}
      {cuts.length > 0 ? (
        <View
          pointerEvents="none"
          style={[styles.playhead, { left: halfViewport - PlayheadWidth / 2 }]}
        >
          <View style={[styles.playheadKnob, { backgroundColor: theme.primary }]} />
          <View style={[styles.playheadLine, { backgroundColor: theme.primary }]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    paddingVertical: Spacing.two,
  },
  ruler: {
    height: 18,
    marginBottom: Spacing.one,
  },
  tickLabel: {
    position: 'absolute',
    top: 0,
    width: TickLabelWidth,
    alignItems: 'center',
  },
  tickDot: {
    position: 'absolute',
    top: 8,
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: PlayheadWidth,
    alignItems: 'center',
  },
  playheadKnob: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  playheadLine: {
    width: 2,
    flex: 1,
    marginTop: -2,
    borderRadius: 1,
  },
  addTile: {
    width: TimelineCutHeight,
    height: TimelineCutHeight,
    marginLeft: Spacing.two,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
