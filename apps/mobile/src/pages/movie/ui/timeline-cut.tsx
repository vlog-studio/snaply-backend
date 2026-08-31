import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { CutTrimStepSec, MinCutSec } from '@/entities/movie';
import { formatSeconds } from '@/shared/lib/datetime';
import {
  clampPx,
  minGapPx,
  secToX,
  windowSignature,
  xToSec,
  type TrimTrack,
} from '@/shared/lib/trim-geometry';
import { Radius, Spacing, useReducedMotion, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { VideoFrame } from '@/shared/ui/video-frame';

import type { Cut } from '../model/use-movie-cuts';

/** The strip's clip height; the thumbnail tiles are squares of the same size. */
export const TimelineCutHeight = 56;
const TileWidth = TimelineCutHeight;
const HandleWidth = 18;

/**
 * Slack under which a window edge counts as touching the file's end — half a
 * trim step, so a stored value one step away never reads as "at the end" and a
 * measured duration a hair off a step never reads as "footage left".
 */
const EdgeSlackSec = CutTrimStepSec / 2;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * How a reordered clip glides into its new slot — the project's positional
 * reflow spring (`docs/frameworks/animations-and-gestures.md`): near-critically
 * damped, so the clip settles with no visible bounce.
 */
const ReorderSpring = { damping: 44, stiffness: 300 };

/** Which end of the trim window a handle moves. */
type TrimEdge = 'start' | 'end';

/**
 * The handle's "footage remains" glyph, drawn to match the grip bar: the same
 * 3pt stroke with rounded ends, so the pair reads `‹ |` as one family rather
 * than an icon-font chevron next to a hand-drawn bar.
 */
function TrimChevron({ edge }: { edge: TrimEdge }) {
  return (
    <Svg width={9} height={16} viewBox="0 0 9 16">
      <Path
        d={edge === 'start' ? 'M7 2 L2.5 8 L7 14' : 'M2 2 L6.5 8 L2 14'}
        stroke="#FFFFFF"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

type TrimHandles = {
  startX: SharedValue<number>;
  endX: SharedValue<number>;
  /** Where the dragged handle sat when the gesture began. */
  origin: SharedValue<number>;
  /** The window last reported to JS, so a drag crosses over on step changes only. */
  reported: SharedValue<number>;
};

/**
 * Builds the pan gesture for one trim handle.
 *
 * A module-level factory taking the shared values as arguments, rather than a
 * closure built in the component: the React Compiler lint rejects `.value`
 * writes inside gesture-builder callbacks defined in a component body, and this
 * is the project's established way around it (see
 * `docs/frameworks/animations-and-gestures.md`).
 *
 * The handle lives inside the strip's *horizontal* scroll, where offset-based
 * arbitration cannot separate the two — both want the same axis. Instead the
 * touch going down on a handle locks the scroll (`setTrimming`) before either
 * gesture can move, so the pan always wins on a handle and the strip scrolls
 * everywhere else; `onFinalize` unlocks even when the gesture is cancelled.
 */
function buildTrimGesture(
  handles: TrimHandles,
  edge: TrimEdge,
  track: TrimTrack,
  report: (startSec: number, endSec: number, settled: boolean) => void,
  setTrimming: (trimming: boolean) => void,
) {
  const moving = edge === 'start' ? handles.startX : handles.endX;
  const gap = minGapPx(MinCutSec, track);

  const publish = (settled: boolean) => {
    'worklet';
    const startSec = xToSec(handles.startX.value, track);
    const endSec = xToSec(handles.endX.value, track);
    const signature = windowSignature(startSec, endSec);
    if (!settled && signature === handles.reported.value) return;
    handles.reported.value = signature;
    runOnJS(report)(startSec, endSec, settled);
  };

  return Gesture.Pan()
    .minDistance(0)
    .onTouchesDown(() => {
      runOnJS(setTrimming)(true);
    })
    .onStart(() => {
      handles.origin.value = moving.value;
    })
    .onUpdate((event) => {
      const min = edge === 'start' ? 0 : handles.startX.value + gap;
      const max = edge === 'start' ? handles.endX.value - gap : track.width;
      moving.value = clampPx(handles.origin.value + event.translationX, min, max);
      publish(false);
    })
    .onFinalize(() => {
      // `onFinalize` rather than `onEnd`: it also runs when the gesture is
      // cancelled, which must still commit the window and hand the scroll back.
      publish(true);
      runOnJS(setTrimming)(false);
    });
}

export type TimelineCutProps = {
  cut: Cut;
  index: number;
  selected: boolean;
  /**
   * True when this cut is being trimmed in place: selected, editable, and its
   * original alive. The clip grows a handle at each edge.
   */
  focused: boolean;
  /**
   * Width this cut occupies in the strip, from the shared layout metrics. A
   * live clip drives its own width from the handles (the two agree whenever no
   * handle is down); this is what a dead cut is drawn at.
   */
  width: number;
  /**
   * Where this cut starts in the strip, from the shared layout metrics. Not
   * used to place the clip — flex does that — but to *animate* a reorder: when
   * the cut lands in a new slot, the difference between the old and new `x` is
   * how far it glides.
   */
  x: number;
  pxPerSec: number;
  onSelect: (index: number) => void;
  /** Called with a settled trim window; the cut list holds it until a save. */
  onTrim: (index: number, startSec: number, endSec: number) => void;
  /** Reported while a handle is down, so the strip can lock its scroll. */
  onTrimmingChange: (trimming: boolean) => void;
};

/**
 * One cut in the timeline strip, drawn as long as it plays.
 *
 * The clip's width is its duration on the strip's seconds scale, filled with
 * repeating thumbnail tiles like a reel — the reel spans the whole snap and
 * slides left by the trimmed-off lead, so the clip always shows exactly its
 * window. The focused clip grows a handle *outside* each edge — over the
 * neighbouring clips, not the content, so a cut at the minimum length still
 * shows its frame: a chevron pointing outward where trimmed-off footage
 * remains (drag to lengthen or shorten), a plain bar where the window already
 * touches the file's end (drag inward only). The frame's negative horizontal
 * margins give back exactly the handles' width, so the clip keeps the strip
 * position and width the shared layout metrics assign it. Dragging a handle
 * resizes the clip itself on the timeline — the width and the reel's slide
 * follow the finger on the UI thread — instead of opening the whole snap up.
 *
 * React state only hears about trim-step boundary crossings (for the duration
 * badge and the handle glyphs) and the settled window (per
 * `docs/frameworks/animations-and-gestures.md`).
 */
export function TimelineCut({
  cut,
  index,
  selected,
  focused,
  width,
  x,
  pxPerSec,
  onSelect,
  onTrim,
  onTrimmingChange,
}: TimelineCutProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const snap = cut.snap;
  const missing = snap === undefined;
  const durationSec = snap?.durationSec ?? 0;
  /** The full snap's width — what the tiles fill and the trim drags along. */
  const reelWidth = snap ? durationSec * pxPerSec : width;
  const track: TrimTrack = { width: reelWidth, durationSec, stepSec: CutTrimStepSec };
  const startSec = cut.ref.trim?.startSec ?? 0;
  const endSec = cut.ref.trim?.endSec ?? durationSec;

  const startX = useSharedValue(secToX(startSec, track));
  const endX = useSharedValue(secToX(endSec, track));
  const origin = useSharedValue(0);
  const reported = useSharedValue(windowSignature(startSec, endSec));
  const handles: TrimHandles = { startX, endX, origin, reported };

  // Follow the stored window whenever it moves for a reason other than this
  // drag — a save landing, 되돌리기, or the whole-snap reset.
  useEffect(() => {
    startX.value = secToX(startSec, track);
    endX.value = secToX(endSec, track);
    reported.value = windowSignature(startSec, endSec);
    // `track` is rebuilt every render; its real inputs are listed instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSec, endSec, durationSec, reelWidth, startX, endX, reported]);

  // A reorder moves this clip to a new slot in one commit, so without help it
  // teleports — on a strip longer than the screen, unreadably. FLIP: flex has
  // already placed the clip at its new `x`, so it is pulled back by the
  // distance it jumped and springs to rest at zero, gliding from the old slot
  // to the new one. Keyed to the *index* changing, not `x`: an upstream trim
  // also shifts `x`, but the clip already moved live under the drag, and
  // re-animating that shift would replay motion that has happened. Added onto
  // any offset still in flight, so a second ▶ mid-glide carries over instead
  // of snapping. The whole decision runs *inside the animated style* — the
  // worklet re-evaluates on the UI thread in the same update that delivers the
  // new layout, where a JS effect runs after paint and let the clip flash at
  // its destination for a frame before the pull-back landed.
  const shiftX = useSharedValue(0);
  const slot = useSharedValue({ index, x });
  // While gliding, the two crossing clips overlap; the selected one — the cut
  // the user is moving — draws on top. A focused frame keeps its own stacking
  // (its handles overhang the neighbours) whether or not it is in flight.
  const shiftStyle = useAnimatedStyle(() => {
    const last = slot.value;
    if (last.index !== index || last.x !== x) {
      slot.value = { index, x };
      if (last.index !== index && !reducedMotion) {
        shiftX.value = shiftX.value + (last.x - x);
        shiftX.value = withSpring(0, ReorderSpring);
      }
    }
    return {
      transform: [{ translateX: shiftX.value }],
      zIndex: focused ? 2 : shiftX.value !== 0 && selected ? 1 : 0,
    };
  });

  // Live numbers while a handle is down; the props are the truth otherwise.
  const [dragged, setDragged] = useState<{ startSec: number; endSec: number }>();
  const shown = dragged ?? { startSec, endSec };

  const report = (nextStart: number, nextEnd: number, settled: boolean) => {
    if (!settled) {
      setDragged({ startSec: nextStart, endSec: nextEnd });
      return;
    }
    setDragged(undefined);
    onTrim(index, nextStart, nextEnd);
  };

  // The clip *is* the trim window: its width and the reel's slide are the
  // handles' positions, so a drag resizes the clip live on the UI thread and
  // the strip's metrics catch up when the window settles.
  const clipWidthStyle = useAnimatedStyle(() => ({
    width: Math.max(endX.value - startX.value, 0),
  }));
  const reelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -startX.value }],
  }));

  // Which glyph each handle wears: a chevron points where footage remains.
  const canExtendStart = shown.startSec > EdgeSlackSec;
  const canExtendEnd = durationSec - shown.endSec > EdgeSlackSec;

  const tileCount = Math.max(Math.ceil(reelWidth / TileWidth), 1);

  return (
    // The frame carries the handles outside the clip. When focused it wears
    // negative horizontal margins of exactly the handles' width, so the clip
    // itself stays at the strip position and width the layout metrics assign —
    // the handles hang over the neighbouring clips instead of pushing them.
    <Animated.View style={[styles.frame, focused ? styles.frameFocused : null, shiftStyle]}>
      {focused ? (
        <GestureDetector
          gesture={buildTrimGesture(handles, 'start', track, report, onTrimmingChange)}
        >
          <View
            accessibilityRole="adjustable"
            accessibilityLabel="컷 시작 지점"
            accessibilityValue={{ text: formatSeconds(shown.startSec) }}
            style={[styles.handle, styles.handleStart, { backgroundColor: theme.amber }]}
          >
            {canExtendStart ? <TrimChevron edge="start" /> : <View style={styles.grip} />}
          </View>
        </GestureDetector>
      ) : null}

      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={`컷 ${index + 1}${missing ? ' · 원본 삭제됨' : ''} · ${formatSeconds(shown.endSec - shown.startSec)}`}
        accessibilityHint={focused ? '다시 탭하면 선택이 해제됩니다' : undefined}
        accessibilityState={{ selected }}
        onPress={() => onSelect(index)}
        style={[
          styles.clip,
          {
            backgroundColor: theme.media,
            borderColor: missing ? theme.danger : selected ? theme.amber : theme.border,
            borderWidth: missing || selected ? 2 : 1,
          },
          // Square while the handles are on: the rounded corners belong to the
          // handles' outer edges, so the three pieces read as one frame rather
          // than a pill–rectangle–pill with notches at the joins.
          focused ? styles.clipFocused : null,
          // A dead cut has no handles to size it; the stand-in width applies.
          missing ? { width } : clipWidthStyle,
        ]}
      >
        {snap ? (
          <Animated.View style={[styles.reel, { width: reelWidth }, reelStyle]}>
            {Array.from({ length: tileCount }, (_, tile) => (
              <View key={tile} style={styles.tile}>
                <VideoFrame uri={snap.uri} />
              </View>
            ))}
          </Animated.View>
        ) : (
          <View style={styles.missingMark}>
            <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
          </View>
        )}

        <View style={styles.badges} pointerEvents="none">
          <ThemedText selectable={false} style={styles.number}>
            {index + 1}
          </ThemedText>
          <ThemedText selectable={false} style={styles.duration}>
            {formatSeconds(shown.endSec - shown.startSec)}
          </ThemedText>
        </View>
      </AnimatedPressable>

      {focused ? (
        <GestureDetector
          gesture={buildTrimGesture(handles, 'end', track, report, onTrimmingChange)}
        >
          <View
            accessibilityRole="adjustable"
            accessibilityLabel="컷 끝 지점"
            accessibilityValue={{ text: formatSeconds(shown.endSec) }}
            style={[styles.handle, styles.handleEnd, { backgroundColor: theme.amber }]}
          >
            {canExtendEnd ? <TrimChevron edge="end" /> : <View style={styles.grip} />}
          </View>
        </GestureDetector>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flexDirection: 'row',
  },
  // The focused frame's z-order (above the flat siblings, so the overhanging
  // handles draw over the neighbouring clips) lives in `shiftStyle`, which owns
  // all of the frame's stacking.
  frameFocused: {
    marginHorizontal: -HandleWidth,
  },
  clip: {
    height: TimelineCutHeight,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  clipFocused: {
    borderRadius: 0,
  },
  reel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
  },
  tile: { width: TileWidth, height: '100%' },
  missingMark: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: HandleWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleStart: {
    borderTopLeftRadius: Radius.small,
    borderBottomLeftRadius: Radius.small,
  },
  handleEnd: {
    borderTopRightRadius: Radius.small,
    borderBottomRightRadius: Radius.small,
  },
  grip: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    backgroundColor: '#FFFFFF',
  },
  badges: {
    position: 'absolute',
    left: Spacing.one,
    right: Spacing.one,
    bottom: Spacing.one,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  // Drawn over arbitrary video, so plain white with a shadow rather than a
  // palette color (the counter in the stage does the same).
  number: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 3,
  },
  duration: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 3,
  },
});
