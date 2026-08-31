import { Redirect, useLocalSearchParams } from 'expo-router';

import { SnapExtractPage } from '@/pages/snap-extract';

export default function ExtractRoute() {
  const { source, duration } = useLocalSearchParams<{ source?: string; duration?: string }>();
  if (typeof source !== 'string' || source.length === 0) {
    return <Redirect href="/(tabs)/snaps" />;
  }
  const knownDurationSec = Number(duration);
  return (
    <SnapExtractPage
      // A new source is a new screen: the player and the strip are pinned to
      // their mount-time file.
      key={source}
      sourceUri={source}
      knownDurationSec={
        Number.isFinite(knownDurationSec) && knownDurationSec > 0 ? knownDurationSec : undefined
      }
    />
  );
}
