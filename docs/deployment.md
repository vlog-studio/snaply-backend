# 배포와 운영 — 사내 서버

**작성일**: 2026-09-15
**상태**: 현행 — 배포 절차·시크릿·배치의 원천. 서버 구성이 바뀌면 이 문서를 고친다
**관련**: [plans/on-prem-deploy.md](./plans/on-prem-deploy.md)(왜 이 구성인지) ·
[decisions/env-management.md](./decisions/env-management.md) · [backlog.md](./backlog.md) B-1

---

## 0. 이 서버가 무엇인가

**팀 공용 통합 서버**다. 사내망 전용이라 **실사용자를 받을 수 없다** — LTE 로 접속하는 폰이
닿지 않는다. 각자 노트북에서 백엔드를 띄우던 것을 한 곳으로 모으는 것이 목적이다.

그래서 **바깥에서 우리를 불러야 하는 기능은 동작하지 않는다.** mock 으로 둔다.

| 안 되는 것 | 이유 | 설정 |
|---|---|---|
| SNS 게시 | 플랫폼이 우리 MinIO 로 영상을 가지러 와야 한다 | `SNS_MOCK=true` |
| 결제 웹훅 | RevenueCat 이 우리를 부르지 못한다 | `BILLING_MOCK=true` |
| 광고 보상 검증 | AdMob 이 우리를 부르지 못한다 | `AD_REWARD_ENABLED=false` |

푸시 알림(FCM)·스냅 분석(OpenAI)은 **우리가 나가는** 방향이라 정상 동작한다.

## 1. 한 번만 하는 준비

### 1-1. 서버 기본

```bash
sudo mkdir -p /opt/snaply /etc/snaply /var/log/snaply /var/backups/snaply
sudo useradd -r -s /bin/bash -d /opt/snaply snaply      # 배포·배치 실행 계정
sudo usermod -aG docker snaply
sudo chown -R snaply:snaply /opt/snaply /var/log/snaply /var/backups/snaply
sudo -u snaply git clone <저장소 URL> /opt/snaply
```

### 1-2. 시크릿 파일

**운영은 `.env` 파일을 쓰지 않는 것이 원칙이지만**([env-management.md](./decisions/env-management.md)),
사내 서버에는 시크릿 저장소가 없다. root 만 읽는 파일 하나로 대신한다.

```bash
sudo install -m 600 -o root -g root /dev/null /etc/snaply/snaply.env
sudo vi /etc/snaply/snaply.env
```

넣을 값은 [`apps/api/src/env-spec.ts`](../apps/api/src/env-spec.ts) 에서 **`origin !== 'local'`**
인 항목 전부, 그리고 compose 가 치환에 쓰는 아래 값들이다.

| 키 | 설명 |
|---|---|
| `POSTGRES_PASSWORD` | DB 비밀번호. **개발 기본값(`postgres`) 금지** |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | MinIO 계정. **개발 기본값 금지** — MinIO 는 사내망에 열려 있다 |
| `S3_PUBLIC_ENDPOINT` | 앱이 영상을 받아갈 주소. **서버의 사내망 IP**(`http://10.x.x.x:9200`). `localhost` 면 폰에서 못 연다 |
| `SNAPLY_ENV_FILE` | 이 파일 자신의 경로. 기본 `/etc/snaply/snaply.env` |

빠뜨리면 **기동을 거부한다**(`:?`). 조용히 개발 기본값으로 뜨는 것보다 낫다.

> **`/opt/snaply/apps/api/.env` 를 만들지 말 것.** base compose 가 그 파일도 읽으므로, 있으면
> 시크릿 파일에 없는 키를 낡은 값으로 덮어쓸 수 있다.

### 1-3. GitHub self-hosted runner

GitHub 이 빌려주는 컴퓨터는 사내망 안으로 들어올 수 없다. 서버가 GitHub 쪽으로 **먼저 연결을
걸어** 일을 받아오게 한다 — 방화벽에 들어오는 구멍을 내지 않는다.

저장소 **Settings → Actions → Runners → New self-hosted runner** 의 명령을 서버에서 실행한다.
설치할 때 **라벨에 `snaply` 를 추가**한다(워크플로가 `runs-on: [self-hosted, snaply]`).
그리고 재부팅에도 살아 있도록 서비스로 등록한다:

```bash
sudo ./svc.sh install snaply
sudo ./svc.sh start
```

### 1-4. 배치 등록

```bash
sudo cp /opt/snaply/deploy/batches.cron /etc/cron.d/snaply
sudo chown root:root /etc/cron.d/snaply && sudo chmod 644 /etc/cron.d/snaply
```

### 1-5. 배포 켜기

저장소 **Settings → Variables** 에서 `DEPLOY_ENABLED=true`. (API 포트를 바꿨다면
`API_HOST_PORT` 도.) 이때부터 main 머지가 자동 배포된다.

## 2. 배포가 도는 방식

```
main 머지
  ↓  GitHub 이 빌려주는 컴퓨터
     이미지 빌드 → 스모크 검사 → GHCR 푸시
  ↓  사내 서버의 runner
     이미지 받기 → 마이그레이션 → 컨테이너 교체 → 헬스체크
```

