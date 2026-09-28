import { SNAP_ANALYSIS_CONSENT_VERSION } from '@vlog-studio/shared-types';
import type { Harness, TestUser } from './harness.js';

/**
 * 스냅 분석에 동의시킨다. 분석은 옵트인이라(specs ANA-5) 동의 없는 사용자의 분석·추천 요청은 403 이다 —
 * 분석 자체를 검증하는 테스트는 운영과 같은 경로(API)로 먼저 동의한다.
 */
export async function consentToAnalysis(h: Harness, user: TestUser): Promise<void> {
  const res = await h.app.inject({
    method: 'POST',
    url: '/auth/me/analysis-consent',
    headers: user.auth,
    payload: { version: SNAP_ANALYSIS_CONSENT_VERSION },
  });
  if (res.statusCode !== 200) {
    throw new Error(`분석 동의 실패: ${res.statusCode} ${res.body}`);
  }
}

/** 분석에 동의한 테스트 유저. */
export async function createConsentedUser(h: Harness): Promise<TestUser> {
  const user = await h.createUser();
  await consentToAnalysis(h, user);
  return user;
}
