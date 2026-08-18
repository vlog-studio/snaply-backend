# 로컬 서버를 임시 공개 주소로 노출하기 (cloudflared)

> **작성일**: 2026-08-18
> **원천**: 로컬 개발 서버를 외부에서 호출할 수 있게 만드는 절차와 그때의 주의사항
> **관련 문서**: [sns-setup.md](./sns-setup.md) (인스타·틱톡 연동에서의 사용) ·
> [decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md) (AdMob SSV 검증 규칙) ·
> [backlog.md](./backlog.md) (고정 도메인 D-1, AdMob 콘솔 설정 C-6)

---

## 1. 언제 필요한가

**외부 서비스가 우리 서버를 직접 호출하거나 우리 URL을 직접 내려받는 경우**에만 필요하다.
그 서비스는 인터넷에서 우리를 찾아와야 하므로 `localhost`·`127.0.0.1`·`192.168.x.x` 로는 되지
않는다. 우리가 밖으로 나가는 호출(Supabase, RevenueCat API 조회 등)은 터널이 필요 없다.

| 사례 | 왜 필요한가 | 노출 대상 |
|---|---|---|
| AdMob 보상형 광고 SSV 콜백 | Google이 `GET /billing/webhook/admob` 을 직접 호출한다 | API (:3000) |
| RevenueCat 웹훅 | RevenueCat이 `POST /billing/webhook/revenuecat` 을 호출한다 | API (:3000) |
| 인스타·틱톡 OAuth 콜백 | 콘솔에 등록하는 리디렉션 URI는 공개 https 만 허용된다 | API (:3000) |
| 인스타·틱톡 영상 업로드 | 플랫폼이 우리가 준 URL로 영상을 **내려받는다**(PULL) | MinIO (:9100) |

SNS 두 사례는 버킷 익명 읽기 등 추가 준비가 함께 필요하다 — [sns-setup.md](./sns-setup.md) §1을 본다.

## 2. 설치

cloudflared는 Node 패키지가 아니라 독립 바이너리다. 계정 가입은 필요 없다(임시 주소는 익명으로 발급된다).

**macOS**

```bash
brew install cloudflared
```

**Windows (PowerShell)**

```powershell
winget install --id Cloudflare.cloudflared
```

winget을 쓸 수 없으면 실행 파일만 받아서 그 자리에서 써도 된다.

```powershell
curl.exe -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
```

## 3. 임시 주소 띄우기

서버를 먼저 띄운 뒤(`npm run dev:api` 또는 `npm run stack`), **서버가 돌고 있는 그 기기에서** 실행한다.

```bash
cloudflared tunnel --url http://localhost:3000
```

출력에 `https://<랜덤-단어들>.trycloudflare.com` 이 나온다. 이 주소가 로컬 3000번 포트로 연결된다.
터널 프로세스는 **테스트하는 동안 계속 켜 둬야 한다** — 창을 닫으면 주소가 죽는다.

확인:

```bash
curl https://<랜덤-단어들>.trycloudflare.com/health
```

`{"success":true,"data":{"status":"ok",...}}` 가 오면 외부에서 우리 서버에 닿은 것이다.
외부 콘솔에 넣을 값은 **이 주소 + 엔드포인트 경로**다.

```text
https://<랜덤-단어들>.trycloudflare.com/billing/webhook/admob
```

MinIO를 노출해야 하면 같은 방식으로 포트만 바꿔 하나 더 띄운다(`--url http://localhost:9100`).

## 4. 주의사항

- **주소는 재시작마다 바뀐다.** 바뀌면 `.env`(`API_BASE_URL` 등)와 외부 콘솔에 등록한 URL을
  **양쪽 다** 고쳐야 한다. 반복이 부담이면 §6의 고정 주소로 간다.
- **서버 전체가 공개된다.** 노출되는 것은 웹훅 경로 하나가 아니라 그 포트의 모든 라우트다.
  로컬은 보통 `NODE_ENV=development` 라 Swagger `/docs` 와 개발 로그인(`/docs/auth/token`)까지
  함께 열린다. 랜덤 호스트명이라 발견 가능성은 낮지만, **테스트가 끝나면 터널을 닫는다.**
- **컨테이너로 띄웠다면 호스트 포트를 노출해야 한다.** `npm run stack` 은 API를
  `${API_HOST_PORT:-3000}` 으로 호스트에 매핑하므로 `http://localhost:3000` 이 맞다.
  컨테이너 내부 주소(`http://api:3000`)를 터널에 넘기면 호스트에서는 닿지 않는다.
- **등록하는 URL에 쿼리 파라미터를 임의로 붙이지 않는다.** 특히 AdMob SSV는 서명 대상이
  쿼리스트링이라, 우리가 덧붙인 파라미터가 정상 콜백을 위조로 만든다.
- **ngrok 대신 cloudflared를 권한다.** ngrok 무료 플랜은 브라우저성 요청에 경고 인터스티셜을
  끼워 넣어 외부 콘솔의 URL 검증이 실패할 수 있고, 고정 도메인도 1개뿐이라 프로젝트 간 공유가 어렵다.

## 5. 실제 사례 — AdMob SSV 콜백 등록

2026-08-18에 이 경로로 실제 콜백을 받아 검증했다. 순서는 이렇다.

