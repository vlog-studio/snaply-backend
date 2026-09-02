/**
 * Phase 7 — SNS 연동 업로드 (Dev B 트랙).
 * 실키가 없으면 클라이언트가 mock 으로 동작하므로, OAuth state 검증·토큰 암호화 저장·
 * 업로드 이력·자동 갱신 같은 "우리 쪽 로직"을 전부 여기서 검증한다.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';
import { decrypt, encodeState } from '../src/lib/crypto.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.resetDb();
});

/** 편집이 끝난 영상 (SNS 업로드 가능 상태) */
async function createEditedVideo(userId: string, editedUrl = 'https://cdn.example.com/v.mp4') {
  return h.prisma.video.create({
    data: {
      userId,
      originalUrls: ['https://cdn.example.com/clip1.mp4'],
      editedUrl,
      status: 'completed',
      s3Key: `edited/${userId}/${randomUUID()}.mp4`,
    },
    select: { id: true },
  });
}

/** mock OAuth 콜백을 태워 실제 연동 상태를 만든다. */
async function connect(user: TestUser, platform: 'instagram' | 'tiktok', code = 'mock-code') {
  const state = encodeState(user.id);
  return h.app.inject({
    method: 'GET',
    url: `/sns/${platform}/callback?code=${code}&state=${encodeURIComponent(state)}`,
  });
}

describe('GET /sns/connections', () => {
  it('인증이 없으면 401', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/sns/connections' });
    expect(res.statusCode).toBe(401);
  });

  it('연동 전에는 빈 배열', async () => {
    const user = await h.createUser();
    const res = await h.app.inject({ method: 'GET', url: '/sns/connections', headers: user.auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });
});

describe('GET /sns/:platform/connect', () => {
  it('플랫폼별 authorize URL 을 반환한다', async () => {
    const user = await h.createUser();
    for (const platform of ['instagram', 'tiktok'] as const) {
      const res = await h.app.inject({
        method: 'GET',
        url: `/sns/${platform}/connect`,
        headers: user.auth,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.authorizeUrl).toContain(platform);
      // state 가 반드시 포함돼야 CSRF 검증이 가능하다
      expect(res.json().data.authorizeUrl).toContain('state=');
    }
  });

  it('인증이 없으면 401', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/sns/instagram/connect' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /sns/:platform/callback', () => {
  it('정상 콜백이면 연동을 저장하고 앱 딥링크로 리다이렉트한다', async () => {
    const user = await h.createUser();

    const res = await connect(user, 'instagram');

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('snaplyapp://sns/connected?platform=instagram');
    const conn = await h.prisma.snsConnection.findUnique({
      where: { userId_platform: { userId: user.id, platform: 'instagram' } },
    });
    expect(conn).not.toBeNull();
    expect(conn?.platformUsername).toBe('mock_instagram_user');
  });

  it('state 가 변조되면 연동하지 않고 에러 딥링크로 보낸다 (CSRF 차단)', async () => {
    const user = await h.createUser();
    const tampered = `${encodeState(user.id).split('.')[0]}.forgedsignature`;

    const res = await h.app.inject({
      method: 'GET',
      url: `/sns/instagram/callback?code=mock-code&state=${encodeURIComponent(tampered)}`,
    });

    expect(res.headers.location).toBe('snaplyapp://sns/error?platform=instagram&reason=invalid_state');
    expect(await h.prisma.snsConnection.count()).toBe(0);
  });

  it('code 가 없으면 에러 딥링크', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/sns/instagram/callback?state=x' });
    expect(res.headers.location).toContain('reason=missing_params');
  });

  it('사용자가 취소하면(error 파라미터) 에러 딥링크', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/sns/instagram/callback?error=access_denied&state=x',
    });
    expect(res.headers.location).toContain('reason=access_denied');
  });

  it('인스타그램 PERSONAL 계정은 거부하고 저장하지 않는다', async () => {
    const user = await h.createUser();

    const res = await connect(user, 'instagram', 'mock-personal');

    expect(res.headers.location).toBe('snaplyapp://sns/error?platform=instagram&reason=account_type');
    expect(await h.prisma.snsConnection.count()).toBe(0);
  });

  it('토큰은 평문이 아니라 암호화되어 저장된다', async () => {
    const user = await h.createUser();
    await connect(user, 'tiktok');

    const conn = await h.prisma.snsConnection.findUniqueOrThrow({
      where: { userId_platform: { userId: user.id, platform: 'tiktok' } },
    });

    // iv.tag.ciphertext 형식이고, 복호화하면 원래 토큰 형태가 나온다
    expect(conn.accessToken).toMatch(/^[\w+/=]+\.[\w+/=]+\.[\w+/=]+$/);
    expect(conn.accessToken).not.toContain('tt-mock-');
    expect(decrypt(conn.accessToken ?? '')).toMatch(/^tt-mock-/);
    expect(decrypt(conn.refreshToken ?? '')).toMatch(/^tt-refresh-/);
  });

  it('같은 플랫폼을 다시 연동하면 덮어쓴다 (중복 행 없음)', async () => {
    const user = await h.createUser();
    await connect(user, 'tiktok');
    const first = await h.prisma.snsConnection.findUniqueOrThrow({
      where: { userId_platform: { userId: user.id, platform: 'tiktok' } },
    });

    await connect(user, 'tiktok');
    const rows = await h.prisma.snsConnection.findMany({ where: { userId: user.id } });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.accessToken).not.toBe(first.accessToken);
  });
});

