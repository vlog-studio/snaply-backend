import { useLocalSearchParams } from 'expo-router';

import { AddSnapsPage } from '@/pages/add-snaps';

export default function AddSnapsRoute() {
  // `?only=left-out` — the movie screen offering back what the edit draft left out.
  const { id, only } = useLocalSearchParams<{ id?: string; only?: string }>();

  return (
    <AddSnapsPage
      movieId={typeof id === 'string' ? id : undefined}
      onlyLeftOut={only === 'left-out'}
    />
  );
}
