import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatFullDate } from '@/shared/lib/datetime';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import type { MovieDeleteImpact } from '../model/use-movie-delete-impact';

/**
 * The picked snaps the server still keeps, which can be deleted from this device
 * only (SNAP-19): how many, and — for a single one — when its kept copy ends.
 */
export type DeviceOnlyDelete = { count: number; keptUntil?: number };

/**
 * The picked snaps a delete everywhere leaves in 최근 삭제 (SNAP-20): how many,
 * and — for a single one — until when it can be brought back.
 */
export type RestorableDelete = { count: number; until?: number };

export type SnapDeleteDialogProps = {
  visible: boolean;
  count: number;
  /** Movies that would lose cuts — empty when nothing references the snaps. */
  impact: MovieDeleteImpact[];
  /**
   * Set when some picks can be deleted from this device only; the sheet then
   * asks where to delete, with {@link SnapDeleteDialogProps.onConfirmDeviceOnly}
   * as the second answer.
   */
  deviceOnly?: DeviceOnlyDelete;
  /** Set when some picks can be brought back from 최근 삭제 after deleting everywhere. */
  restorable?: RestorableDelete;
  isDeleting: boolean;
  errorMessage?: string;
  onCancel: () => void;
  /** Deleting everywhere (SNAP-16). */
  onConfirm: () => void;
  onConfirmDeviceOnly?: () => void;
};

type Scope = 'device' | 'everywhere';

/**
 * Confirms deleting originals, naming what else it takes with them.
 *
 * Deleting a snap everywhere takes the video file off every device, and every
 * movie holding that cut loses it — the cuts for good, even when the snap itself
 * can come back from 최근 삭제 until its retention ends (SNAP-20). The sheet
 * therefore lists the movies by name and the count each drops to, rather than
 * warning in the abstract, and says whether the snaps can come back.
 *
 * When the server still keeps some of the picks, the sheet asks where to delete
 * instead (SNAP-19). The two answers differ in what survives, so each carries
 * its own consequence line: from this device only keeps the snap, its movies,
 * and its other devices, until the kept copy ends; everywhere keeps only what
 * 최근 삭제 can bring back. The movie list belongs to the second answer — it is
 * the only one that cuts movies.
 */