describe('DELETE /sns/:platform/disconnect', () => {
  it('연동을 해제한다', async () => {
    const user = await h.createUser();
    await connect(user, 'instagram');

    const res = await h.app.inject({
      method: 'DELETE',
      url: '/sns/instagram/disconnect',
      headers: user.auth,
    });

    expect(res.statusCode).toBe(200);
    expect(await h.prisma.snsConnection.count({ where: { userId: user.id } })).toBe(0);
  });

  it('연동이 없으면 404', async () => {
    const user = await h.createUser();
    const res = await h.app.inject({
      method: 'DELETE',
      url: '/sns/tiktok/disconnect',
      headers: user.auth,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /sns/:platform/upload', () => {
  it('연동 전에는 400', async () => {
    const user = await h.createUser();
    const video = await createEditedVideo(user.id);

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/instagram/upload',
      headers: user.auth,
      payload: { videoId: video.id },
    });

    expect(res.statusCode).toBe(400);
  });

  it('편집이 끝난 영상을 업로드하고 이력을 남긴다', async () => {
    const user = await h.createUser();
    await connect(user, 'instagram');
    const video = await createEditedVideo(user.id);

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/instagram/upload',
      headers: user.auth,
      payload: { videoId: video.id, caption: '오늘의 브이로그' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ platform: 'instagram', status: 'success' });
    expect(res.json().data.platformPostId).toMatch(/^ig-post-/);

    const upload = await h.prisma.snsUpload.findFirstOrThrow({ where: { userId: user.id } });
    expect(upload.status).toBe('success');
    expect(upload.videoId).toBe(video.id);
    expect(upload.uploadedAt).not.toBeNull();
  });

  it('편집이 안 끝난 영상은 400', async () => {
    const user = await h.createUser();
    await connect(user, 'tiktok');
    const video = await h.prisma.video.create({
      data: { userId: user.id, originalUrls: [], status: 'pending' },
      select: { id: true },
    });

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/tiktok/upload',
      headers: user.auth,
      payload: { videoId: video.id },
    });

    expect(res.statusCode).toBe(400);
  });

  it('남의 영상은 404 (소유권 격리)', async () => {
    const owner = await h.createUser();
    const attacker = await h.createUser();
    await connect(attacker, 'instagram');
    const video = await createEditedVideo(owner.id);

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/instagram/upload',
      headers: attacker.auth,
      payload: { videoId: video.id },
    });

    expect(res.statusCode).toBe(404);
  });

  it('videoId 가 uuid 형식이 아니면 400', async () => {
    const user = await h.createUser();
    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/instagram/upload',
      headers: user.auth,
      payload: { videoId: 'not-a-uuid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('틱톡 토큰 만료가 임박하면 업로드 전에 자동 갱신한다', async () => {
    const user = await h.createUser();
    await connect(user, 'tiktok');
    const before = await h.prisma.snsConnection.findUniqueOrThrow({
      where: { userId_platform: { userId: user.id, platform: 'tiktok' } },
    });
    // 만료 1분 전으로 만들어 갱신을 유도
    await h.prisma.snsConnection.update({
      where: { id: before.id },
      data: { tokenExpiresAt: new Date(Date.now() + 60_000) },
    });
    const video = await createEditedVideo(user.id);

    const res = await h.app.inject({
      method: 'POST',
      url: '/sns/tiktok/upload',
      headers: user.auth,
      payload: { videoId: video.id },
    });

    expect(res.statusCode).toBe(200);
    const after = await h.prisma.snsConnection.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.accessToken).not.toBe(before.accessToken);
    expect(after.tokenExpiresAt?.getTime()).toBeGreaterThan(Date.now() + 60_000);
  });
});
