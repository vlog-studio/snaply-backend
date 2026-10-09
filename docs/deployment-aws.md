# 배포와 운영 — AWS 공모전 서버

**작성일**: 2026-10-08
**상태**: 현행 — AWS 서버의 설치·배포·시크릿·배치 절차의 원천. 서버 구성이 바뀌면 이 문서를 고친다
**관련 문서**: [decisions/aws-contest-server.md](./decisions/aws-contest-server.md)(왜 이 구성인지) ·
[backlog.md](./backlog.md) B-8 ·
인프라 구성과 접속은 사내 위키 "snaply — AWS 구성 · 인프라 접속"(이하 인프라 문서)

---

## 0. 이 서버가 무엇인가

**사내 공모전 테스터용 외부 서버**다. 인프라팀이 만든 EC2 한 대 앞에 공용 ALB 가 있고
(`https://snaply-api.dweaxai.com` → 인스턴스 3000), 영상은 S3, 시크릿은 Secrets Manager 에 있다. 바깥에서
닿으므로 결제 웹훅 · SNS 콜백을 받을 수 있다. 공모전이 끝나면 내린다.

앱(api · 워커 4개 · postgres · redis)과 GitHub runner 는 우리가 깔고 운영한다.

| 무엇 | 어디 |
|---|---|
| compose 파일 · 배치 스크립트 · env 파일 · 돌고 있는 이미지 태그 | `/data/compose` — 배포가 채운다 |
| Docker 데이터(이미지 · DB · Redis · whisper 캐시) | `/data/docker` |
| DB 덤프(14일) | `/data/backup` |
| GitHub runner | `/opt/actions-runner` |
| 배치 로그 | `/var/log/snaply` |
| 배포 · 배치를 돌리는 계정 | `snaply` |

**`/data` 만 인스턴스를 교체해도 남고 매일 스냅샷된다.** 나머지(runner · Docker 설정 · cron)는 루트 볼륨이라
교체하면 다시 깐다(§7).

## 1. 설치 — 인스턴스마다 한 번

접속 준비(MFA · 역할 전환 · Session Manager)는 인프라 문서 4~5장. EC2 → 연결 → Session Manager 탭의
"IAM 역할을 가져오지 못했습니다" 는 진단 정보를 읽을 권한이 없다는 뜻일 뿐이다 — **연결** 버튼으로 셸이 열린다.

1. GitHub 저장소 **Settings → Actions → Runners → New self-hosted runner** 에서 등록 토큰을 받는다(1시간 유효).
2. 인스턴스 셸에서:

   ```bash
   sudo dnf install -y git
   git clone --depth 1 https://github.com/vlog-studio/snaply-backend.git /tmp/snaply
   sudo bash /tmp/snaply/deploy/aws/install.sh
   ```

   토큰을 물으면 붙여 넣는다. 하는 일은 [`deploy/aws/install.sh`](../deploy/aws/install.sh) 머리말에 있다 — 패키지
   (cron 은 Amazon Linux 2023 에 기본으로 없다), `snaply` 계정(docker 그룹), Docker data-root 를 `/data/docker` 로
   옮기고 `/data` 마운트를 기다리게 하기(인프라 문서 6-2), runner 설치 · 등록 · 서비스, cron.
3. 저장소 Runners 화면에 `dweax-snaply` 가 **Idle** 이면 끝이다.

다시 돌려도 된다. 앱이 떠 있으면 Docker 는 건드리지 않는다. runner 는 다시 시작되므로 배포 중에는 피한다.

**runner 는 main 의 `deploy.yml`(push)만 받는다.** 저장소가 public 이라 누구나 포크해 PR 을 열 수 있고, 이 호스트에서
돈 작업은 Docker 와 인스턴스 역할(영상 버킷 · 시크릿)을 그대로 갖는다. 작업 전에 도는
[`runner-job-started.sh`](../deploy/aws/runner-job-started.sh)(`/etc/snaply/`, root 소유)가 다른 작업을 거부하고,
사유는 그 작업 로그의 **Set up runner** 에 남는다. 지우거나 느슨하게 하지 않는다.

## 2. 시크릿

값은 Secrets Manager `dweax/service/snaply/env` 하나(키-값 JSON)에 둔다. 넣고 바꾸는 법은 인프라 문서 5-5 —
**받아서 고친 뒤 통째로 올린다.** 한 키만 보내면 나머지가 모두 사라진다.

**콘솔에서는 고칠 수 없다.** snaply 역할에 `DescribeSecret`·`ListSecrets` 가 없어 Secrets Manager 화면이 열리지 않고 CloudShell
도 막혀 있다(2026-10-08). 인프라 문서 4장의 CLI 프로필(`dweax-snaply`)로 내 컴퓨터에서 한다 — 읽기 · 쓰기는 된다.

