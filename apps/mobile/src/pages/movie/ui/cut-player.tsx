import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { transitionSpec } from '@/entities/movie';

import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { VideoFrame } from '@/shared/ui/video-frame';

import {
  PlaybackProgressIntervalSec,
  preRollSec,
  type BoundaryPlan,
  type PlaybackCut,
} from '../model/playback-cuts';

/** What the timeline may ask of the stage. */
export type CutPlayerHandle = {
  /** Shows a cut's first frame, paused — the answer to a strip tap. */
  jumpTo: (index: number) => void;
  /**
   * Shows a moment inside a cut, paused — the answer to a strip scrub. The
   * offset is seconds past the cut's trim window start, clamped into the window.
   */
  seekTo: (index: number, secIntoCut: number) => void;
  /** Plays or pauses; after the last cut, replays from the first. */
  togglePlayback: () => void;
  /**
   * Plays the boundary after cut `index` from a beat before it — the answer to
   * a transition pick, which is judged by watching it.
   */
  previewBoundary: (index: number) => void;
};

export type CutPlayerProps = {
  /** The cuts to run, in order. Must be non-empty; the page guards the empty case. */
  cuts: PlaybackCut[];
  /**
   * Where to land when the playlist changes under the player — the selected
   * cut's playlist position. An edit is about the cut the user is on, so the
   * stage pauses there rather than wherever playback happened to be.
   */
  editIndex?: number;
  /**
   * Reports which cut the stage is on and where inside it, so the timeline's
   * playhead can sit on the moment being played. Fires on every position report
   * and once whenever the stage lands on a cut, so it is the whole account of
   * where playback is — there is no separate cut-changed signal, because the
   * page keeps the playhead and the edit selection apart and only the playhead
   * follows the stage.
   */
  onProgress?: (index: number, secIntoCut: number) => void;
  /** Reports whether the stage is playing, so the transport's button can say. */
  onPlayingChange?: (playing: boolean) => void;
  ref?: Ref<CutPlayerHandle>;
  style?: StyleProp<ViewStyle>;
};

/** What one playlist entry plays, for telling two playlists apart. */
function playlistSignature(cuts: PlaybackCut[]): string {
  return cuts.map((cut) => `${cut.snapId}:${cut.startSec}:${cut.endSec}`).join('|');
}

/**
 * How the boundaries hand over, for re-parking the idle slot when only a
 * transition changed: a crossfade's incoming cut waits on spare frames before
 * its window, a cut waits on its window start.
 */
function handoverSignature(cuts: PlaybackCut[]): string {
  return cuts.map((cut) => cut.transitionOut?.kind ?? '-').join('|');
}

/**
 * A report this close to a boundary schedules a timer for the rest. Reports
 * come every `PlaybackProgressIntervalSec`, so acting only on them would start a
 * transition up to that late; the render cuts on the frame. Checked on device
 * (root docs/progress.md 2026-09-28/10-01): a timer for the remainder lands
 * within tens of milliseconds.
 */
const ScheduleWindowSec = PlaybackProgressIntervalSec + 0.05;

/** How much of the outgoing cut a boundary preview plays before its transition starts. */
const BoundaryPreviewLeadInSec = 1;

// Shared-value writes live in module-level functions: the React Compiler lint
// rejects a `.value` write in a callback declared in the component body
// (docs/frameworks/animations-and-gestures.md, "Work around the React Compiler
// lint, structurally").

function placeValue(value: SharedValue<number>, to: number) {
  value.value = to;
}

function animateValue(
  value: SharedValue<number>,
  from: number,
  to: number,
  durationSec: number,
  easing: 'linear' | 'easeOutCubic',
) {
  value.value = from;
  value.value = withTiming(to, {
    duration: Math.round(durationSec * 1000),
    easing: easing === 'linear' ? Easing.linear : Easing.out(Easing.cubic),
  });
}

