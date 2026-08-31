import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { ExtractStepSec } from '@/features/extract-snap';
import { formatDuration } from '@/shared/lib/datetime';
import type { TrimTrack } from '@/shared/lib/trim-geometry';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { ExtractPxPerSec, stripRulerTicks, stripTiles } from '../model/extract-strip-layout';
import { useStripThumbnails } from '../model/use-strip-thumbnails';
import { ExtractWindow } from './extract-window';

/** The strip's clip height — the movie timeline's, so the two read as kin. */
const StripTileHeight = 56;
const TickLabelWidth = 48;

export type ExtractStripProps = {
  sourceUri: string;
  durationSec: number;
  /** The settled window. */
  startSec: number;
  endSec: number;
  /** Window bounds, already clamped to the source's length. */
  minSec: number;
  maxSec: number;
  /** Where playback is, for the line inside the window. */
  progressSec: number;
  isPlaying: boolean;
  progressIntervalSec: number;
  /** Step changes while dragging (`settled: false`) and the settled window. */
  onWindow: (startSec: number, endSec: number, settled: boolean) => void;
  /** A tap on the strip outside the window — the moment under the finger. */
  onTapStrip: (tapSec: number) => void;
};

/**
 * The source video as a filmstrip: the whole file drawn once on a seconds
 * scale, a ruler above it, and the extraction window over it. The strip
 * scrolls to bring a region into reach; the window (its body and its two
 * handles) is what chooses the cut — while any part of the window is held,
 * the scroll hands the axis to the drag, exactly as the movie timeline does
 * while a trim handle is down.
 *
 * A tap on the footage outside the window sends the window there
 * (`onTapStrip`) — the coarse move a minutes-long source needs. Only a tap:
 * a touch that scrolls fails the tap gesture, and a touch on the window or
 * its handles is claimed by their own pans first.
 */
export function ExtractStrip({
  sourceUri,
  durationSec,
  startSec,
  endSec,
  minSec,
  maxSec,
  progressSec,
  isPlaying,
  progressIntervalSec,
  onWindow,
  onTapStrip,
}: ExtractStripProps) {
  const theme = useTheme();
  const [dragging, setDragging] = useState(false);

  const track: TrimTrack = {
    width: durationSec * ExtractPxPerSec,
    durationSec,
    stepSec: ExtractStepSec,
  };
  const tiles = stripTiles(durationSec, ExtractPxPerSec);
  const frames = useStripThumbnails(sourceUri, tiles);
  const ticks = stripRulerTicks(durationSec, ExtractPxPerSec);

  return (
    <ScrollView horizontal scrollEnabled={!dragging} showsHorizontalScrollIndicator={false}>
      <View style={styles.content}>
        {/* The ruler shares the tiles' origin and scale, so a mark is over the
            moment it names. */}
        <View style={[styles.ruler, { width: track.width }]}>
          {ticks.map((tick) =>
            tick.labelSec !== undefined ? (
              <View key={tick.x} style={[styles.tickLabel, { left: tick.x - TickLabelWidth / 2 }]}>
                <ThemedText selectable={false} type="xsmall" themeColor="textSecondary">
                  {tick.labelSec >= 60 ? formatDuration(tick.labelSec) : `${tick.labelSec}초`}
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

        {/* A RNGH tap rather than a `Pressable`: the press event's `locationX`
            is relative to whichever tile the finger lands on, while the tap
            gesture's `x` is relative to the detected row — the strip
            coordinate the window needs. A touch that scrolls fails the tap,
            and a touch on the window is claimed by its pan first. */}
        <GestureDetector
          gesture={Gesture.Tap()
            .runOnJS(true)
            .onEnd((event, success) => {
              if (success) onTapStrip(event.x / ExtractPxPerSec);
            })}
        >
          <View style={styles.row}>
            {/* The tiles clip their rounded corners in a wrapper of their own, so
              the window's overhanging handles are not clipped with them. */}
            <View style={[styles.reel, { width: track.width, backgroundColor: theme.media }]}>
              {tiles.map((tile, index) => (
                <View key={tile.timeMs} style={{ width: tile.widthPx }}>
                  {frames[index] ? (
                    <Image
                      source={{ uri: frames[index] }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : null}
                </View>
              ))}
            </View>

            <ExtractWindow
              track={track}
              startSec={startSec}
              endSec={endSec}
              minSec={minSec}
              maxSec={maxSec}
              progressSec={progressSec}
              isPlaying={isPlaying}
              progressIntervalSec={progressIntervalSec}
              onWindow={onWindow}
              onDraggingChange={setDragging}
            />
          </View>
        </GestureDetector>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    // Room for the window's handles to overhang the first and last tile.
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.one,
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
    height: StripTileHeight,
  },
  reel: {
    flexDirection: 'row',
    height: '100%',
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
});
