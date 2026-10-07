import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { requestSnapReconcile } from '@/features/reconcile-snaps';
import { useRestoreSnaps, useTrashedSnaps, type TrashedSnap } from '@/features/restore-snap';
import { formatDateTime, formatSeconds } from '@/shared/lib/datetime';
import { ImageFrame } from '@/shared/ui/image-frame';
import { MaxContentWidth, Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { Toast } from '@/shared/ui/toast';

import { daysLeftLabel } from '../lib/days-left';

/**
 * 최근 삭제 (`/recently-deleted`) — snaps deleted everywhere that the server still
 * keeps until their retention ends, most recent first, each with 되살리기
 * (SNAP-20, docs/decisions/snap-trash.md).
 *
 * A restored snap goes back on the account and the library's reconcile brings
 * it into the Snap tab, its file fetched on first play; the screen asks for that
 * pass at once instead of waiting for the next return to the foreground. Only
 * the snap comes back — the cuts the delete took out of movies stay out.
 *
 * Reached from the end of the Snap tab. It says nothing about how the trash
 * works: each row's countdown is the state, and the empty screen is one line.
 */
export function RecentlyDeletedPage() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { snaps, failed, retry } = useTrashedSnaps();
  const { restoreSnaps, restoringIds, errorMessage, clearError } = useRestoreSnaps();
  const [notice, setNotice] = useState<string>();
  // Read once per visit: the countdown is in days, and a render-time clock is impure.
  const [now] = useState(Date.now);

  const restore = async (videoId: string) => {
    const outcome = await restoreSnaps([videoId]);
    if (outcome.restored.length > 0) {
      requestSnapReconcile();
      setNotice('스냅을 되살렸어요');
    }
  };

  const empty =
    snaps === undefined ? (
      failed ? (
        <View style={styles.empty}>
          <ThemedText themeColor="textSecondary">최근 삭제를 불러오지 못했어요</ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="다시 시도"
            hitSlop={12}
            onPress={retry}
          >
            <ThemedText selectable={false} type="smallBold" themeColor="primary">
              다시 시도
            </ThemedText>
          </Pressable>
        </View>
      ) : null
    ) : (
      <View style={styles.empty}>
        <ThemedText themeColor="textSecondary">최근 삭제한 스냅이 없어요</ThemedText>
      </View>
    );

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <FlatList
        data={snaps ?? []}
        keyExtractor={(snap) => snap.videoId}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: Spacing.eight + insets.bottom }]}
        ItemSeparatorComponent={() => (
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
        )}
        ListEmptyComponent={empty}
        renderItem={({ item }) => (
          <TrashedSnapRow
            snap={item}
            now={now}
            restoring={restoringIds.has(item.videoId)}
            disabled={restoringIds.size > 0}
            onRestore={() => void restore(item.videoId)}
          />
        )}
      />
      <Toast
        message={notice ?? errorMessage}
        onDismiss={() => {
          setNotice(undefined);
          clearError();
        }}
        bottomOffset={insets.bottom + Spacing.three}
      />
    </View>
  );
}

function TrashedSnapRow({
  snap,
  now,
  restoring,
  disabled,
  onRestore,
}: {
  snap: TrashedSnap;
  now: number;
  restoring: boolean;
  disabled: boolean;
  onRestore: () => void;
}) {
  const theme = useTheme();
  const [coverFailed, setCoverFailed] = useState(false);
  const left = daysLeftLabel(snap.restorableUntil, now);

  return (
    <View style={styles.row}>
      <View style={[styles.cover, { backgroundColor: theme.media }]}>
        {snap.thumbnailUrl && !coverFailed ? (
          <ImageFrame uri={snap.thumbnailUrl} onError={() => setCoverFailed(true)} />
        ) : null}
      </View>
      <View style={styles.meta}>
        <ThemedText type="smallBold">{formatDateTime(snap.capturedAt)}</ThemedText>
        <ThemedText type="note" themeColor="textSecondary">
          {formatSeconds(snap.durationSec)} · {left}
        </ThemedText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${formatDateTime(snap.capturedAt)} 스냅 되살리기`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={8}
        onPress={onRestore}
        style={({ pressed }) => [
          styles.restore,
          { borderColor: theme.border, opacity: disabled && !restoring ? 0.5 : pressed ? 0.7 : 1 },
        ]}
      >
        <ThemedText selectable={false} type="smallBold" themeColor="primary">
          {restoring ? '되살리는 중…' : '되살리기'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  cover: {
    width: 56,
    height: 56,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  meta: { flex: 1, gap: Spacing.half },
  restore: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: StyleSheet.hairlineWidth },
  empty: { alignItems: 'center', gap: Spacing.three, paddingTop: Spacing.eight },
});