- 이미지 태그는 **커밋 SHA 로 고정**한다. 재시작할 때마다 다른 버전이 뜨면 안 되고, 문제가
  생겼을 때 어느 커밋이 돌고 있었는지 말할 수 있어야 한다
- **마이그레이션이 먼저다.** 실패하면 거기서 멈추고 이전 버전이 계속 돈다 — 반쯤 적용된
  스키마 위에 새 코드가 뜨는 것이 제일 나쁘다
- 헬스체크는 `db=connected` 까지 본다. `status:ok` 만 보면 DB 가 끊겨도 통과한다

### 손으로 배포하기

```bash
cd /opt/snaply
export SNAPLY_ENV_FILE=/etc/snaply/snaply.env
export API_IMAGE=ghcr.io/<org>/<repo>/api:<sha> WORKER_IMAGE=ghcr.io/<org>/<repo>/ai-worker:<sha>
C="docker compose --env-file $SNAPLY_ENV_FILE -f docker-compose.yml -f docker-compose.prod.yml"
$C pull && $C run --rm migrate && $C up -d
```

### 되돌리기

이전 커밋 SHA 로 태그를 바꿔 같은 명령을 돌린다. **단, 마이그레이션은 되돌아가지 않는다** —
스키마를 바꾼 배포를 되돌릴 때는 그 마이그레이션이 이전 코드와 호환되는지 먼저 확인한다.

## 3. 매일 도는 배치

빠뜨려도 **배포는 성공하고 에러도 나지 않는다.** 대신 알림이 안 가거나 파일이 무한히 쌓인다.

| 시각(KST) | 무엇 | 로그 |
|---|---|---|
| 03:30 | DB 백업 | `/var/log/snaply/backup.log` |
| 04:00 | 만료 정리(스냅·결과물·남은 객체) | `purge-expired.log` |
| 04:20 | 계정 실삭제 | `accounts-purge.log` |
| 04:40 | pending 영상 회수 | `purge-pending.log` |
| **10:00** | **만료 예고 알림** | `notify-expiring.log` |

**예고와 정리를 같은 시각에 묶지 않는다.** 조용한 시간대(22–08시)에 보낸 예고는 발송되지
않고 버려지고, 그러면 예고 없는 삭제가 된다([expiry-notice-schedule.md](./decisions/expiry-notice-schedule.md)).

배치는 전부 **dry-run 이 기본**이라 `deploy/run-batch.sh` 가 `--yes` 를 붙인다. 손으로 한 건만
돌릴 때:

```bash
sudo -u snaply /opt/snaply/deploy/run-batch.sh media:purge-expired
```

## 4. 백업

관리형 DB 가 아니므로 **덤프가 유일한 안전망**이다. 영상 파일은 MinIO 에 따로 있지만, DB 가
날아가면 무엇이 누구 것이고 어떤 무비가 어떤 스냅을 쓰는지를 잃는다 — 파일만 남고 의미가
사라진다.

`deploy/backup-db.sh` 가 매일 `/var/backups/snaply` 에 남기고 14일치를 보관한다. 덤프가 비었으면
성공으로 치지 않는다(`pg_dump` 가 죽어도 `gzip` 은 0 을 돌려줄 수 있다).

**덤프는 같은 서버에 쌓인다.** 서버가 통째로 죽는 경우는 이걸로 막지 못한다 — 외부 보관은
별도 판단이 필요하다([backlog.md](./backlog.md) B-1).

복구:

```bash
gunzip -c /var/backups/snaply/snaply-<날짜>.sql.gz \
  | docker compose ... exec -T postgres psql -U postgres -d snaply
```

## 5. 자주 볼 것

```bash
cd /opt/snaply
C="docker compose --env-file /etc/snaply/snaply.env -f docker-compose.yml -f docker-compose.prod.yml"
$C ps                     # 무엇이 떠 있나
$C logs -f --tail=100 api # 로그
curl -s localhost:3000/health
cat deploy/.current-images  # 지금 돌고 있는 이미지 태그
```

- **`analysis-worker` 가 재시작을 반복한다** — `OPENAI_API_KEY` 가 없으면 기동 단계에서 스스로
  종료한다(의도된 동작). 키를 넣거나 그 서비스를 빼고 올린다
- **알림이 안 간다** — `FIREBASE_SERVICE_ACCOUNT_KEY` 가 없으면 FCM 이 dry-run 으로 떨어진다.
  만료 예고 배치는 그 경우 아예 시작하지 않고 멈춘다(보내지 않은 것을 보냈다고 기록하지 않기 위해)
- **앱에서 영상이 안 열린다** — `S3_PUBLIC_ENDPOINT` 가 `localhost` 이거나 서버의 사내망 IP 가
  아닐 때다

## 6. 실사용 서버가 필요해지면

이 서버로는 사용자를 받을 수 없다. 외부 접속이 되는 곳이 생기면 추가로 필요한 것은
**고정 HTTPS 도메인**([backlog.md](./backlog.md) D-1)과 §0 의 세 가지를 실제로 켜는 일뿐이다.
이미지·마이그레이션·배치 구성은 그대로 간다.