```bash
(umask 077; aws secretsmanager get-secret-value --profile dweax-snaply --secret-id dweax/service/snaply/env --query SecretString --output text | jq . > ~/snaply-env.json)
nano ~/snaply-env.json        # 값만 고친다. TextEdit 은 따옴표를 바꿔 JSON 을 깨뜨린다
jq -r 'keys[]' ~/snaply-env.json
aws secretsmanager put-secret-value --profile dweax-snaply --secret-id dweax/service/snaply/env --secret-string file://$HOME/snaply-env.json && rm ~/snaply-env.json
```

인프라가 요청서 4장의 키를 빈 값으로 만들어 두었다(`LEGAL_CONTACT_EMAIL` 은 없어 더해야 한다). `POSTGRES_PASSWORD` 와
`SNS_TOKEN_ENCRYPTION_KEY` 는 한 번 정하면 바꾸지 않는다 — Postgres 는 첫 기동 때만 비밀번호를 정하고, 암호화 키가 바뀌면
저장된 SNS 토큰을 못 읽는다.

- **넣는 키**: [`env-spec.ts`](../apps/api/src/env-spec.ts) 에서 `origin` 이 `local` 이 아닌 것 중 쓰는 것과
  `POSTGRES_PASSWORD`(접속 URL 에 들어가므로 영숫자만). 목록은 요청서 4장.
- **넣지 않는 키**: compose 가 정한다 — `DATABASE_URL` · `DIRECT_URL` · `REDIS_URL` · `NODE_ENV` · `API_PORT` ·
  `TRUST_PROXY`. S3 키 · `S3_ENDPOINT` · `S3_PUBLIC_ENDPOINT` · `CLOUDFRONT_DOMAIN` 은 넣어도 ""로 덮인다 — 이 서버는
  인스턴스 역할로만 S3 에 붙는다.
- **빈 값은 배포 때 빠지고 코드의 기본값이 쓰인다.** 그대로 옮기면 빈 `LOG_LEVEL` 은 기동 실패, 빈
  `RATE_LIMIT_GLOBAL_MAX` 는 모든 요청 429 다([`write-env.sh`](../deploy/aws/write-env.sh) 머리말).
- **값에 작은따옴표나 줄바꿈이 있으면 배포가 멈춘다.** `FIREBASE_SERVICE_ACCOUNT_KEY` 는 서비스 계정 JSON 을 base64
  한 줄로 넣는다(`base64 -w0 key.json`, macOS 는 `base64 -i key.json`).
- **외부 연동**(SNS · 결제 · 광고 보상)은 키가 비어 있으면 mock · 꺼짐으로 뜬다. 콘솔에 콜백 · 웹훅 주소
  (`https://snaply-api.dweaxai.com/...`)를 등록한 뒤 키를 넣는다.

바꾼 값은 다음 배포에 반영된다. 기다리지 않으려면 셸에서 env 파일을 다시 만들고 컨테이너를 다시 올린다(§6 의 셸에서
`deploy/aws/write-env.sh` → `docker compose --env-file .env up -d`).

첫 배포 전에는 `/data/compose/deploy` 가 비어 있다(배포가 채운다). 그때 형식을 미리 보려면 §1 에서 받은 체크아웃의 스크립트를
쓴다 — `sudo -u snaply /tmp/snaply/deploy/aws/write-env.sh` 가 "N개 키를 … 썼다"를 내면 된다.

## 3. 배포

**켜기**: 저장소 **Settings → Variables** 에 `DEPLOY_AWS_ENABLED=true`. 그때부터 main 머지가 이 서버로 배포된다.
첫 배포는 다음 머지를 기다리거나 마지막 Deploy 실행에서 **Re-run** 한다. 저장소가 public 이므로 **Settings → Actions →
General** 의 포크 PR 워크플로 승인도 "모든 외부 협업자"로 올려 둔다 — 작업 전 검사와 겹으로 막는다.

```
main 머지
  ↓  GitHub 이 빌려주는 컴퓨터 — 이미지 빌드 → 스모크 검사 → GHCR(커밋 SHA 태그)       (build-and-push, 사내 서버와 같다)
  ↓  이 인스턴스의 runner — deploy.yml 의 deploy-aws
     배포 파일을 /data/compose 로 → 시크릿을 env 파일로 → GHCR 로그인 → pull → 마이그레이션 → up → 태그 기록
     → /health 가 db=connected 인지 → 72시간 넘은 이미지 정리
```

- **GitHub 에 AWS 키를 두지 않는다.** runner 가 GitHub 쪽으로 먼저 연결해 일을 받아오고(나가는 연결만), 시크릿은
  인스턴스 역할로 읽는다. GHCR 패키지는 비공개라 잡마다 주어지는 토큰으로 받는다.
