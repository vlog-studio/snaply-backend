import { useLocalSearchParams } from 'expo-router';

import { AddSnapsPage } from '@/pages/add-snaps';

export default function AddSnapsRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  return <AddSnapsPage movieId={typeof id === 'string' ? id : undefined} />;
}
