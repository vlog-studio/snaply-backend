/**
 * MIME type for a recorded snap file, by its URI's extension.
 *
 * The presigned URL is signed against the `contentType` sent to
 * `GET /videos/upload-url`, and S3-style storage rejects a PUT whose
 * `Content-Type` header differs — so the same value must be derived once and
 * used in both places. Extensions mirror `shared/lib/recording-files`'s
 * accepted set; iOS records `.mov`, Android `.mp4`.
 */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
};

const FALLBACK_CONTENT_TYPE = 'video/mp4';

export function videoContentType(uri: string): string {
  const match = /\.[A-Za-z0-9]+$/.exec(uri);
  const extension = match?.[0].toLowerCase();
  return (extension && CONTENT_TYPE_BY_EXTENSION[extension]) || FALLBACK_CONTENT_TYPE;
}
