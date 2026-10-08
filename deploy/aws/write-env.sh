#!/usr/bin/env bash
#
# Secrets Manager 의 시크릿 하나(키-값 JSON)를 compose 가 읽는 env 파일로 옮긴다(AWS 서버).
# 배포 잡이 매번 부르고, 시크릿만 바꿨을 때는 손으로 부른 뒤 컨테이너를 다시 올린다(docs/deployment-aws.md).
#
#   sudo -u snaply /data/compose/deploy/aws/write-env.sh
#
# AWS 키는 쓰지 않는다 — 인스턴스 역할로 읽는다.
#
# **빈 값은 옮기지 않는다.** 인프라가 키를 빈 값으로 미리 만들어 두었고, 코드에는 빈 문자열을 미설정으로 보지
# 않는 곳이 있다: 빈 `LOG_LEVEL` 은 API 기동 실패, 빈 `RATE_LIMIT_GLOBAL_MAX` 는 모든 요청 429(`/health`
# 까지 → ALB 가 대상을 빼 502), 빈 큐 이름은 이름 없는 큐다. 빠진 키는 코드의 기본값을 쓴다.
#
# 값은 작은따옴표로 감싼다 — compose 는 작은따옴표 안을 글자 그대로 읽는다. 감싸지 않으면 비밀번호의 `$` 가
# 치환되고 `#` 뒤가 주석으로 잘린다. 그래서 작은따옴표나 줄바꿈이 든 값은 받지 않고 멈춘다(조용히 깨진 값으로
# 뜨는 것보다 낫다). FCM 서비스 계정 JSON 은 한 줄로 넣는다 — 키의 `\n` 은 글자 그대로 두면 된다.
set -euo pipefail

SECRET_ID="${SNAPLY_SECRET_ID:-dweax/service/snaply/env}"
OUT="${SNAPLY_ENV_FILE:-/data/compose/.env}"
REGION="${AWS_REGION:-ap-northeast-2}"

umask 077
tmp="$(mktemp "${OUT}.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

secret="$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$SECRET_ID" \
  --query SecretString --output text)"

# 값이 문자열이 아니면(숫자 · 불리언) 문자열로 바꾼다. null 과 빈 문자열은 뺀다.
entries="$(jq -c '
  if type != "object" then error("시크릿이 키-값 JSON 이 아니다") else . end
  | to_entries[]
  | select(.value != null)
  | {key, value: (.value | if type == "string" then . else tostring end)}
  | select(.value != "")
' <<<"$secret")"

bad="$(jq -r '
  select((.key | test("^[A-Za-z_][A-Za-z0-9_]*$") | not)
         or (.value | test("[\u0027\n\r]")))
  | .key
' <<<"$entries")"
if [ -n "$bad" ]; then
  echo "env 파일로 옮길 수 없는 키가 있다(이름이 잘못됐거나 값에 작은따옴표 · 줄바꿈이 있다): $(echo "$bad" | paste -sd, -)" >&2
  exit 1
fi

jq -r '"\(.key)=\u0027\(.value)\u0027"' <<<"$entries" >"$tmp"

# compose 가 `${POSTGRES_PASSWORD:?}` 로 멈추기 전에 원인을 먼저 말한다.
if ! grep -q '^POSTGRES_PASSWORD=' "$tmp"; then
  echo "시크릿에 POSTGRES_PASSWORD 가 없다(비어 있어도 빠진다)" >&2
  exit 1
fi

mv "$tmp" "$OUT"
trap - EXIT
echo "$(wc -l <"$OUT" | tr -d ' ')개 키를 $OUT 에 썼다 (빈 값 $(jq -r 'to_entries[] | select(.value == "" or .value == null) | .key' <<<"$secret" | wc -l | tr -d ' ')개는 뺐다)"
