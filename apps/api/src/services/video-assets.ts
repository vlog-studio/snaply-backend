/**
 * 영상 행이 **소유한** S3 객체 — 영상을 지우는 모든 경로(사용자 삭제·만료·남은 객체 회수)가
 * 이것만 지운다.
 *
 * 편집 결과물(`kind: result`)의 `originalS3Keys` 는 원본 스냅의 키를 **복사해 둔 것**이다
 * (`edit-job.service` `createEditJob`). 결과물을 지우면서 그 키까지 지우면 원본 스냅의 파일이
 * 사라지는데, 원본 행은 `ready` 로 남아 목록에 뜨고 다시 만들기가 워커의 다운로드에서 실패한다
 * (backlog E-8). 그래서 결과물은 원본 키를 소유하지 않는다.
 *
 * 렌디션은 스냅이 소유한다. 빠뜨리면 지운 스냅의 재생 가능한 사본이 계정 purge 전까지 남는다.
 */
export interface VideoAssets {
  kind: string;
  s3Key: string | null;
  originalS3Keys: string[];
  editedS3Key: string | null;
  thumbnailS3Key: string | null;
  renditionS3Key: string | null;
}

export const VIDEO_ASSET_SELECT = {
  id: true,
  kind: true,
  s3Key: true,
  originalS3Keys: true,
  editedS3Key: true,
  thumbnailS3Key: true,
  renditionS3Key: true,
} as const;

export function ownedObjectKeys(video: VideoAssets): string[] {
  const borrowed = video.kind === 'result';
  const keys = [
    video.s3Key,
    ...(borrowed ? [] : video.originalS3Keys),
    video.editedS3Key,
    video.thumbnailS3Key,
    video.renditionS3Key,
  ].filter((key): key is string => typeof key === 'string' && key.length > 0);
  // 스냅은 `s3Key` 와 `originalS3Keys` 가 같은 키를 가리킨다 — 한 번만 지운다.
  return [...new Set(keys)];
}
