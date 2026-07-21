# vlog-studio (Snaply)

20~30대를 위한 숏폼 브이로그 AI 자동 편집 앱 — 백엔드 모노레포.
전체 개발 가이드는 [SNAPVLOG_BACKEND_GUIDE.md](./SNAPVLOG_BACKEND_GUIDE.md) 참고.

## 구조

```
apps/
  api/          # Fastify + TypeScript API 서버
  ai-worker/    # Python FastAPI AI 편집 워커
packages/
  shared-types/ # FE와 공유하는 API 요청/응답 타입
```

## 시작하기

```bash
# 1. 의존성 설치
npm install

# 2. 환경 변수 설정 — .env는 apps/api/ 아래에 둡니다 (Prisma CLI와 서버가 여기서 읽음)
cp .env.example apps/api/.env   # 값 채우기 (Supabase Dashboard → Settings → Database)

# 3. Prisma 클라이언트 생성
npm run prisma:generate -w apps/api

# 4. DB 마이그레이션 적용 (Supabase 연결 후)
npm run prisma:migrate -w apps/api

# 5. RLS 정책 적용
#    apps/api/prisma/rls-policies.sql 내용을 Supabase SQL Editor에서 실행

# 6. 개발 서버 실행
npm run dev -w apps/api
curl http://localhost:3000/health
```

### AI 워커 (Python 3.11)

```bash
cd apps/ai-worker
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python src/main.py
curl http://localhost:8000/health
```

## 스크립트 (루트)

| 명령 | 설명 |
|------|------|
| `npm run build` | 전체 빌드 (turbo) |
| `npm run dev` | 개발 서버 |
| `npm run typecheck` | 타입 체크 |
| `npm run lint` | ESLint |

## DB 스키마 관리

- 스키마 원본: `apps/api/prisma/schema.prisma`
- 마이그레이션: `apps/api/prisma/migrations/` — `prisma migrate deploy`로 적용
- RLS 정책: `apps/api/prisma/rls-policies.sql` — Supabase SQL Editor에서 직접 적용
- Prisma schema와 Supabase SQL은 항상 동기화 상태 유지할 것
