# 팀 작업 분담 (2인)

개발자 2명이 실제 구동·검증·수정을 나눠서 진행하기 위한 가이드.
전체 진행 기록은 [PROGRESS.md](./PROGRESS.md), API 명세는 [api-spec.md](./api-spec.md) 참고.

> 분담 축: **기능 도메인(수직)** 기준. 레이어(API vs 워커)로 나누지 않고, 각자 end-to-end로 책임진다.
> 이유: 두 트랙이 서로 다른 파일을 건드려 병합 충돌이 적고, 각자 자기 기능을 실제로 돌려보며 검증할 수 있다.

---

## 0. 공통 기반 (분담 전에 둘 다 세팅)

두 사람 모두 아래가 먼저 되어 있어야 함:

- **Phase 1~2 (프로젝트 세팅 + 인증)** — 모든 기능의 토대. 로컬에서 서버가 뜨고 `GET /auth/me`가 동작하는 상태.
- **로컬 인프라** — 각자 자기 머신에 MinIO(9100)/Redis(6379) 컨테이너 기동. `.env`는 git 제외라 각자 관리.
- **Supabase(공유 클라우드 DB)** — 유일한 공유 자원. 마이그레이션 규칙(§4) 준수.
- 온보딩 순서는 `ONBOARDING.md` 참고.

---

## 1. 분담표

| | **Dev A — 미디어/편집 트랙** | **Dev B — 연동/수익화 트랙** |
|---|---|---|
| **Phase** | 3 (영상 업로드) · 4 (편집 큐/WS) · 5 (AI 편집 엔진) | 6 (위치/FCM) · 7 (SNS 연동) · 8 (결제) |
| **핵심 스택** | S3(MinIO), Redis/BullMQ, **Python 워커**(FFmpeg·faster-whisper) | 외부 API: Firebase, Instagram/TikTok, Stripe |
| **주요 파일** | `routes/videos·edit-jobs`<br>`services/video·edit-job·storage`<br>`queue/`, `apps/ai-worker/**` | `routes/locations·notifications·sns·billing`<br>`services/fcm·location·sns·billing`<br>`services/sns/*`, `services/billing/*` |
| **DB 테이블** | videos, edit_jobs | locations, notification_logs, sns_connections, sns_uploads, subscriptions |
| **담당 크리덴셜** | AWS S3/CloudFront (운영 전환 시) | Firebase 서비스계정, Instagram/TikTok 앱키, Stripe 키 |
| **Phase 9 분담** | Docker/Compose/배포 파이프라인, AI 워커 이미지 | Sentry, Rate limit, API 문서(Swagger/api-spec) |

- **users 테이블 / 인증(`plugins/auth`, `services/user`)**은 공통 소유 — 변경 시 양쪽 합의.
- **Swagger `/docs`** 는 두 트랙 모두 자기 라우트에 `tags/summary`만 맞춰 추가.

---

## 2. 실제 검증 우선순위 (mock → 실제)

지금까지는 개발 환경에서 mock/dry-run으로 검증됨. 실제 크리덴셜로 재검증이 필요한 항목:

| 항목 | 담당 | 필요한 것 | 지금 가능? |
|---|---|---|---|
| Stripe 실제 결제 (P8) | B | Stripe 테스트 키 + Price ID | ✅ 바로 가능 (앱/기기 불필요) |
| Sentry 실제 수집 (P9) | B | Sentry DSN | ✅ 바로 가능 |
| 영상 편집 파이프라인 (P3~5) | A | (로컬 MinIO/Redis/ffmpeg) | ✅ 로컬로 대부분 가능 |
| FCM 실제 푸시 (P6) | B | Firebase 서비스계정 + **실기기 FCM 토큰(FE 앱)** | ⏳ FE 앱 필요 |
| 인스타/틱톡 업로드 (P7) | B | 앱 등록 + **비즈니스 계정** + 실키 | ⏳ 계정·심사 필요 |
| 배포 (P9) | A | 배포 인프라(Fly/Render/ECS 등) 확정 | ⏳ 인프라 결정 필요 |

→ **바로 착수 권장**: A는 영상 편집 end-to-end 실검증, B는 Stripe 실키 결제부터.

---

## 3. 병합 충돌 주의 파일 (공유 surface)

이 파일들만 양쪽이 동시에 건드림. 규칙:

- `apps/api/src/config.ts` — 각자 자기 섹션만 추가(섹션 주석 유지). init 순서 바꾸지 말 것.
- `apps/api/src/app.ts` — 플러그인/라우트 등록 줄만 추가. **에러/404 핸들러는 라우트 등록보다 앞**이라는 순서 절대 유지(자식 컨텍스트 상속 이슈).
- `apps/api/prisma/schema.prisma` — §4 규칙.
- `packages/shared-types` — 타입은 append-only.
- 원칙: **작은 PR로 자주 머지**해서 위 파일 충돌을 최소화.

---

## 4. Supabase / 마이그레이션 규칙 (제일 조심)

DB가 하나라 두 명이 각자 `prisma migrate dev`를 돌리면 히스토리가 꼬인다. 둘 중 하나 선택:

**옵션 A (추천): 로컬 Postgres로 격리**
- `docker-compose.yml`의 로컬 Postgres로 개발·마이그레이션하고, Supabase는 **인증(Auth)만** 사용.
- 스키마를 자유롭게 실험 → 확정되면 한 명이 Supabase에 반영.

**옵션 B: 공유 Supabase 계속 사용**
- 마이그레이션은 **PR로만**, 머지 순서대로 **한 명이** `prisma migrate deploy`.
- 각 dev는 테스트 데이터에 고유 접두사(닉네임/이메일)를 써서 서로 안 섞이게.
- 통합 테스트는 실행 후 반드시 자기 데이터 정리.

---

## 5. Git 워크플로

- 브랜치: `feat/media/*` (A), `feat/integrations/*` (B) → PR → `main`.
- `main` 보호: 리뷰 1명 필수. CI(빌드/타입체크/린트)가 PR마다 실행.
- 커밋: Conventional Commits (`feat:`, `fix:`, `chore:` …), 기능 단위로 세분화.
- 서로의 트랙 파일은 리뷰만, 직접 수정은 지양(공유 surface 제외).

---

## 6. 로컬 실행 체크리스트 (각자)

```bash
# 1. 인프라
docker start snaply-minio-dev snaply-redis-dev   # 최초엔 ONBOARDING.md의 run 명령

# 2. API 서버
npm run dev -w apps/api            # http://localhost:3000, 문서 /docs

# 3. AI 워커 (Dev A 주로)
cd apps/ai-worker && .venv/bin/python src/worker.py

# 4. 마이그레이션 / 시드 (필요 시)
npm run prisma:migrate -w apps/api
npm run seed:locations -w apps/api
```

세부 설치·환경변수는 `ONBOARDING.md` 참고.
