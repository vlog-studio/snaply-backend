import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import type { TransitionKind } from '@/entities/movie';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * The glyph a boundary wears in the timeline and in the picker, so the two
 * name a transition the same way: a plain line for a cut, half-and-half for a
 * crossfade, the dark for a dip, the bolt for a flash, the frame opening out
 * for a zoom punch.
 */
export const TransitionGlyph: Record<TransitionKind, IconName> = {
  hardcut: 'remove-outline',
  crossfade: 'contrast-outline',
  dip: 'moon-outline',
  flash: 'flash-outline',
  zoompunch: 'expand-outline',
};

/** A boundary the server has not picked for yet. */
export const PendingTransitionGlyph: IconName = 'ellipsis-horizontal';