1. 서버가 도는 기기에서 터널을 띄우고 `/health` 로 외부 도달을 확인한다.
2. `apps/api/.env` 에 `AD_REWARD_ENABLED=true` 와 `ADMOB_SSV_ALLOWED_AD_UNITS`(광고 단위 ID)를
   넣고 서버를 재시작한다. 허용 목록이 비어 있으면 **모든 콜백이 거절된다.**
3. AdMob 콘솔 → 앱 → 광고 단위 → 보상형 단위 → 고급 설정 → 서버 측 확인 →
   콜백 URL에 `https://<터널주소>/billing/webhook/admob` 을 넣고 `URL 확인` 을 누른다.

`URL 확인` 에서 알아 둘 것:

- 확인 요청은 단순 핑이 아니라 **Google 개인키로 서명된 진짜 콜백**이다. 다만 `ad_unit` 과
  `transaction_id` 는 더미값(`1234567890`, `123456789`)이고, `사용자 ID`·`맞춤 데이터` 칸에
  입력한 값은 그대로 실려 온다.
- 그래서 실제 광고 단위 ID만 허용 목록에 있으면 이 확인은 **광고 단위 불일치로 400** 이 되고
  URL 검증이 실패한다. 통과시키려면 확인하는 동안만 `1234567890` 을 허용 목록에 임시로 덧붙인다.
- **확인이 끝나면 `1234567890` 을 반드시 제거하고 재시작한다.** 남겨 두면, 세션 `nonce` 가 유출된
  경우 제3자가 자기 AdMob 콘솔의 URL 확인 기능으로 서명된 더미 콜백을 만들어 지급받을 수 있다.
  콜백 URL 설정은 이미 저장돼 있으므로 다시 확인할 필요는 없다.
- `맞춤 데이터` 에 살아 있는 세션의 `nonce`, `사용자 ID` 에 `ssvUserId` 를 넣으면
  (`POST /billing/ad-rewards` 응답값) 실기기 없이 실제 지급 1건까지 만들어 원장 기록을 확인할 수 있다.
  세션 TTL이 300초이므로 **콘솔 입력을 먼저 채워 두고 마지막에 세션을 발급**하는 편이 낫다.

검증 규칙 자체(서명·세션·한도·중복)는 [decisions/ad-reward-credits.md](./decisions/ad-reward-credits.md) §5가 원천이다.

## 6. 고정 주소가 필요하면

Cloudflare에 등록된 도메인이 있으면 named tunnel로 고정 서브도메인을 쓸 수 있고, 콘솔 재등록이
사라진다. 절차는 [`apps/api/scripts/dev-tunnel.sh`](../apps/api/scripts/dev-tunnel.sh) 가
자동화해 두었다(사전에 `cloudflared tunnel login` 1회 — 브라우저 인증이라 사람이 해야 한다).

```bash
./apps/api/scripts/dev-tunnel.sh <도메인> --run
```

운영용 고정 도메인은 별개 작업이다 — [backlog.md](./backlog.md) D-1.

## 7. 트러블슈팅

| 증상 | 원인 | 대응 |
|---|---|---|
| 터널 주소로 `/health` 가 응답 없음 | 서버가 안 떠 있거나 포트가 다르다 | 그 기기에서 `curl http://localhost:3000/health` 부터 확인 |
| 로컬은 되는데 터널은 502 | 컨테이너 내부 포트를 터널에 넘겼다 | 호스트에 매핑된 포트(`API_HOST_PORT`, 기본 3000)를 쓴다 |
| 외부 콘솔의 URL 검증 실패 | 우리 응답이 2xx가 아니다 | 서버 로그에서 그 요청의 `url` 과 상태 코드를 확인한다. 요청 원문이 로그에 남는다 |
| 어제 쓰던 주소가 죽었다 | 임시 주소는 재시작마다 바뀐다 | 새 주소로 `.env` 와 콘솔을 갱신하거나 §6으로 간다 |
| 콜백이 오는데 계속 거절된다 | 허용 목록·킬 스위치·세션 만료 | AdMob은 `ad_rewards.status`·`reject_reason` 에 이유가 남는다(`npm run db:studio`) |

## 8. 에이전트에게

이 문서를 근거로 사용자를 안내할 때:

- **터널은 대신 열어 줄 수 없다.** 서버가 다른 기기(다른 노트북·Windows 등)에 떠 있는 경우가
  흔하고, 터널은 그 기기에서 떠야 한다. 명령을 주고 **출력된 주소를 받아 온다.**
- 받은 주소는 `curl <주소>/health` 로 **실제 도달을 먼저 확인**한다. 이후 디버깅의 절반이 여기서 갈린다.
- 외부 콘솔의 클릭 절차(메뉴 이동, 저장)는 사용자가 한다. 우리는 넣을 값을 정확한 문자열로 만들어 준다.
- 터널 주소는 **공개**라는 사실을 함께 알린다(§4). 특히 `/docs` 와 개발 로그인이 열린다는 점.
- 임시로 완화한 설정(예: §5의 더미 광고 단위)은 **되돌릴 시점을 같은 대화에서 명시**한다.
  완화한 채로 대화가 끝나면 그대로 남는다.
- 콜백이 거절되면 추측하지 말고 **서버 로그의 요청 원문**을 받아 본다. 파라미터 인코딩까지
  드러나므로 원인이 대개 그 한 줄에서 확정된다.