/** A transition the stage is in the middle of — see `beginTransition`. */
type RunningTransition = {
  fromSlot: 0 | 1;
  toSlot: 0 | 1;
  toIndex: number;
  plan: BoundaryPlan;
  /** Whether the movie's clock has passed the boundary onto the incoming cut. */
  committed: boolean;
  timers: ReturnType<typeof setTimeout>[];
};

/**
 * Plays a movie's cuts back to back — the stage of the timeline layout.
 *
 * **Double buffered.** Two players alternate: while one plays, the other holds the
 * next cut preloaded and paused on its first frame, so the swap is instant with no
 * black flash between cuts. After each swap the freed player preloads the cut after
 * that.
 *
 * **Trim aware.** A cut starts at its trim window's start and is advanced when the
 * position reaches its end, rather than waiting for the file to run out — `playToEnd`
 * still catches the untrimmed case and any cut whose window reaches the file's end.
 *
 * **Linked to the timeline, both ways.** The `jumpTo` handle moves the stage to
 * the cut the strip picked, and `onProgress` reports which cut the stage moved onto and
 * where inside it, so the strip can run the timeline under a fixed playhead. What it
 * reports is the *playhead*, not a selection: the page holds the cut being edited
 * separately, and playing past a cut never takes it. When the playlist itself changes under the
 * player — a reorder, a trim, a removal — the stage holds its place (clamped) and
 * pauses on the edited list's frame rather than remounting, because a remounted
 * video cannot paint its first frame without a blink
 * (`docs/frameworks/animations-and-gestures.md`).
 *
 * This is what a finished movie *is* for now: a playlist, not a rendered file. When
 * a compositing backend exists, a movie with `render.uri` plays as one video and this
 * stays for the ones generated before it.
 *
 * Slot bookkeeping lives in refs so the native callbacks always read the latest
 * state. Only mounted with a non-empty `cuts`, so slot 0 always has a valid source.
 */
