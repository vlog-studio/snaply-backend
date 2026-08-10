#!/usr/bin/env bash
# 고정 주소 개발 터널 (cloudflared named tunnel).
#
# 왜 필요한가 — 인스타/틱톡 콘솔에 등록한 OAuth 리디렉션 URI 는 주소가 바뀌면 매번 다시
# 등록해야 한다. `cloudflared tunnel --url` 로 만드는 임시 주소(trycloudflare.com)는
# 재시작할 때마다 바뀌므로, 보유 도메인에 고정 서브도메인을 붙여 그 반복을 없앤다.
#
# 사전 준비 (1회, 브라우저 인증이라 사람이 해야 함):
#   cloudflared tunnel login
#     → 브라우저에서 Cloudflare 로그인 후 사용할 도메인(zone)을 선택하면
#       ~/.cloudflared/cert.pem 이 생성된다.
#
# 사용:
#   ./scripts/dev-tunnel.sh <도메인>            # 터널 생성 + DNS 연결 + 설정 파일 작성
#   ./scripts/dev-tunnel.sh <도메인> --run      # 위 작업 후 바로 실행
#
# 예: ./scripts/dev-tunnel.sh snaply.app
#   → https://api-dev.snaply.app    (API   :3000)
#   → https://media-dev.snaply.app  (MinIO :9100)

set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "사용법: $0 <도메인> [--run]" >&2
  echo "예:    $0 snaply.app" >&2
  exit 1
fi

TUNNEL_NAME="${TUNNEL_NAME:-snaply-dev}"
API_HOST="api-dev.${DOMAIN}"
MEDIA_HOST="media-dev.${DOMAIN}"
CF_DIR="${HOME}/.cloudflared"
CONFIG="${CF_DIR}/${TUNNEL_NAME}.yml"

if [[ ! -f "${CF_DIR}/cert.pem" ]]; then
  echo "먼저 로그인이 필요합니다 (브라우저 인증):" >&2
  echo "    cloudflared tunnel login" >&2
  exit 1
fi

# 1) 터널 생성 (이미 있으면 재사용)
if cloudflared tunnel list --output json 2>/dev/null | grep -q "\"name\":\"${TUNNEL_NAME}\""; then
  echo "터널 재사용: ${TUNNEL_NAME}"
else
  echo "터널 생성: ${TUNNEL_NAME}"
  cloudflared tunnel create "${TUNNEL_NAME}"
fi

TUNNEL_ID="$(cloudflared tunnel list --output json | python3 -c "
import json,sys
for t in json.load(sys.stdin):
    if t['name'] == '${TUNNEL_NAME}':
        print(t['id']); break
")"
if [[ -z "${TUNNEL_ID}" ]]; then
  echo "터널 ID를 찾지 못했습니다." >&2
  exit 1
fi
echo "터널 ID: ${TUNNEL_ID}"

# 2) DNS 연결 (CNAME → 터널). 이미 있으면 무시.
for host in "${API_HOST}" "${MEDIA_HOST}"; do
  echo "DNS 연결: ${host}"
  cloudflared tunnel route dns "${TUNNEL_NAME}" "${host}" 2>&1 | sed 's/^/  /' || true
done

# 3) ingress 설정 — 호스트명으로 API 와 MinIO 를 나눈다.
cat > "${CONFIG}" <<YAML
tunnel: ${TUNNEL_ID}
credentials-file: ${CF_DIR}/${TUNNEL_ID}.json

ingress:
  - hostname: ${API_HOST}
    service: http://localhost:3000
  - hostname: ${MEDIA_HOST}
    service: http://localhost:9100
  - service: http_status:404
YAML
echo "설정 파일: ${CONFIG}"

cat <<INFO

── apps/api/.env 에 넣을 값 ──────────────────────────────
API_BASE_URL=https://${API_HOST}
INSTAGRAM_REDIRECT_URI=https://${API_HOST}/sns/instagram/callback
TIKTOK_REDIRECT_URI=https://${API_HOST}/sns/tiktok/callback
CLOUDFRONT_DOMAIN=https://${MEDIA_HOST}/snaply-dev

── 플랫폼 콘솔에 등록할 값 ────────────────────────────────
인스타 리디렉션 URI : https://${API_HOST}/sns/instagram/callback
틱톡  리디렉션 URI : https://${API_HOST}/sns/tiktok/callback
서비스 URL         : https://${API_HOST}/
이용약관           : https://${API_HOST}/legal/terms
개인정보처리방침    : https://${API_HOST}/legal/privacy

── 실행 ──────────────────────────────────────────────────
cloudflared tunnel --config ${CONFIG} run

INFO

if [[ "${2:-}" == "--run" ]]; then
  exec cloudflared tunnel --config "${CONFIG}" run
fi
