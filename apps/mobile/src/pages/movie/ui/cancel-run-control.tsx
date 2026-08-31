import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CancellationOutcome } from '@/features/compose-movie';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { GenerationRefusalMessages } from './refusal-notice';

export type CancelRunControlProps = {
  /** Asks the backend to stop the run; the movie leaves `generating` on its word. */
  cancel: () => Promise<CancellationOutcome>;
};

/**
 * Stopping the run — the one act a `generating` movie offers, standing in the
 * footer slot where the generate button otherwise lives (2026-08-13).
 *
 * It confirms in place rather than in a sheet: a run in its last stretch can be
 * minutes of work, a mis-tap must not throw that away, and this footer is the
 * screen's action zone — a Modal for one yes/no would be the stacking the ⋯
 * sheet's own steps exist to avoid. The confirm states what a stop costs (the
 * progress, not the cuts), which is the same shape as the delete confirm's
 * reassurance.
 *
 * The control never flips the movie itself. A confirmed cancel that lands
 * unmounts this control by changing the movie's status; the only outcome that
 * leaves it standing is a request that never reached the server, and it says
 * so and offers the same button again. `settled` — the run ended while the
 * request was in flight — resets quietly: the result is already arriving, and
 * a line about it would race the status change it describes.
 */
export function CancelRunControl({ cancel }: CancelRunControlProps) {
  const theme = useTheme();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unreachable, setUnreachable] = useState(false);

  const confirm = async () => {
    setBusy(true);
    setUnreachable(false);
    const outcome = await cancel();
    // A cancel that landed unmounts this control with the movie's status; only
    // the outcomes that keep the run going still have a control to update.
    if (!outcome.canceled) {
      setBusy(false);
      if (outcome.refused === 'unreachable') setUnreachable(true);
      else setAsking(false);
    }
  };

  if (!asking) {
    return (
      <View style={styles.slot}>
        <SnaplyButton title="만들기 취소" variant="secondary" onPress={() => setAsking(true)} />
      </View>
    );
  }

  return (
    <View style={styles.slot}>
      <ThemedText type="small" themeColor="textSecondary">
        지금까지의 진행은 사라지고, 컷 구성은 그대로 남아요.
      </ThemedText>
      {unreachable ? (
        <ThemedText type="note" themeColor="danger">
          {GenerationRefusalMessages.unreachable}
        </ThemedText>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="계속 만들기"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => setAsking(false)}
          style={({ pressed }) => [
            styles.action,
            { borderColor: theme.border, opacity: busy ? 0.45 : pressed ? 0.7 : 1 },
          ]}
        >
          <ThemedText selectable={false} type="button">
            계속 만들기
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="만들기 취소"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => void confirm()}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: theme.danger,
              borderColor: theme.danger,
              opacity: busy ? 0.6 : pressed ? 0.8 : 1,
            },
          ]}
        >
          <ThemedText selectable={false} type="button" style={{ color: theme.onPrimary }}>
            {busy ? '취소하는 중…' : '만들기 취소'}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // One button tall in its resting state, matching the generate footer's slot,
  // so a run starting or ending does not resize the zones the stage is sized
  // against. The confirm step grows by its own lines — transient on purpose.
  slot: { minHeight: 56, justifyContent: 'center', gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.three },
  action: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