export function CutPlayer({
  cuts,
  editIndex,
  onProgress,
  onPlayingChange,
  ref,
  style,
}: CutPlayerProps) {
  const theme = useTheme();
  // What each slot's player opens on, pinned at mount. `useVideoPlayer` keys
  // the native player on its serialized source argument — hand it a source
  // that changes and the player is torn down and rebuilt, which is exactly the
  // remount-blink this component exists to avoid: the view blanks, the new
  // list's first file flashes in at its own start position, and every slot
  // ref below describes a player that no longer exists. A reorder or removal
  // changes `cuts[0]`/`cuts[1]`, so the live playlist must never be read
  // here; every later source change goes through `loadSlot`'s `replaceAsync`.
  const [initialSource] = useState(() => ({
    a: { uri: cuts[0].uri, startSec: cuts[0].startSec },
    b: { uri: cuts[1]?.uri ?? cuts[0].uri, startSec: cuts[1]?.startSec ?? cuts[0].startSec },
  }));
  // Which cut each slot currently holds; slot 1 preloads the second cut.
  const slotCutRef = useRef<[number, number]>([0, cuts.length > 1 ? 1 : -1]);
  // Which file each slot's player was last asked to load, and whether that
  // load is still in flight. The *file* is what identifies a held cut — a
  // reorder renumbers cuts without touching their files, so the playlist index
  // is only bookkeeping for the boundary watch, re-pointed freely. A slot
  // mid-replace holds nothing yet and ignores seeks.
  const slotUriRef = useRef<[string, string]>([initialSource.a.uri, initialSource.b.uri]);
  const slotLoadingRef = useRef<[boolean, boolean]>([false, false]);
  const activeSlotRef = useRef<0 | 1>(0);
  const currentIndexRef = useRef(0);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isEnded, setIsEnded] = useState(false);
  // Whether the stage is still exactly as it opened — nothing played, jumped,
  // scrubbed, or edited yet. Until then the first cut's cached frame stands in,
  // sampled at its trim start so it is the frame the stage itself would show:
  // a player opened paused can report its first frame without it reaching the
  // screen (on the Android emulator the stage stays black until something
  // seeks or plays), and a black stage with a play button over it reads as a
  // movie with nothing in it. Every later state is the player's own — a scrub
  // must show the moment scrubbed to, which no cached frame can.
  const [untouched, setUntouched] = useState(true);
  // Paused on arrival: the stage opens on the first cut's frame and waits —
  // watching is asked for (the transport, a tap), never assumed on entry.
  const [isPlaying, setIsPlaying] = useState(false);
  // Mirrors `isPlaying` for the async load completions, which must ask "is the
  // stage still supposed to be playing?" after an arbitrary delay.
  const isPlayingRef = useRef(false);
  // Every change to the stage — a play, a pause, a jump, a scrub, an edited
  // playlist, the end of the movie — passes through here.
  const setPlaying = (playing: boolean) => {
    isPlayingRef.current = playing;
    setIsPlaying(playing);
    setUntouched(false);
  };

  // Both slots play their cut's own recorded sound — no track is mixed and
  // nothing on this screen mutes the stage, so neither player is muted.
  const playerA = useVideoPlayer(initialSource.a.uri, (instance) => {
    instance.muted = false;
    instance.timeUpdateEventInterval = PlaybackProgressIntervalSec;
    instance.currentTime = initialSource.a.startSec;
  });
  // Second slot preloads the next cut (paused) so its first frame is ready.
  const playerB = useVideoPlayer(initialSource.b.uri, (instance) => {
    instance.muted = false;
    instance.timeUpdateEventInterval = PlaybackProgressIntervalSec;
    instance.currentTime = initialSource.b.startSec;
  });
  const players = [playerA, playerB] as const;

  // The two slots are stacked, B over A, and B's opacity alone picks which one
  // shows: A is always opaque underneath. A crossfade therefore always fades B —
  // in over A, or out to reveal it — the fixed stacking checked on a Galaxy
  // (root docs/progress.md 2026-10-01). Scales serve a zoom punch on either
  // slot; the overlay is a dip's black or a flash's white over both.
  const topOpacity = useSharedValue(0);
  const scaleA = useSharedValue(1);
  const scaleB = useSharedValue(1);
  const overlayOpacity = useSharedValue(0);
  const scales = [scaleA, scaleB] as const;
  const [overlayColor, setOverlayColor] = useState('#000000');
  // On while B is fading — Android draws a video under a translucent
  // TextureView black unless the fading view is a hardware layer (checked on a
  // Galaxy and the emulator, root docs/progress.md 2026-10-01). Only for the
  // fade: a hardware layer kept on would cost memory for nothing.
  const [fadingTop, setFadingTop] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const transitionRef = useRef<RunningTransition | null>(null);
  // The one pending boundary timer (see `ScheduleWindowSec`).
  const boundaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topStyle = useAnimatedStyle(() => ({
    opacity: topOpacity.value,
    transform: [{ scale: scaleB.value }],
  }));
  const bottomStyle = useAnimatedStyle(() => ({ transform: [{ scale: scaleA.value }] }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  /** Makes `slot` the one on stage. */
  const showSlot = (slot: 0 | 1) => {
    activeSlotRef.current = slot;
    setActiveSlot(slot);
    placeValue(topOpacity, slot === 1 ? 1 : 0);
  };

  const clearBoundaryTimer = () => {
    if (boundaryTimerRef.current !== null) clearTimeout(boundaryTimerRef.current);
    boundaryTimerRef.current = null;
  };

  /**
   * Stops a transition where it stands — a pause, a jump, an edited playlist.
   * The stage settles on whichever cut the movie's clock is on: before the
   * boundary the outgoing one, after it the incoming one. The effects are put
   * away rather than frozen half-way, because a half-faded paused frame is not a
   * frame of the movie.
   */
  const abortTransition = () => {
    clearBoundaryTimer();
    const running = transitionRef.current;
    if (!running) return;
    running.timers.forEach(clearTimeout);
    transitionRef.current = null;
    const settled = running.committed ? running.toSlot : running.fromSlot;
    const other: 0 | 1 = settled === 0 ? 1 : 0;
    players[other].pause();
    placeValue(overlayOpacity, 0);
    placeValue(scaleA, 1);
    placeValue(scaleB, 1);
    showSlot(settled);
    setFadingTop(false);
    setTransitioning(false);
  };

  // Landing on a cut is also a position: whatever put the stage here — a strip
  // tap, the end of the previous cut, a replay, a scrub — it now sits somewhere
  // in the cut, and the timeline's playhead has to be told before the first
  // `timeUpdate`.
  const setIndex = (index: number, secIntoCut = 0) => {
    currentIndexRef.current = index;
    setCurrentIndex(index);
    onProgress?.(index, secIntoCut);
  };

  /**
   * Points a slot at a cut and parks it `secIntoCut` past its trim window
   * start, paused. A slot that already holds the cut's *file* — however it got
   * there: a preload, or a reorder that renumbered the cut it was showing — is
   * re-pointed and seeked in place; only a file the slot does not hold costs a
   * `replaceAsync`. Replacing a source blanks the frame for an instant even
   * when it is the same file, and until the post-load seek lands the player
   * shows the file's frame zero — for a trimmed cut, footage the user cut off —
   * so an avoidable replace is a visible blink and a wrong frame
   * (`docs/frameworks/animations-and-gestures.md`). Replacement is always
   * `replaceAsync`, because the synchronous `replace` loads the file on the
   * iOS main thread and freezes the app for the duration.
   *
   * The seek is `seekBy` written as a delta from wherever the player reports
   * itself — the equivalent `currentTime` assignment is a property write on a
   * value a hook returned, which the React Compiler lint rejects. Seeking at
   * load time rather than at the swap is what keeps a trimmed cut from showing
   * its own frame zero for an instant when it comes on.
   *
   * Whether the slot then plays is not an argument but a question asked once
   * the slot holds the file (immediately, or when the replace completes): a
   * slot that is by then on stage, on the current cut, with the stage meant to
   * be playing, starts itself. That one rule covers a preload still in flight
   * when `advance` swaps to it, a jump the user paused during, and a plain
   * background preload (never active, never plays).
   */
  const loadSlot = (slot: 0 | 1, index: number, secIntoCut = 0) => {
    const cut = cuts[index];
    slotCutRef.current[slot] = index;
    const playIfDue = () => {
      if (
        activeSlotRef.current === slot &&
        currentIndexRef.current === index &&
        isPlayingRef.current
      ) {
        players[slot].play();
      }
    };
    if (slotUriRef.current[slot] === cut.uri && !slotLoadingRef.current[slot]) {
      players[slot].seekBy(cut.startSec + secIntoCut - players[slot].currentTime);
      playIfDue();
      return;
    }
    slotUriRef.current[slot] = cut.uri;
    slotLoadingRef.current[slot] = true;
    void players[slot].replaceAsync(cut.uri).then(() => {
      // A completion the slot has moved past parks nothing.
      if (slotUriRef.current[slot] !== cut.uri) return;
      slotLoadingRef.current[slot] = false;
      players[slot].seekBy(cut.startSec + secIntoCut - players[slot].currentTime);
      playIfDue();
    });
  };

  /**
   * Points the stage at `index` — the jump behind a strip tap, a strip scrub
   * (`secIntoCut` past the trim window's start), and the playlist changing
   * underneath. Held by *file*, not by playlist position: a reorder renumbers
   * the cut on the stage without touching its file, and a slot that holds the
   * right file is seeked in place (or swapped in, when it is the idle one)
   * rather than reloaded — replacing a source blanks the frame for an instant
   * even when it is the same file (the remount-blink of
   * `docs/frameworks/animations-and-gestures.md`), so an index-keyed check
   * here made every reorder blink the stage. Only a file no slot holds costs
   * a replace, inside `loadSlot`.
   */
  const loadCut = (index: number, play: boolean, secIntoCut = 0) => {
    abortTransition();
    const cut = cuts[index];
    const offset = Math.min(Math.max(secIntoCut, 0), cut.endSec - cut.startSec);
    const holdsFile = (s: 0 | 1) => slotUriRef.current[s] === cut.uri && !slotLoadingRef.current[s];
    let slot = activeSlotRef.current;
    if (!holdsFile(slot)) {
      const idle: 0 | 1 = slot === 0 ? 1 : 0;
      if (holdsFile(idle)) {
        // The idle slot has the cut's file ready — swap instead of reload.
        slot = idle;
        showSlot(slot);
      }
    }
    const other: 0 | 1 = slot === 0 ? 1 : 0;
    players[other].pause();
    players[slot].pause();
    setIndex(index, offset);
    setIsEnded(false);
    setPlaying(play);
    // `loadSlot` seeks a slot that already holds the file in place and plays it
    // if the stage is meant to be playing (`isPlayingRef`, set just above); a
    // slot that has to replace plays on the load's completion, same rule. The
    // idle slot's preload is not issued here — the preload effect below runs
    // it after this land's render commits, because when this call swapped
    // slots, `other` is still the on-screen surface until the commit.
    loadSlot(slot, index, offset);
  };

  // The playlist changed under the player — a reorder, a trim, a removal. Land
  // on the cut the edit was about (the page's selection) and pause on its
  // frame, so the edit is seen exactly where the user is looking. Without a
  // selection to follow, hold the place, clamped into the new list. The effect
  // keys on the signature alone, but its closure is rebuilt every render, so
  // `editIndex` is current whenever it fires.
  const signature = playlistSignature(cuts);
  const signatureRef = useRef(signature);
  useEffect(() => {
    if (signatureRef.current === signature) return;
    signatureRef.current = signature;
    const held = Math.min(currentIndexRef.current, cuts.length - 1);
    const target = editIndex !== undefined && editIndex >= 0 && editIndex < cuts.length;
    loadCut(target ? editIndex : held, false);
    // `loadCut`, `cuts`, and `editIndex` are rebuilt or re-read every render;
    // the signature is the one real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Keeps the idle slot preloaded with the cut after the current one. An
  // effect on purpose, not a call inside `advance`/`loadCut`: those run while
  // the slot being preloaded may still be the *visible* surface — the opacity
  // swap they just asked for is a state update that has not committed — and
  // `replaceAsync` blanks its surface immediately, which blanked the stage for
  // the load's duration at every cut transition. By effect time the swap is
  // committed and the idle slot is actually off screen. `loadSlot` skips the
  // replace when the slot already holds the file, so re-runs are cheap.
  // While a transition runs both slots are on stage — the outgoing one is still
  // playing out its spare frames — so nothing is preloaded until it ends.
  const handover = handoverSignature(cuts);
  useEffect(() => {
    if (transitioning) return;
    const idle: 0 | 1 = activeSlot === 0 ? 1 : 0;
    // Past the last cut the natural "next" is the replay, so cut 0 preloads
    // and playing the ended movie again starts on a ready frame.
    const next = (currentIndex + 1) % cuts.length;
    // A crossfade's incoming cut waits on spare frames before its window.
    loadSlot(idle, next, next === 0 ? 0 : -preRollSec(cuts[currentIndex]));
    // `loadSlot` and `cuts` are rebuilt every render; what the idle slot should
    // hold changes exactly with the inputs below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlot, currentIndex, signature, handover, transitioning]);

  const advance = (endedSlot: 0 | 1) => {
    // Only a *playing* stage advances. On Android `timeUpdate` keeps firing
    // while paused, at whatever position the player is parked on — advancing
    // on those reports auto-played the movie on entry (a parked position past
    // a boundary) and re-fired forever on the ended state.
    if (!isPlayingRef.current) return;
    if (endedSlot !== activeSlotRef.current) return; // ignore the idle slot
    const endedIndex = slotCutRef.current[endedSlot];
    const nextIndex = endedIndex + 1;
    if (nextIndex >= cuts.length) {
      players[endedSlot].pause();
      // The last report landed up to one interval short of the boundary; the
      // movie is over, so put the playhead on its actual final moment.
      const last = cuts[endedIndex];
      if (last) onProgress?.(endedIndex, last.endSec - last.startSec);
      setIsEnded(true);
      setPlaying(false);
      return;
    }

    // A cut ends at its trim boundary with file left over, so the outgoing player
    // has to be stopped rather than left to run on — unseen but still audible.
    players[endedSlot].pause();

    const nextSlot: 0 | 1 = endedSlot === 0 ? 1 : 0;
    const holdsNext =
      slotCutRef.current[nextSlot] === nextIndex &&
      slotUriRef.current[nextSlot] === cuts[nextIndex].uri;
    showSlot(nextSlot);
    setIndex(nextIndex);
    if (!holdsNext) {
      // Not preloaded (a rapid change) — load now; the completion plays it.
      loadSlot(nextSlot, nextIndex);
    } else if (!slotLoadingRef.current[nextSlot]) {
      players[nextSlot].play();
    }
    // A preload still in flight plays itself on completion, now that this slot
    // is the active one on the current cut. The slot that just finished gets
    // the cut after this one from the preload effect, once the swap commits —
    // its surface is still the visible one right now.
  };

  /**
   * Plays the boundary after `fromIndex` with its transition (the render's
   * look, fitted the render's way — `BoundaryPlan`). It runs on timers from
   * here: `leadSec` until the boundary, where the movie's clock moves onto the
   * incoming cut, and `tailSec` more until the effect is put away and the
   * outgoing player stops.
   *
   * The incoming slot must already hold its cut — the preload effect parks it
   * (on spare frames for a crossfade) as soon as the previous boundary ends. If
   * it does not (a cut too short for the load, an edit just now), the stage
   * cuts instead of waiting: a late transition is a different movie, a cut is
   * the honest fallback.
   */
  const beginTransition = (fromSlot: 0 | 1, fromIndex: number, plan: BoundaryPlan) => {
    const toSlot: 0 | 1 = fromSlot === 0 ? 1 : 0;
    const toIndex = fromIndex + 1;
    const ready =
      slotCutRef.current[toSlot] === toIndex &&
      slotUriRef.current[toSlot] === cuts[toIndex]?.uri &&
      !slotLoadingRef.current[toSlot];
    if (!ready) {
      advance(fromSlot);
      return;
    }
    const spec = transitionSpec(plan.kind);
    const running: RunningTransition = {
      fromSlot,
      toSlot,
      toIndex,
      plan,
      committed: false,
      timers: [],
    };
    transitionRef.current = running;
    setTransitioning(true);
    const later = (sec: number, step: () => void) => {
      running.timers.push(
        setTimeout(() => {
          if (transitionRef.current === running) step();
        }, sec * 1000),
      );
    };

    // The boundary: the movie's clock moves onto the incoming cut. For a
    // crossfade both players keep running; otherwise the outgoing one stops.
    const commit = () => {
      running.committed = true;
      if (plan.kind !== 'crossfade') {
        players[fromSlot].pause();
        players[toSlot].play();
        showSlot(toSlot);
      } else {
        activeSlotRef.current = toSlot;
        setActiveSlot(toSlot);
      }
      setIndex(toIndex);
    };
    const finish = () => {
      transitionRef.current = null;
      players[fromSlot].pause();
      placeValue(overlayOpacity, 0);
      placeValue(scales[toSlot], 1);
      showSlot(toSlot);
      setFadingTop(false);
      setTransitioning(false);
    };

    if (plan.kind === 'crossfade') {
      players[toSlot].play();
      setFadingTop(true);
      // B fades in over A, or out to reveal it.
      if (toSlot === 1) animateValue(topOpacity, 0, 1, plan.durationSec, 'linear');
      else animateValue(topOpacity, 1, 0, plan.durationSec, 'linear');
      later(plan.leadSec, commit);
      later(plan.durationSec, finish);
      return;
    }
    if (plan.kind === 'zoompunch') {
      commit();
      animateValue(scales[toSlot], spec.scaleFrom ?? 1, 1, plan.durationSec, spec.easing);
      later(plan.durationSec, finish);
      return;
    }
    // dip / flash: the overlay rises over the end of one cut and falls over the
    // start of the next.
    setOverlayColor(spec.color ?? '#000000');
    animateValue(overlayOpacity, 0, 1, plan.leadSec, 'linear');
    later(plan.leadSec, () => {
      commit();
      animateValue(overlayOpacity, 1, 0, plan.tailSec, 'linear');
    });
    later(plan.durationSec, finish);
  };

  /**
   * Keeps the active player inside the current cut's window — while the stage
   * is playing. Paused reports are dropped whole: on Android `timeUpdate`
   * fires on its interval regardless of play state, so a paused stage would
   * otherwise re-report its parked position four times a second, "catch up" a
   * seek that is still in flight (the delta lands on top of it, overshooting
   * past the trim boundary), and advance — which is how the stage used to
   * start playing on entry all by itself.
   */
  const watchBoundary = (slot: 0 | 1, currentTime: number) => {
    if (!isPlayingRef.current) return;
    if (slot !== activeSlotRef.current) return;
    const index = slotCutRef.current[slot];
    const cut = cuts[index];
    if (!cut) return;
    if (transitionRef.current) {
      // A transition runs on its own timers; the playhead still follows the
      // cut the movie's clock is on.
      onProgress?.(
        index,
        Math.min(Math.max(currentTime - cut.startSec, 0), cut.endSec - cut.startSec),
      );
      return;
    }
    // Where this cut hands over: a transition starts `leadSec` before its
    // boundary, a plain cut at the boundary itself.
    const plan = index + 1 < cuts.length ? cut.transitionOut : undefined;
    const handoverAt = cut.endSec - (plan?.leadSec ?? 0);
    const handOver = () => {
      boundaryTimerRef.current = null;
      if (!isPlayingRef.current || activeSlotRef.current !== slot) return;
      if (plan) beginTransition(slot, index, plan);
      else advance(slot);
    };
    const remaining = handoverAt - currentTime;
    if (remaining <= 0) {
      // The trim boundary arrives with file left over, so `playToEnd` never fires.
      clearBoundaryTimer();
      handOver();
      return;
    }
    if (remaining <= ScheduleWindowSec && boundaryTimerRef.current === null) {
      boundaryTimerRef.current = setTimeout(handOver, remaining * 1000);
    }
    // A player that began before its window catches up here — a seek issued while
    // its source was still loading may not have landed, and the alternative is
    // playing footage the user deliberately cut off the front.
    if (currentTime < cut.startSec - PlaybackProgressIntervalSec) {
      players[slot].seekBy(cut.startSec - currentTime);
      return;
    }
    onProgress?.(slotCutRef.current[slot], Math.max(currentTime - cut.startSec, 0));
  };

  // Playing/paused changes in many places (taps, jumps, edits, the end of the
  // movie); reporting the state rather than the events keeps the transport's
  // button from ever disagreeing with the stage.
  useEffect(() => {
    onPlayingChange?.(isPlaying);
  }, [isPlaying, onPlayingChange]);

  // A transition's timers must not outlive the stage.
  useEffect(
    () => () => {
      transitionRef.current?.timers.forEach(clearTimeout);
      if (boundaryTimerRef.current !== null) clearTimeout(boundaryTimerRef.current);
    },
    [],
  );

  useEventListener(playerA, 'playToEnd', () => advance(0));
  useEventListener(playerB, 'playToEnd', () => advance(1));
  useEventListener(playerA, 'timeUpdate', ({ currentTime }) => watchBoundary(0, currentTime));
  useEventListener(playerB, 'timeUpdate', ({ currentTime }) => watchBoundary(1, currentTime));

  // A replay is a load of the first cut that plays: `loadCut` already rewinds
  // a slot still holding it instead of replacing the source, so replaying a
  // movie whose first cut never left a slot shows no blank frame.
  const replay = () => loadCut(0, true);

  const togglePlayback = () => {
    if (isEnded) {
      replay();
      return;
    }
    if (isPlaying) {
      abortTransition();
      players[activeSlotRef.current].pause();
      setPlaying(false);
    } else {
      const active = players[activeSlotRef.current];
      active.play();
      setPlaying(true);
    }
  };

  // The timeline picked a cut: show its frame, paused — selecting is choosing
  // what to work on, not asking to watch; playing is the transport's job. A
  // handle rather than a prop-driven effect — the jump is an event, and routing
  // an event through state and an effect is a render-cascade the compiler lint
  // rightly rejects.
  useImperativeHandle(ref, () => ({
    jumpTo: (index: number) => {
      if (index < 0 || index >= cuts.length) return;
      loadCut(index, false);
    },
    seekTo: (index: number, secIntoCut: number) => {
      if (index < 0 || index >= cuts.length) return;
      loadCut(index, false, secIntoCut);
    },
    togglePlayback,
    previewBoundary: (index: number) => {
      const cut = cuts[index];
      if (!cut || index + 1 >= cuts.length) return;
      const leadSec = cut.transitionOut?.leadSec ?? 0;
      loadCut(index, true, cut.endSec - cut.startSec - leadSec - BoundaryPreviewLeadInSec);
    },
  }));

  const overlayIcon = isEnded ? 'refresh' : isPlaying ? 'pause' : 'play';
  const overlayLabel = isEnded ? '무비 다시 재생' : isPlaying ? '일시정지' : '재생';

  return (
    <View style={[styles.stage, { backgroundColor: theme.media }, style]}>
      {/* `surfaceType="textureView"`, because the double buffer swaps by
          opacity: Android's default SurfaceView is composited by the system
          outside the view hierarchy and ignores view alpha, which left the
          top view's video visible no matter which slot was active — every
          preload replace flashed on screen as a blink into another cut. A
          TextureView is an ordinary composited view, so opacity actually
          selects which slot the stage shows. */}
      <Animated.View style={[StyleSheet.absoluteFill, bottomStyle]}>
        <VideoView
          allowsPictureInPicture={false}
          contentFit="cover"
          nativeControls={false}
          player={playerA}
          surfaceType="textureView"
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        renderToHardwareTextureAndroid={fadingTop}
        style={[StyleSheet.absoluteFill, topStyle]}
      >
        <VideoView
          allowsPictureInPicture={false}
          contentFit="cover"
          nativeControls={false}
          player={playerB}
          surfaceType="textureView"
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {/* A dip's black or a flash's white, over both slots. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor }, overlayStyle]}
      />
      {untouched ? (
        <VideoFrame uri={cuts[0].uri} atSec={cuts[0].startSec > 0 ? cuts[0].startSec : undefined} />
      ) : null}

      <View style={styles.top} pointerEvents="none">
        <ThemedText selectable={false} style={styles.counter}>
          컷 {currentIndex + 1} / {cuts.length}
        </ThemedText>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={overlayLabel}
        onPress={togglePlayback}
        style={styles.tapLayer}
      >
        {!isPlaying || isEnded ? (
          <View style={styles.playButton}>
            <Ionicons name={overlayIcon} size={24} color="#F1E6DA" />
          </View>
        ) : null}
      </Pressable>

      {/* One segment per cut, so the movie's shape is visible while it plays. */}
      <View style={styles.segments} pointerEvents="none">
        {cuts.map((cut, index) => (
          <View
            key={`${cut.snapId}-${index}`}
            style={[
              styles.segment,
              { backgroundColor: index <= currentIndex ? theme.ai : 'rgba(255,255,255,0.25)' },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: Spacing.four,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // Drawn over arbitrary video, so plain white rather than a palette color.
  counter: {
    fontSize: 11,
    letterSpacing: 1.2,
    color: '#FFFFFF',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tapLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(20,15,11,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segments: {
    position: 'absolute',
    left: Spacing.four,
    right: Spacing.four,
    bottom: Spacing.four,
    flexDirection: 'row',
    gap: Spacing.one,
  },
  segment: { flex: 1, height: 3, borderRadius: 2 },
});
