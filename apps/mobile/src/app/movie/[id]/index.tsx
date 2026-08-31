import { useLocalSearchParams } from 'expo-router';

import { MoviePage } from '@/pages/movie';

export default function MovieRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  return <MoviePage movieId={typeof id === 'string' ? id : undefined} />;
}
