/**
 * AdMob 보상형 광고 서버 측 검증(SSV) — 서명 검증과 파라미터 파싱만 담당한다.
 *
 * 지급 여부의 판단(세션·한도·중복)은 `ad-reward.service.ts` 가 한다. 여기는
 * "이 요청이 정말 Google 이 보낸 것인가" 하나만 답한다.
 *
 * 참고: https://developers.google.com/admob/android/ssv
 */
import { createVerify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { AdMobConfig } from '../../config.js';

/**
 * SSV 콜백이 싣고 오는 파라미터.
 *
 * `reward_amount`·`reward_item` 은 파싱만 하고 **지급량 결정에 쓰지 않는다** — 지급량의
 * 원천은 세션 발급 시점에 스냅샷된 정책값이다 (docs/decisions/ad-reward-credits.md §5).
 */
export interface SsvParams {
  adNetwork: string | null;
  adUnit: string | null;
  customData: string | null;
  keyId: string | null;
  rewardAmount: string | null;
  rewardItem: string | null;
  signature: string | null;
  timestampMs: number | null;
  transactionId: string | null;
  userId: string | null;
}

export function parseSsvQuery(query: URLSearchParams): SsvParams {
  const get = (key: string): string | null => query.get(key);
  const timestamp = Number(get('timestamp'));
  return {
    adNetwork: get('ad_network'),
    adUnit: get('ad_unit'),
    customData: get('custom_data'),
    keyId: get('key_id'),
    rewardAmount: get('reward_amount'),
    rewardItem: get('reward_item'),
    signature: get('signature'),
    // AdMob 은 epoch milliseconds 를 보낸다.
    timestampMs: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null,
    transactionId: get('transaction_id'),
    userId: get('user_id'),
  };
}

/**
 * 서명 대상 원문. AdMob 은 쿼리스트링에서 **`&signature=` 직전까지**를 서명한다.
 *
 * 그래서 `URLSearchParams` 로 다시 조립한 문자열을 쓰면 안 된다 — 인코딩·순서가 한 글자만
 * 달라도 검증이 실패한다. 반드시 수신한 raw 쿼리스트링을 그대로 잘라 쓴다.
 */
export function signedContentOf(rawQuery: string): string | null {
  const index = rawQuery.indexOf('&signature=');
  return index < 0 ? null : rawQuery.slice(0, index);
}

interface VerifierKey {
  keyId: number;
  pem: string;
}

let keyCache: Map<string, string> | null = null;
let inflight: Promise<Map<string, string>> | null = null;

/** 키셋을 다시 받게 한다. 테스트와 키 로테이션 대응 경로가 함께 쓴다. */
export function resetVerifierKeyCache(): void {
  keyCache = null;
  inflight = null;
}

async function readKeySet(url: string): Promise<string> {
  // 테스트는 로컬 키셋으로 바꿔 끼운다. fetch 는 file: 을 지원하지 않으므로 여기서 갈라진다.
  if (url.startsWith('file:')) {
    return readFile(fileURLToPath(url), 'utf-8');
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`AdMob 공개키 조회 실패: ${res.status}`);
  }
  return res.text();
}

async function loadKeys(config: AdMobConfig): Promise<Map<string, string>> {
  const text = await readKeySet(config.verifierKeysUrl);
  const parsed = JSON.parse(text) as { keys?: VerifierKey[] };
  const map = new Map<string, string>();
  for (const key of parsed.keys ?? []) {
    if (key.keyId !== undefined && typeof key.pem === 'string') {
      map.set(String(key.keyId), key.pem);
    }
  }
  return map;
}

/** `fromCache: false` 면 방금 원본에서 받아 온 키셋이라는 뜻 — 다시 받아 봐야 결과가 같다. */
async function keys(
  config: AdMobConfig,
): Promise<{ map: Map<string, string>; fromCache: boolean }> {
  if (keyCache) {
    return { map: keyCache, fromCache: true };
  }
  // 동시에 들어온 콜백이 키셋을 각자 받지 않도록 진행 중인 요청을 공유한다.
  inflight ??= loadKeys(config)
    .then((loaded) => {
      keyCache = loaded;
      return loaded;
    })
    .finally(() => {
      inflight = null;
    });
  return { map: await inflight, fromCache: false };
}

/**
 * ECDSA-SHA256 서명 검증.
 *
 * 모르는 `key_id` 가 오면 캐시를 **1회 강제 갱신한 뒤 재시도**한다 — Google 이 키를
 * 로테이션하면 새 키가 캐시에 없는 상태로 정상 콜백이 도착하기 때문이다. 갱신 후에도 없으면
 * 그때는 위조로 본다.
 */
export async function verifySsvSignature(params: {
  config: AdMobConfig;
  signedContent: string;
  signature: string;
  keyId: string;
}): Promise<boolean> {
  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(params.signature, 'base64url');
  } catch {
    return false;
  }
  if (signatureBytes.length === 0) {
    return false;
  }

  const first = await keys(params.config);
  let pem = first.map.get(params.keyId);
  if (!pem && first.fromCache) {
    // 캐시에 없는 키 = 로테이션일 수 있다. 캐시를 버리고 한 번만 다시 받아 재시도한다.
    resetVerifierKeyCache();
    pem = (await keys(params.config)).map.get(params.keyId);
  }
  if (!pem) {
    return false;
  }

  try {
    return createVerify('SHA256').update(params.signedContent).verify(pem, signatureBytes);
  } catch {
    return false; // 키가 깨졌거나 서명이 DER 형식이 아니다
  }
}