export function SnapDeleteDialog({
  visible,
  count,
  impact,
  deviceOnly,
  restorable,
  isDeleting,
  errorMessage,
  onCancel,
  onConfirm,
  onConfirmDeviceOnly,
}: SnapDeleteDialogProps) {
  const theme = useTheme();
  // Which answer is running, so only that button reads 삭제하는 중….
  const [running, setRunning] = useState<Scope>();
  const runningScope = isDeleting ? running : undefined;
  const choose = (scope: Scope, confirm: (() => void) | undefined) => {
    setRunning(scope);
    confirm?.();
  };

  const impactList =
    impact.length > 0 ? (
      <View style={[styles.impact, { borderColor: theme.border }]}>
        <ThemedText type="note" themeColor="textSecondary">
          영향받는 무비 {impact.length}
        </ThemedText>
        {impact.map((movie) => (
          <View key={movie.movieId} style={styles.impactRow}>
            <ThemedText type="small" numberOfLines={1} style={styles.impactTitle}>
              {movie.title}
            </ThemedText>
            <ThemedText type="note" themeColor="textSecondary">
              컷 {movie.cutCount} → {movie.nextCutCount}
            </ThemedText>
          </View>
        ))}
      </View>
    ) : null;

  const error = errorMessage ? (
    <ThemedText type="small" themeColor="danger">
      {errorMessage}
    </ThemedText>
  ) : null;

  if (deviceOnly && onConfirmDeviceOnly) {
    return (
      <BottomSheet accessibilityLabel="스냅 삭제 확인" visible={visible} onClose={onCancel}>
        <ThemedText type="note" themeColor="danger">
          스냅 삭제
        </ThemedText>
        <ThemedText type="heading">스냅 {count}개를 삭제할까요?</ThemedText>

        <View style={styles.choice}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`스냅 ${deviceOnly.count}개 이 기기에서만 삭제`}
            accessibilityState={{ disabled: isDeleting }}
            disabled={isDeleting}
            onPress={() => choose('device', onConfirmDeviceOnly)}
            style={({ pressed }) => [
              styles.action,
              { borderColor: theme.border, opacity: isDeleting ? 0.5 : pressed ? 0.8 : 1 },
            ]}
          >
            <ThemedText selectable={false} type="button">
              {runningScope === 'device' ? '삭제하는 중…' : '이 기기에서만 삭제'}
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary">
            {deviceOnlyConsequence(deviceOnly, count)}
          </ThemedText>
        </View>

        <View style={styles.choice}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`스냅 ${count}개 모든 기기에서 삭제`}
            accessibilityState={{ disabled: isDeleting }}
            disabled={isDeleting}
            onPress={() => choose('everywhere', onConfirm)}
            style={({ pressed }) => [
              styles.action,
              {
                backgroundColor: theme.danger,
                borderColor: theme.danger,
                opacity: isDeleting ? 0.5 : pressed ? 0.8 : 1,
              },
            ]}
          >
            <ThemedText selectable={false} type="button" style={{ color: theme.onPrimary }}>
              {runningScope === 'everywhere' ? '삭제하는 중…' : '모든 기기에서 삭제'}
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary">
            {everywhereConsequence(restorable, count)}
          </ThemedText>
          {impactList}
        </View>

        {error}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="삭제 취소"
          disabled={isDeleting}
          onPress={onCancel}
          style={[styles.action, { borderColor: theme.border }]}
        >
          <ThemedText selectable={false} type="button">
            취소
          </ThemedText>
        </Pressable>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet accessibilityLabel="스냅 삭제 확인" visible={visible} onClose={onCancel}>
      <ThemedText type="note" themeColor="danger">
        스냅 삭제
      </ThemedText>
      <ThemedText type="heading">스냅 {count}개를 삭제할까요?</ThemedText>
      {/* SNAP-16: a delete reaches every device the account is on, the
          original another device still holds included. */}
      <ThemedText themeColor="textSecondary">
        {restorable
          ? `모든 기기에서 삭제돼요. ${everywhereConsequence(restorable, count)}`
          : '모든 기기에서 파일까지 삭제되고, 되돌릴 수 없어요.'}
      </ThemedText>

      {impactList}

      {error}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="삭제 취소"
          disabled={isDeleting}
          onPress={onCancel}
          style={[styles.action, styles.rowAction, { borderColor: theme.border }]}
        >
          <ThemedText selectable={false} type="button">
            취소
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`스냅 ${count}개 삭제`}
          accessibilityState={{ disabled: isDeleting }}
          disabled={isDeleting}
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.action,
            styles.rowAction,
            {
              backgroundColor: theme.danger,
              borderColor: theme.danger,
              opacity: isDeleting ? 0.5 : pressed ? 0.8 : 1,
            },
          ]}
        >
          <ThemedText selectable={false} type="button" style={{ color: theme.onPrimary }}>
            {isDeleting ? '삭제하는 중…' : '삭제'}
          </ThemedText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

/**
 * What deleting everywhere leaves (SNAP-20): the snaps 최근 삭제 can bring back
 * until their retention ends — all of them, or the uploaded ones of a mixed pick
 * — or nothing, when none of them had reached the server or all had expired.
 */
function everywhereConsequence(restorable: RestorableDelete | undefined, count: number): string {
  if (!restorable) return '파일까지 모두 삭제되고, 되돌릴 수 없어요.';
  const until =
    restorable.until !== undefined
      ? `${formatFullDate(restorable.until)}까지`
      : '보관 기간이 끝날 때까지';
  return restorable.count < count
    ? `올라간 ${restorable.count}개는 ${until} 최근 삭제에서 되살릴 수 있어요.`
    : `${until}는 최근 삭제에서 되살릴 수 있어요.`;
}

/**
 * The one thing deleting from this device only costs: the snap stays viewable
 * until its kept copy ends, then it is gone. A mixed pick says how many it
 * applies to — the rest stay as they are.
 */
function deviceOnlyConsequence(deviceOnly: DeviceOnlyDelete, count: number): string {
  const until =
    deviceOnly.keptUntil !== undefined
      ? `${formatFullDate(deviceOnly.keptUntil)}까지는 계속 볼 수 있어요.`
      : '보관 기간이 끝날 때까지는 계속 볼 수 있어요.';
  return deviceOnly.count < count ? `보관 중인 ${deviceOnly.count}개만 지워요. ${until}` : until;
}

const styles = StyleSheet.create({
  impact: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  impactRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  impactTitle: { flex: 1 },
  choice: { gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.one },
  action: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAction: { flex: 1 },
});
