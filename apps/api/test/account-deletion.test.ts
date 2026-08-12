/**
 * 계정 삭제 수명주기 — 소프트 삭제 / 접근 차단 / 복구 / 유예 만료 실삭제.
 * 배경: docs/decisions/account-deletion.md
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHarness, type Harness } from './helpers/harness.js';
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  purgeExpiredAccounts,
} from '../src/services/account.service.js';
import { ensureBucketForDev } from '../src/services/storage.service.js';

let h: Harness;

beforeAll(async () => {
  // purge 가 auth 스텁의 Admin API(DELETE /auth/v1/admin/users/{uid})를 호출한다
  h = await createHarness({ SUPABASE_SERVICE_ROLE_KEY: 'stub-service-role-key' });
  // purge 의 S3 prefix 삭제가 실제 MinIO 를 치므로 버킷이 있어야 한다
  await ensureBucketForDev();
});
afterAll(async () => {
  await h.close();
});

const DAY_MS = 24 * 60 * 60 * 1000;

describe('DELETE /auth/me', () => {
  it('소프트 삭제하고 FCM 토큰·SNS 연동·구독을 즉시 정리한다', async () => {
    const user = await h.createUser();
    await h.prisma.user.update({
      where: { id: user.id },
      data: { fcmToken: 'fcm-token-1' },
    });
    await h.prisma.snsConnection.create({
      data: { userId: user.id, platform: 'instagram', accessToken: 'encrypted' },
    });
    await h.prisma.subscription.create({
      data: {
        userId: user.id,
        plan: 'standard',
        status: 'active',
        stripeCustomerId: 'cus_mock_1',
        stripeSubscriptionId: 'sub_mock_1',
      },
    });

    const res = await h.app.inject({ method: 'DELETE', url: '/auth/me', headers: user.auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.deleted).toBe(true);
    expect(res.json().data.purgeAfter).toBeTruthy();

    const row = await h.prisma.user.findUnique({ where: { id: user.id } });
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.fcmToken).toBeNull();
    expect(await h.prisma.snsConnection.count({ where: { userId: user.id } })).toBe(0);

    const sub = await h.prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(sub).toMatchObject({ plan: 'free', status: 'canceled', stripeSubscriptionId: null });
  });

  it('진행 중이던 편집 작업을 실패 처리한다', async () => {
    const user = await h.createUser();
    const video = await h.prisma.video.create({
      data: { userId: user.id, status: 'ready' },
    });
    const job = await h.prisma.editJob.create({
      data: { userId: user.id, videoId: video.id, status: 'queued' },
    });

    const res = await h.app.inject({ method: 'DELETE', url: '/auth/me', headers: user.auth });
    expect(res.statusCode).toBe(200);

    const updated = await h.prisma.editJob.findUnique({ where: { id: job.id } });
    expect(updated?.status).toBe('failed');
    expect(updated?.errorMessage).toContain('계정 삭제');
  });

  it('삭제 후 인증 라우트는 403 ACCOUNT_PENDING_DELETION 을 반환한다', async () => {
    const user = await h.createUser();
    await h.app.inject({ method: 'DELETE', url: '/auth/me', headers: user.auth });

    const res = await h.app.inject({ method: 'GET', url: '/auth/me', headers: user.auth });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ACCOUNT_PENDING_DELETION');
  });

  it('유예 중 요청의 403 은 삭제 응답과 동일한 purgeAfter 를 담는다', async () => {
    const user = await h.createUser();
    const deleted = await h.app.inject({
      method: 'DELETE',
      url: '/auth/me',
      headers: user.auth,
    });
    expect(deleted.statusCode).toBe(200);

    const res = await h.app.inject({ method: 'GET', url: '/auth/me', headers: user.auth });
    expect(res.statusCode).toBe(403);
    // 같은 deletedAt 에서 계산되므로 문자열까지 일치해야 한다 (purgeAfterFor 단일 출처)
    expect(res.json().error.purgeAfter).toBe(deleted.json().data.purgeAfter);
  });
});

describe('POST /auth/me/restore', () => {
  it('유예 기간 중 복구하면 다시 접근할 수 있다', async () => {
    const user = await h.createUser();
    await h.app.inject({ method: 'DELETE', url: '/auth/me', headers: user.auth });

    const restore = await h.app.inject({
      method: 'POST',
      url: '/auth/me/restore',
      headers: user.auth,
    });
    expect(restore.statusCode).toBe(200);
    expect(restore.json().data.restored).toBe(true);

    const me = await h.app.inject({ method: 'GET', url: '/auth/me', headers: user.auth });
    expect(me.statusCode).toBe(200);
  });

  it('삭제 대기 상태가 아니면 400', async () => {
    const user = await h.createUser();
    const res = await h.app.inject({
      method: 'POST',
      url: '/auth/me/restore',
      headers: user.auth,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('purgeExpiredAccounts', () => {
  it('유예 기간이 지난 계정만 실삭제한다 (자식 행 Cascade, Supabase Auth 삭제 포함)', async () => {
    const expired = await h.createUser();
    const inGrace = await h.createUser();
    const active = await h.createUser();

    await h.prisma.video.create({ data: { userId: expired.id, status: 'ready' } });
    await h.prisma.user.update({
      where: { id: expired.id },
      data: { deletedAt: new Date(Date.now() - (ACCOUNT_DELETION_GRACE_DAYS + 1) * DAY_MS) },
    });
    await h.prisma.user.update({
      where: { id: inGrace.id },
      data: { deletedAt: new Date() },
    });

    const result = await purgeExpiredAccounts();

    expect(result.purged).toEqual([expired.id]);
    expect(result.failed).toEqual([]);
    expect(await h.prisma.user.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await h.prisma.video.count({ where: { userId: expired.id } })).toBe(0);
    expect(h.stub.adminDeletedUids).toContain(expired.sub);

    // 유예 중·활성 계정은 남는다
    expect(await h.prisma.user.findUnique({ where: { id: inGrace.id } })).not.toBeNull();
    expect(await h.prisma.user.findUnique({ where: { id: active.id } })).not.toBeNull();
    expect(h.stub.adminDeletedUids).not.toContain(inGrace.sub);
  });
});