- **마이그레이션이 먼저다.** 실패하면 거기서 멈추고 이전 버전이 계속 돈다.
- **`deploy/` 를 고친 커밋도 서버에서 따로 할 일이 없다** — 배포가 `/data/compose` 로 덮어쓴다(사내 서버와 다른 점).
- **되돌리기**: 이전 커밋의 Deploy 실행에서 `Deploy to the AWS server` 잡을 Re-run 한다. 마이그레이션은 되돌아가지
  않으므로 스키마를 바꾼 배포라면 이전 코드와 호환되는지 먼저 본다.

## 4. 배치

`/etc/cron.d/snaply` 가 [`deploy/batches.cron`](../deploy/batches.cron) 과 **같은 시각**으로 돈다 —
[`render-cron.sh`](../deploy/aws/render-cron.sh) 가 경로와 compose 파일만 바꿔 깐다 — **시각의 원천은 그 파일 하나**다.
로그는 `/var/log/snaply/*.log`.

| 시각(KST) | 무엇 | 로그 |
|---|---|---|
| 03:30 | DB 백업 | `backup.log` |
| 04:00 | 만료 정리(스냅 · 결과물 · 남은 객체) | `purge-expired.log` |
| 04:20 | 계정 실삭제 | `accounts-purge.log` |
| 04:40 | pending 영상 회수 | `purge-pending.log` |
| **10:00** | **만료 예고 알림** | `notify-expiring.log` |

**예고와 정리를 같은 시각에 묶지 않는다.** 조용한 시간대(22–08시)에 보낸 예고는 발송되지 않고 버려지고,
그러면 예고 없는 삭제가 된다([decisions/expiry-notice-schedule.md](./decisions/expiry-notice-schedule.md)).
배치는 하나라도 빠뜨리면 배포는 성공하고 에러도 없이 알림이 영영 안 가거나 파일이 무한히 쌓인다.

손으로 한 건 돌릴 때(배치는 `--yes` 가 붙어 실제로 지운다):

```bash
sudo -u snaply env COMPOSE_FILE=docker-compose.aws.yml SNAPLY_ENV_FILE=/data/compose/.env /data/compose/deploy/run-batch.sh media:purge-expired
```

만료 예고(`media:notify-expiring`)는 `FIREBASE_SERVICE_ACCOUNT_KEY` 가 없으면 시작하지 않고 실패로 끝난다 — 보내지
않은 것을 보냈다고 기록하지 않기 위해서다.

## 5. 백업

- 매일 03:30(KST) `pg_dump` → `/data/backup`, 14일 보관. `/data` 볼륨은 인프라가 매일 스냅샷한다(7개).
- **S3 영상은 백업이 없다.** 버킷의 버전 관리가 꺼져 있어 지운 영상은 되돌릴 수 없다.
- 복구는 §6 의 셸에서
  `gunzip -c /data/backup/snaply-<날짜>.sql.gz | docker compose --env-file .env exec -T postgres psql -U postgres -d snaply`.
  볼륨째 되돌리는 것은 인프라에 요청한다.

## 6. 자주 볼 것

`snaply` 계정의 셸을 열고 compose 가 쓸 값을 읽어 둔다(이미지 태그는 `:?` 라 없으면 compose 가 멈춘다).

```bash
sudo -iu snaply
cd /data/compose && set -a && . deploy/.current-images && set +a && export COMPOSE_FILE=docker-compose.aws.yml
docker compose --env-file .env ps
docker compose --env-file .env logs -f --tail=100 api
curl -s localhost:3000/health
```

| 증상 | 볼 곳 |
|---|---|
| 배포 잡이 대기열에서 안 움직인다 | runner 가 꺼져 있다 — `systemctl status "$(cat /opt/actions-runner/.service)"` |
| 배포 잡이 Set up runner 에서 실패 | 작업 전 검사가 거부했다 — main 의 `deploy.yml` 이 아닌 작업이다 |
| Write the secrets file 에서 실패 | 값에 작은따옴표 · 줄바꿈이 있거나 `POSTGRES_PASSWORD` 가 비었다(§2) |
| `analysis-worker` 가 재시작을 반복 | `OPENAI_API_KEY` 가 없다(의도된 동작) |
| 도메인이 502 · 디스크 · presigned URL 의 `ExpiredToken` | 인프라 문서 8장 |
| WebSocket 이 끊김 | 서버가 30초마다 ping 을 보내 ALB 유휴 제한(180초)을 넘기지 않는다(2026-10-09). 그래도 끊기면 앱이 다시 붙는다 — 인프라 문서 8장 |

## 7. 인스턴스를 교체하면

`/data` 는 그대로 다시 붙는다(DB · 이미지 · env 파일 · 태그가 남는다). §1 을 다시 하고(토큰은 새로 받는다) 마지막 배포를
Re-run 한다. 같은 이름(`dweax-snaply`)으로 등록하므로 예전 등록은 새 runner 가 이어받는다.
