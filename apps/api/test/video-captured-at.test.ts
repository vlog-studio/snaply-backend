/**
 * 촬영 시각(`capturedAt`)의 계약을 고정한다.
 *
 * 이 값은 **서버가 소급해 알아낼 수 없다.** 클라이언트가 보내지 않은 채 업로드된 영상은
 * 영구히 `null`로 남고, 나중에 채워 넣을 방법이 없다(업로드 시각으로 대신 채우면 틀린 값이
 * 원천이 된다). 그래서 "선택값이되 응답에는 항상 존재한다"는 두 성질을 여기서 못 박는다.
 *
 * 실제 저장 여부는 S3 에 올라간 객체가 있어야 확인되는 경로라(`confirmUpload` 가 업로드된
 * 파일의 크기를 먼저 조회한다) CI 에서 돌릴 수 없다 — 그 검증은 `npm run media:e2e` 가 맡는다.
 * 여기서는 DB·S3 없이 계약만 검사한다.
 */
import { describe, expect, it } from 'vitest';
import { createVideoBodySchema, videoSchema } from '@vlog-studio/shared-types';

const validVideo = {
  id: '8f14e45f-ceea-467a-9e1b-1c3a2b4d5e6f',
  kind: 'source',
  originalUrls: [],
  editedUrl: null,
  thumbnailUrl: null,
  durationSeconds: 3,
  stylePreset: null,
  status: 'ready',
  playbackUrl: null,
  durationMs: 3237,
  capturedAt: '2026-09-09T04:15:30.000Z',
  createdAt: '2026-09-09T04:20:00.000Z',
};

describe('POST /videos 요청의 capturedAt', () => {
  it('ISO 8601 문자열을 받는다', () => {
    const parsed = createVideoBodySchema.parse({
      videoId: validVideo.id,
      durationSeconds: 3,
      capturedAt: '2026-09-09T04:15:30.000Z',
    });

    expect(parsed.capturedAt).toBe('2026-09-09T04:15:30.000Z');
  });

  it('생략할 수 있다 — 보내지 않는 클라이언트도 등록은 된다', () => {
    const parsed = createVideoBodySchema.parse({ videoId: validVideo.id });

    expect(parsed.capturedAt).toBeUndefined();
  });

  it('ISO 형식이 아니면 거부한다 — 파싱할 수 없는 값이 원천이 되면 안 된다', () => {
    for (const bad of ['2026-09-09', '1757390130000', 'yesterday', '']) {
      expect(createVideoBodySchema.safeParse({ videoId: validVideo.id, capturedAt: bad }).success).toBe(
        false,
      );
    }
  });
});

describe('Video 응답의 capturedAt', () => {
  it('전달되지 않은 영상은 null 로 나온다 (필드 자체는 생략하지 않는다)', () => {
    const parsed = videoSchema.parse({ ...validVideo, capturedAt: null });

    expect(parsed.capturedAt).toBeNull();
  });

  it('필드가 아예 없으면 거부한다 — 클라이언트가 `undefined`와 `null`을 구분하지 않아도 되게', () => {
    const { capturedAt: _omitted, ...withoutCapturedAt } = validVideo;

    expect(videoSchema.safeParse(withoutCapturedAt).success).toBe(false);
  });
});
