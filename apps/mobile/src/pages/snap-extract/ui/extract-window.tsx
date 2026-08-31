import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { formatSeconds } from '@/shared/lib/datetime';
import {
  clampPx,
  secToX,
  windowSignature,
  xToSec,
  type TrimTrack,
} from '@/shared/lib/trim-geometry';
import { useReducedMotion, useTheme } from '@/shared/ui/theme';

import { formatPositionSec } from '../model/extract-strip-layout';

const HandleWidth = 18;
const FrameBorderWidth = 2.5;
const ProgressLineWidth = 2;

/**
 * How a settled window change lands — a strip tap gliding the window to the
 * tapped moment, a drag settling onto its step. The movie strip's jump
 * cadence, so the two timelines move like one family.
 */
const JumpMs = 260;

type WindowHandles = {
  startX: SharedValue<number>;
  endX: SharedValue<number>;
  /** Where the dragged part sat when the gesture began. */
  origin: SharedValue<number>;
  /** The window's width when a move began, so both edges shift together. */
  originSpan: SharedValue<number>;
  /** The window last reported to JS, so a drag crosses over on step changes only. */
  reported: SharedValue<number>;
};

/** What one gesture drags: an edge, or the whole window. */
type WindowPart = 'start' | 'end' | 'move';

/** How far apart the edges may sit, in track points. */
type WindowGaps = {
  minPx: number;
  maxPx: number;
};

/**
 * Builds the pan gesture for one part of the extraction window.
 *
 * A module-level factory taking the shared values as arguments, for the same
 * two reasons as `timeline-cut.tsx`'s `buildTrimGesture` (the canonical shape
 * this imitates): the React Compiler lint rejects `.value` writes inside
 * gesture callbacks built in a component body, and the drag wants the scroll's
 * own axis from its first pixel — so the touch going down locks the strip's
 * scroll (`setDragging`) before either gesture can move, and `onFinalize`
 * unlocks even when the gesture is cancelled.
 *
 * Unlike a cut's trim, the window has a ceiling as well as a floor (an
 * extracted snap is at most `MaxExtractSec`), so each edge is clamped against
 * the other in both directions — and the window's body is itself draggable,
 * carrying both edges at a fixed span.
 */
function buildWindowGesture(
  handles: WindowHandles,
  part: WindowPart,
  track: TrimTrack,
  gaps: WindowGaps,
  report: (startSec: number, endSec: number, settled: boolean) => void,
  setDragging: (dragging: boolean) => void,
) {
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
      runOnJS(setDragging)(true);
    })
    .onStart(() => {
      handles.origin.value = part === 'end' ? handles.endX.value : handles.startX.value;
      handles.originSpan.value = handles.endX.value - handles.startX.value;
    })
    .onUpdate((event) => {
      const target = handles.origin.value + event.translationX;
      if (part === 'start') {
        const min = Math.max(0, handles.endX.value - gaps.maxPx);
        handles.startX.value = clampPx(target, min, handles.endX.value - gaps.minPx);
      } else if (part === 'end') {
        const max = Math.min(track.width, handles.startX.value + gaps.maxPx);
        handles.endX.value = clampPx(target, handles.startX.value + gaps.minPx, max);
      } else {
        const span = handles.originSpan.value;
        const start = clampPx(target, 0, Math.max(track.width - span, 0));
        handles.startX.value = start;
        handles.endX.value = start + span;
      }
      publish(false);
    })
    .onFinalize(() => {
      // `onFinalize` rather than `onEnd`: it also runs when the gesture is
      // cancelled, which must still commit the window and hand the scroll back.
      publish(true);
      runOnJS(setDragging)(false);
    });
}

/**
 * Glides the playback line to each reported position over exactly one report
 * interval (`Easing.linear`), so the line moves at the video's speed instead
 * of stepping four times a second — the timeline strip's follow-playback
 * shape. Module-level for the React Compiler reason above.
 */
