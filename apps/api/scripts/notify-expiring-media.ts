/**
 * 스냅 만료 예고 알림 배치 (SNAP-13).
 *
 * **정리 배치(`media:purge-expired`)와 일부러 분리했다.** 정리는 새벽에 돌아도 되지만 예고는
 * 안 된다 — 사용자의 조용한 시간대 기본값이 22-08시라 그때 보내면 알림이 발송되지 않고
 * 버려지고, 사용자는 예고 없이 파일을 잃는다.
 *
 * 사용법:
 *   npm run media:notify-expiring -w apps/api            # 대상만 세고 종료 (dry-run)
 *   npm run media:notify-expiring -w apps/api -- --yes   # 실제 발송
 *
 * 운영에서는 **KST 오전 10시**(`EXPIRY_NOTICE_HOUR_KST`)에 하루 1회 실행을 상정한다.
 */
import { loadConfig } from '../src/config.js';
import { initFcm, isFcmDryRun } from '../src/services/fcm.service.js';
import { sendExpiryNotices } from '../src/services/expiry-notice.service.js';
import {
  EXPIRY_NOTICE_HOUR_KST,
  SNAP_EXPIRY_NOTICE_DAYS,
  SNAP_RETENTION_DAYS,
} from '../src/services/retention-policy.js';
import { disconnectPrisma } from '../src/db/client.js';

const apply = process.argv.includes('--yes');

const config = loadConfig();
initFcm(config.firebase);

const logger = {
  info: (o: object, m?: string): void => console.log(m ?? '', JSON.stringify(o)),
  warn: (o: object, m?: string): void => console.warn(m ?? '', JSON.stringify(o)),
};

try {
  console.log(
    `보관 ${SNAP_RETENTION_DAYS}일 · 예고 D-${SNAP_EXPIRY_NOTICE_DAYS.join(' / D-')} ` +
      `· 발송 예정 시각 KST ${EXPIRY_NOTICE_HOUR_KST}시`,
  );
  if (apply && isFcmDryRun()) {
    // 여기서 멈춘다. 계속 돌면 "발송 실패" 만 잔뜩 세고 끝나 원인이 묻힌다.
    console.error(
      'FCM 이 dry-run 이다 (FIREBASE_SERVICE_ACCOUNT_JSON 미설정). 실제 발송은 불가능하다.',
    );
    process.exitCode = 1;
  } else {
    const outcome = await sendExpiryNotices({ logger, apply });
    console.log(
      `\n${apply ? '발송' : '대상'}: 사용자 ${outcome.notified}명 · 스냅 ${outcome.videos}건`,
    );
    for (const [reason, count] of Object.entries(outcome.skipped)) {
      console.log(`  건너뜀(${reason}): ${count}명`);
    }
    if (!apply) {
      console.log('\n실제로 보내려면 --yes 를 붙인다.');
    }
  }
} finally {
  await disconnectPrisma();
}
