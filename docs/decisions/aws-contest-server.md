# AWS 공모전 서버 — 인프라팀 EC2 에 올리는 방식

**작성일**: 2026-10-08
**상태**: 결정(2026-10-08) — 저장소 쪽 구현 완료. 서버 작업과 남은 판단은 [backlog.md](../backlog.md) B-8
**원천**: AWS 공모전 서버를 이렇게 구성한 이유와 기각한 대안. 절차·시크릿·배치는 [deployment-aws.md](../deployment-aws.md)
**관련 문서**: [deployment-aws.md](../deployment-aws.md) · [archive/on-prem-deployment.md](../archive/on-prem-deployment.md) ·
[env-management.md](./env-management.md) · 사내 위키 "AWS 서비스 요청서 — snaply"(요청)와 "snaply — AWS 구성 · 인프라 접속"(인프라팀 답)

---

## 배경

사내 공모전 테스터가 각자 폰으로, 집이나 밖에서 LTE 로 접속해야 한다. 사내 서버([archive/on-prem-deployment.md](../archive/on-prem-deployment.md))는
사내망 전용이라 닿지 않는다. 그래서 인프라팀에 요청서를 내 회사 AWS 계정에 **전용 서버 방식**(EC2 한 대 + Docker Compose)으로
받았다 — EC2(`t3.large`, 공인 IP 없음, 데이터는 별도 `/data` 볼륨) 앞에 공용 ALB(`https://snaply-api.dweaxai.com`), 영상은 S3,
시크릿은 Secrets Manager. 공모전이 끝나면 내린다.

## 무엇을 정했나

1. **배포는 GitHub self-hosted runner + GHCR 이다.** 이미지는 지금처럼 GitHub 이 빌려주는 컴퓨터에서 빌드 · 스모크 검사해
   GHCR 에 올리고, 인스턴스에 설치한 runner 가 받아 마이그레이션 → 교체 → 헬스체크를 한다. runner 는 GitHub 쪽으로 **나가는
   연결만** 쓴다. 인프라 문서에는 사내 GitLab runner 로 적혀 있었지만, 저장소가 GitHub 이고 나가는 연결만 쓴다는 점을 설명하자
   인프라 담당이 그대로 가도 된다고 답했다(2026-10-08). 인스턴스에서 GitHub · GHCR · Docker Hub · 외부 API 로 나가는 연결도
   직접 확인했다.
2. **runner 는 main 의 배포 워크플로(push)만 받는다.** 저장소가 public 이라 포크 PR 이 이 호스트를 고를 수 있고, 여기서 돈
   코드는 Docker(사실상 root)와 인스턴스 역할을 갖는다. GitHub Free 플랜에는 runner 를 워크플로 단위로 묶는 설정이 없어서,
   runner 가 작업 전에 부르는 인스턴스의 스크립트(root 소유)가 다른 작업을 거부한다 — 인프라 문서의 "보호된 브랜치 전용
   runner" 에 해당한다.
3. **S3 는 키 없이 인스턴스 역할로 붙는다.** API · 워커는 키가 비면 SDK 기본 체인을 쓰고, compose 가 키와 MinIO 주소를 ""로
   덮어 시크릿에 무엇이 들어가도 인스턴스 역할만 쓴다. 컨테이너가 메타데이터에 닿도록 IMDS 홉 제한은 2 다(인프라).
4. **compose 는 단독 파일(`docker-compose.aws.yml`)이다.** 개발 스택(`docker-compose.yml`)에 겹치지 않는다.
5. **시크릿은 Secrets Manager 하나에서 배포 때마다 env 파일로 옮긴다.** 빈 값은 빼고(코드 기본값을 쓴다), 값은 작은따옴표로
   감싸 글자 그대로 읽히게 한다. 파일은 `/data/compose/.env`(600)이고 저장소 · 이미지에는 들어가지 않는다.
6. **클라이언트 IP 는 ALB 를 믿어 정한다**(`TRUST_PROXY=uniquelocal`). 믿지 않으면 모든 사용자가 ALB 주소 하나로 보여 전역
   rate limit 을 나눠 쓰고, `/health` 까지 429 가 되면 ALB 가 대상을 빼 도메인 전체가 502 다.

## 기각한 대안

| 대안 | 기각 이유 |
|---|---|
| 사내 GitLab runner(저장소를 GitLab 으로 미러) | 저장소는 GitHub 에 있다. 미러 동기화와 CI 가 두 벌이 되고, 사내 GitLab 이 http 라 작업 스크립트 · CI 변수가 평문으로 오간다(인프라 문서 6-5) |
| GitHub 이 빌려주는 컴퓨터가 SSM 으로 배포(인프라 표준 방식) | 배포 전용 IAM 사용자의 키를 GitHub 시크릿에 둬야 하고, 인프라가 그 사용자를 새로 만들어야 한다. runner 는 키가 필요 없다 |
| runner group 을 워크플로 단위로 제한 | GitHub Free 플랜에서 쓸 수 없다 |
| 개발 스택에 운영 오버레이로 겹치기(사내 서버 방식) | compose 는 `ports` 를 덮지 않고 합치고, base 의 빈 `SENTRY_DSN` 이 시크릿을 덮는다. 지우려 해도 남는다 — 사내 서버 오버레이에서 그대로 확인됐다(backlog B-1) |
| `trustProxy` 를 홉 수(`1`)로 | Fastify 5.12 는 홉 수만으로는 직접 접속한 클라이언트의 위조를 막을 수 없어 숫자를 주면 아무것도 믿지 않는다 |
| env 파일 값을 따옴표 없이(인프라 문서 6-5 의 예) | compose 가 비밀번호의 `$` 를 치환하고 `#` 뒤를 주석으로 자른다 |

## 이 결정이 정하지 않는 것

사내 서버(B-1)를 대체하는지, 공모전 동안 병행하는지는 정하지 않았다 — [backlog.md](../backlog.md) B-8. 그래서 사내 서버의
배포 잡 · 오버레이 · 문서는 그대로 두었다.