function driveProgress(
  progressX: SharedValue<number>,
  input: { targetX: number; aheadPx: number; intervalMs: number; animate: boolean },
) {
  if (!input.animate) {
    progressX.value = input.targetX;
    return;
  }
  progressX.value = withTiming(input.targetX + input.aheadPx, {
    duration: input.intervalMs,
    easing: Easing.linear,
  });
}

export type ExtractWindowProps = {
  /** The whole source on the strip's scale — what the drags run along. */
  track: TrimTrack;
  /** The settled window. Live drag values stay on the UI thread. */
  startSec: number;
  endSec: number;
  /** The window's floor and ceiling, already clamped to the source's length. */
  minSec: number;
  maxSec: number;
  /** Where playback is, for the line inside the window. */
  progressSec: number;
  isPlaying: boolean;
  /** How often `progressSec` reports, for the line's glide. */
  progressIntervalSec: number;
  /** Called on step changes while dragging, and once settled. */
  onWindow: (startSec: number, endSec: number, settled: boolean) => void;
  /** Reported while any part is held, so the strip can lock its scroll. */
  onDraggingChange: (dragging: boolean) => void;
};

/**
 * The extraction window over the source strip: an ember frame whose amber
 * edge handles set the cut's bounds and whose body drags the whole window
 * along the video — the movie editor's trim language, pointed at a gallery
 * video. The frame's position and width follow the finger on the UI thread;
 * React hears about step boundary crossings (for the readout) and the settled
 * window.
 */
