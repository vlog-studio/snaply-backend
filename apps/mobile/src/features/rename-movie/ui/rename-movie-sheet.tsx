import { BottomSheet } from '@/shared/ui/bottom-sheet';

import { RenameMovieForm } from './rename-movie-form';

export type RenameMovieSheetProps = {
  visible: boolean;
  movieId: string;
  /** The name to open on. */
  title: string;
  onClose: () => void;
};

/**
 * Renaming a movie, in a sheet of its own — the movie screen's entry point.
 *
 * The movie screen is its one consumer today — it names a draft (and a
 * finished movie, once it has been seen) — since the movie tab's selection
 * mode dropped rename from its bar. The form itself lives in
 * `RenameMovieForm`; this wraps it for a host with no modal of its own.
 *
 * The form is mounted with the movie's current name as its default, so it is
 * keyed by `movieId` at the call site to reset when the sheet moves to another
 * movie.
 */
export function RenameMovieSheet({ visible, movieId, title, onClose }: RenameMovieSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel="무비 이름 바꾸기">
      <RenameMovieForm movieId={movieId} title={title} onCancel={onClose} onSaved={onClose} />
    </BottomSheet>
  );
}
