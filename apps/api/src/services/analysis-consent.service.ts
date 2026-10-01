/**
 * 스냅 분석 동의 — 조회·동의·철회와, 분석을 돌려도 되는지의 판정.
 *
 * 분석은 사용자가 동의해야 돈다(옵트인). 법무 검토 전에도 분석을 켤 수 있게 한 근거가 이 동의라서
 * (docs/decisions/snap-content-analysis.md §6.1, specs ANA-5·REC-4) **판정은 서버가 한다** — 앱이
 * 묻는 화면을 건너뛰어도, 분석 요청과 추천 요청이 모두 여기를 거친다.
 */
import { SNAP_ANALYSIS_CONSENT_VERSION, type AnalysisConsent } from '@vlog-studio/shared-types';
import { getPrisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';

export const SNAP_ANALYSIS_CONSENT_KIND = 'snap_analysis';

/**
 * 스냅 분석 경로의 서버 스위치. **기본은 꺼짐이다.** 켜도 동의한 사용자에게만 돈다.
 *
 * 이름은 추천이 먼저 쓰던 `MOVIE_RECOMMENDATION_ENABLED` 그대로다 — 분석 요청에도 같은 스위치를
 * 건 것이지 스위치를 하나 더 둔 것이 아니다. 둘로 나누면 "추천은 꺼졌는데 분석은 켜진" 상태가
 * 생기고, 그건 아무도 원하지 않는 상태다.
 *
 * 호출 시점에 읽는다 — 기동 시점에 고정하면 끄고 켜는 데 재배포가 필요해진다.
 */
export function isSnapAnalysisEnabled(): boolean {
  return process.env.MOVIE_RECOMMENDATION_ENABLED === 'true';
}

/**
 * 현재 문구 버전에 대한, 철회하지 않은 동의. 문구가 바뀌어 버전이 오르면 이전 버전의 행은
 * 건드리지 않아도 여기서 걸리지 않는다 — 사용자가 본 적 없는 문구에 동의한 것으로 치지 않는다.
 */
async function findActiveConsent(userId: string): Promise<{ grantedAt: Date } | null> {
  return getPrisma().userConsent.findFirst({
    where: {
      userId,
      kind: SNAP_ANALYSIS_CONSENT_KIND,
      version: SNAP_ANALYSIS_CONSENT_VERSION,
      revokedAt: null,
    },
    orderBy: { grantedAt: 'desc' },
    select: { grantedAt: true },
  });
}

function toDto(active: { grantedAt: Date } | null): AnalysisConsent {
  return {
    available: isSnapAnalysisEnabled(),
    currentVersion: SNAP_ANALYSIS_CONSENT_VERSION,
    granted: active !== null,
    grantedAt: active?.grantedAt.toISOString() ?? null,
  };
}

export async function readAnalysisConsent(userId: string): Promise<AnalysisConsent> {
  return toDto(await findActiveConsent(userId));
}

/**
 * 동의. **멱등하다** — 현재 버전의 동의가 이미 있으면 새 행을 만들지 않고 그 시각을 돌려준다.
 *
 * 앱이 보여 준 문구가 현재 버전이 아니면 409 다. 사용자가 본 문구와 서버가 기록할 문구가 다르면
 * 그 기록은 사용자가 동의한 내용의 증거가 되지 못한다.
 */
export async function giveAnalysisConsent(
  userId: string,
  version: string,
): Promise<AnalysisConsent> {
  if (version !== SNAP_ANALYSIS_CONSENT_VERSION) {
    throw new AppError(
      409,
      'CONSENT_VERSION_MISMATCH',
      '동의 문구가 바뀌었습니다. 바뀐 문구를 다시 확인해 주세요.',
    );
  }
  const existing = await findActiveConsent(userId);
  if (existing) {
    return toDto(existing);
  }
  const created = await getPrisma().userConsent.create({
    data: { userId, kind: SNAP_ANALYSIS_CONSENT_KIND, version },
    select: { grantedAt: true },
  });
  return toDto(created);
}

/**
 * 철회. 그 뒤로 분석하지 않고 **이미 만든 분석 결과와 추천 기록을 파기한다**(ANA-5).
 *
 * 추천 기록과 편집 초안 기록도 지운다 — 제외 사유(`unusable` 등)나 뺀 스냅이 분석의 판단을 담고 있을 수 있다. 큐에 남은 분석
 * 작업은 행이 사라졌으므로 워커가 건너뛴다(`analysis_worker.py` 의 `AnalysisSkipped`). 철회 순간
 * 이미 모델에 보내는 중이던 1건은 되돌릴 수 없고, 결과는 저장할 행이 없어 버려진다.
 *
 * 동의 행은 지우지 않고 `revokedAt` 을 채운다 — 언제 동의했고 언제 거뒀는지가 남아야 한다.
 * 철회할 동의가 없어도 성공이다(멱등). 파기는 그 경우에도 한다.
 */
export async function withdrawAnalysisConsent(userId: string): Promise<AnalysisConsent> {
  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.userConsent.updateMany({
      where: { userId, kind: SNAP_ANALYSIS_CONSENT_KIND, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.videoAnalysis.deleteMany({ where: { userId } }),
    prisma.movieRecommendation.deleteMany({ where: { userId } }),
    prisma.movieDraft.deleteMany({ where: { userId } }),
  ]);
  return toDto(null);
}

/** 현재 문구 버전에 대한 동의가 없으면 403. 스위치를 따로 검사하는 쪽(추천)이 쓴다. */
export async function requireAnalysisConsent(userId: string): Promise<void> {
  if (!(await findActiveConsent(userId))) {
    throw new AppError(403, 'ANALYSIS_CONSENT_REQUIRED', '스냅 분석에 동의해야 쓸 수 있습니다.');
  }
}

/** 분석을 돌려도 되는가 — 서버 스위치가 꺼져 있으면 503, 사용자 동의가 없으면 403. */
export async function requireAnalysisAccess(userId: string): Promise<void> {
  if (!isSnapAnalysisEnabled()) {
    throw new AppError(503, 'ANALYSIS_DISABLED', '스냅 분석이 아직 활성화되지 않았습니다.');
  }
  await requireAnalysisConsent(userId);
}
