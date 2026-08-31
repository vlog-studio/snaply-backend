import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useSnapSyncStatus, type Snap, type SnapSyncStatus } from '@/entities/snap';
import { formatSeconds } from '@/shared/lib/datetime';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { VideoFrame } from '@/shared/ui/video-frame';

export type SnapCellProps = {
  snap: Snap;
  /** Cell width in points; the cell is square, so this is its height too. */
  width: number;
  /** Selection order, 1-based. Undefined when not selected. */
  pickNumber?: number;
  /** Whether the grid is in selection mode — a tap picks instead of plays. */
  selecting: boolean;
  /** Whether the picks' target (the tray, or a movie) already holds this snap. */
  isHeld: boolean;
  onPress: (snap: Snap) => void;
  onLongPress: (snap: Snap) => void;
};

/**
 * What the sync badge says per status. `uploaded` is the normal state and says
 * nothing — a library where every snap is announcing success would be noise.
 * `pending` is also silent: it is every snap's resting state whenever the
 * worker cannot run (signed out, offline), and a permanent "업로드 중" would be
 * a lie. Only an actual transfer and an actual failure speak.
 */
const SyncBadgeLabel: Record<SnapSyncStatus, string | undefined> = {
  pending: undefined,
  uploading: '업로드 중',
  uploaded: undefined,
  failed: '업로드 실패',
};

/**
 * One snap in the grid: its first frame, its length, its pick number while
 * selecting, a "담김" badge whenever the target already holds it, and its
 * upload state while it is not settled on the backend yet.
 *
 * The badge stays visible during selection because that is exactly when it
 * matters: picking a snap the target already has does nothing, and without the
 * badge the user only finds out afterwards. It sits in the opposite corner from
 * the pick circle so the two never collide.
 *
 * Memoized because selecting one snap re-renders the whole library; without it
 * every cell would re-run its thumbnail lookup on every tap. The sync status is
 * subscribed per cell (not passed down) so an upload finishing re-renders one
 * cell, not the grid.
 */
export const SnapCell = memo(function SnapCell({
  snap,
  width,
  pickNumber,
  selecting,
  isHeld,
  onPress,
  onLongPress,
}: SnapCellProps) {
  const theme = useTheme();
  const isPicked = pickNumber !== undefined;
  const syncStatus = useSnapSyncStatus(snap.id);
  const syncLabel = SyncBadgeLabel[syncStatus];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selecting ? { selected: isPicked } : undefined}
      accessibilityLabel={`${formatSeconds(snap.durationSec)} 스냅${isHeld ? ' · 이미 담김' : ''}${syncLabel ? ` · ${syncLabel}` : ''}`}
      accessibilityHint={selecting ? '탭하면 선택해요' : '탭하면 재생해요. 길게 누르면 선택해요'}
      onPress={() => onPress(snap)}
      onLongPress={() => onLongPress(snap)}
      style={[
        styles.cell,
        {
          width,
          height: width,
          borderColor: isPicked ? theme.primary : theme.border,
        },
        isPicked && styles.picked,
      ]}
    >
      <VideoFrame uri={snap.uri} />
      {selecting ? (
        <View
          style={[
            styles.pick,
            {
              backgroundColor: isPicked ? theme.primary : 'rgba(0,0,0,0.45)',
              borderColor: isPicked ? theme.primary : 'rgba(255,255,255,0.7)',
            },
          ]}
        >
          {isPicked ? (
            <ThemedText selectable={false} type="smallBold" style={{ color: theme.onPrimary }}>
              {pickNumber}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
      {isHeld ? (
        <View style={[styles.heldBadge, { backgroundColor: theme.primary }]}>
          <ThemedText selectable={false} type="note" style={{ color: theme.onPrimary }}>
            담김
          </ThemedText>
        </View>
      ) : null}
      {syncLabel ? (
        <View
          style={[
            styles.syncBadge,
            syncStatus === 'failed'
              ? { backgroundColor: theme.danger }
              : styles.syncBadgeInProgress,
          ]}
        >
          <ThemedText selectable={false} type="note" style={styles.syncBadgeText}>
            {syncLabel}
          </ThemedText>
        </View>
      ) : null}
      <View style={styles.duration}>
        <ThemedText selectable={false} type="note" style={styles.durationText}>
          {formatSeconds(snap.durationSec)}
        </ThemedText>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // A square cell whose width and height are both given in points by the
  // caller. A thumbnail only has to be recognizable, so the grid crops the 9:16
  // frame to a square instead of standing three tall columns up: at 9/16 of
  // their old height, nearly twice as many rows fit on one screen.
  // Sized rather than shaped with `aspectRatio` on purpose: a wrapped flex cell
  // whose only children are absolutely positioned collapses to zero height when
  // its size comes from a percentage width plus an aspect ratio. `overflow:
  // hidden` clips the absolutely-filled frame to the rounded corners.
  cell: {
    borderRadius: Radius.xsmall,
    borderCurve: 'continuous',
    borderWidth: 1,
    overflow: 'hidden',
  },
  picked: { borderWidth: 2 },
  pick: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heldBadge: {
    position: 'absolute',
    top: Spacing.one,
    left: Spacing.one,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
  },
  // Opposite corner from the duration, mirroring how 담김 avoids the pick circle.
  syncBadge: {
    position: 'absolute',
    bottom: Spacing.one,
    left: Spacing.one,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
  },
  syncBadgeInProgress: { backgroundColor: 'rgba(0,0,0,0.55)' },
  // Drawn over arbitrary video (or the danger fill), so plain white.
  syncBadgeText: { color: '#FFFFFF' },
  duration: {
    position: 'absolute',
    bottom: Spacing.one,
    right: Spacing.one,
    borderRadius: Radius.small,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
  },
  // Drawn over arbitrary video, so plain white rather than a palette color.
  durationText: { color: '#FFFFFF' },
});
