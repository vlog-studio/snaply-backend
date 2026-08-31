import { useLocalSearchParams } from 'expo-router';

import { MovieTemplatePage } from '@/pages/movie-template';

export default function MovieTemplateRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  return <MovieTemplatePage templateId={typeof id === 'string' ? id : undefined} />;
}