export function ExtractWindow({
  track,
  startSec,
  endSec,
  minSec,
  maxSec,
  progressSec,
  isPlaying,
  progressIntervalSec,
  onWindow,
  onDraggingChange,
}: ExtractWindowProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();

  const startX = useSharedValue(secToX(startSec, track));
  const endX = useSharedValue(secToX(endSec, track));
  const origin = useSharedValue(0);
  const originSpan = useSharedValue(0);
  const reported = useSharedValue(windowSignature(startSec, endSec));
  const handles: WindowHandles = { startX, endX, origin, originSpan, reported };

  // Follow the settled window whenever it moves for a reason other than this
  // drag — a strip tap, a drag settling onto its step, the initial window
  // arriving. It glides rather than teleports: a window that slides to the
  // tapped moment reads as "I sent it there", where an instant jump reads as
  // an accident.
  useEffect(() => {
    const nextStartX = secToX(startSec, track);
    const nextEndX = secToX(endSec, track);
    if (reducedMotion) {
      startX.value = nextStartX;
      endX.value = nextEndX;
    } else {
      const timing = { duration: JumpMs, easing: Easing.out(Easing.cubic) };
      startX.value = withTiming(nextStartX, timing);
      endX.value = withTiming(nextEndX, timing);
    }
    reported.value = windowSignature(startSec, endSec);
    // `track` is rebuilt every render; its real inputs are listed instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSec, endSec, track.width, track.durationSec, reducedMotion, startX, endX, reported]);

  // Live numbers while a part is down; the props are the truth otherwise.
  const [dragged, setDragged] = useState<{ startSec: number; endSec: number }>();
  const shown = dragged ?? { startSec, endSec };

  const report = (nextStart: number, nextEnd: number, settled: boolean) => {
    if (!settled) {
      setDragged({ startSec: nextStart, endSec: nextEnd });
      onWindow(nextStart, nextEnd, false);
      return;
    }
    setDragged(undefined);
    onWindow(nextStart, nextEnd, true);
  };

  const gaps: WindowGaps = {
    minPx: secToX(minSec, track),
    maxPx: secToX(maxSec, track),
  };

  // The frame is a flow row — [handle][body][handle] — so the three pieces
  // join flush, like the movie editor's focused clip: the body stays square
  // and the rounded corners belong to the handles' outer edges, because a
  // rounded body against a straight handle leaves a notch at every join.
  const frameStyle = useAnimatedStyle(() => ({
    left: startX.value - HandleWidth - FrameBorderWidth,
  }));
  const bodyStyle = useAnimatedStyle(() => ({
    width: Math.max(endX.value - startX.value, 0) + FrameBorderWidth * 2,
  }));

  // Outside the window the footage is dimmed, so what the cut *is* reads at a
  // glance rather than only from a thin border.
  const scrimLeftStyle = useAnimatedStyle(() => ({
    width: Math.max(startX.value, 0),
  }));
  const scrimRightStyle = useAnimatedStyle(() => ({
    left: endX.value,
    width: Math.max(track.width - endX.value, 0),
  }));

  // The playback line, in window coordinates — held inside the frame so a
  // report that lags a window drag never draws outside the cut.
  const progressX = useSharedValue(secToX(progressSec, track));
  useEffect(() => {
    driveProgress(progressX, {
      targetX: secToX(progressSec, track),
      aheadPx: progressIntervalSec * (track.durationSec > 0 ? track.width / track.durationSec : 0),
      intervalMs: progressIntervalSec * 1000,
      animate: isPlaying && !reducedMotion,
    });
    // `track` is rebuilt every render; its real inputs are listed instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    progressSec,
    isPlaying,
    reducedMotion,
    progressIntervalSec,
    track.width,
    track.durationSec,
    progressX,
  ]);
  const progressStyle = useAnimatedStyle(() => {
    const span = Math.max(endX.value - startX.value - ProgressLineWidth, 0);
    return {
      transform: [{ translateX: clampPx(progressX.value - startX.value, 0, span) }],
    };
  });

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { width: track.width }]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.scrim, styles.scrimLeft, scrimLeftStyle]}
      />
      <Animated.View pointerEvents="none" style={[styles.scrim, scrimRightStyle]} />

      <Animated.View style={[styles.frame, frameStyle]}>
        <GestureDetector
          gesture={buildWindowGesture(handles, 'start', track, gaps, report, onDraggingChange)}
        >
          <View
            accessibilityRole="adjustable"
            accessibilityLabel="컷 시작 지점"
            accessibilityValue={{ text: formatPositionSec(shown.startSec) }}
            style={[styles.handle, styles.handleStart, { backgroundColor: theme.amber }]}
          >
            <View style={styles.grip} />
          </View>
        </GestureDetector>

        <GestureDetector
          gesture={buildWindowGesture(handles, 'move', track, gaps, report, onDraggingChange)}
        >
          <Animated.View
            accessibilityRole="adjustable"
            accessibilityLabel="추출 구간"
            accessibilityValue={{
              text: `${formatPositionSec(shown.startSec)}부터 ${formatSeconds(shown.endSec - shown.startSec)}`,
            }}
            style={[styles.body, { borderColor: theme.amber }, bodyStyle]}
          >
            {isPlaying ? (
              <Animated.View pointerEvents="none" style={[styles.progressLine, progressStyle]} />
            ) : null}
          </Animated.View>
        </GestureDetector>

        <GestureDetector
          gesture={buildWindowGesture(handles, 'end', track, gaps, report, onDraggingChange)}
        >
          <View
            accessibilityRole="adjustable"
            accessibilityLabel="컷 끝 지점"
            accessibilityValue={{ text: formatPositionSec(shown.endSec) }}
            style={[styles.handle, styles.handleEnd, { backgroundColor: theme.amber }]}
          >
            <View style={styles.grip} />
          </View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(14,11,8,0.55)',
  },
  scrimLeft: {
    left: 0,
  },
  frame: {
    position: 'absolute',
    top: -FrameBorderWidth,
    bottom: -FrameBorderWidth,
    flexDirection: 'row',
  },
  // Square on purpose — the outer radii live on the handles (see above).
  body: {
    borderWidth: FrameBorderWidth,
    overflow: 'hidden',
  },
  progressLine: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    width: ProgressLineWidth,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  handle: {
    width: HandleWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleStart: {
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  handleEnd: {
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  grip: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    backgroundColor: '#FFFFFF',
  },
});
