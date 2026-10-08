#!/usr/bin/env bash
#
# AWS 서버의 GitHub runner 가 작업을 받을 때마다 **작업보다 먼저** 돈다(ACTIONS_RUNNER_HOOK_JOB_STARTED).
# 0 이 아니면 작업은 시작하지 않고 실패로 끝난다.
#
# 이 runner 는 main 의 배포 워크플로(push)만 받는다. 저장소가 public 이라 누구나 포크해 PR 을 열고, 브랜치의
# 워크플로가 `runs-on: [self-hosted, snaply-aws]` 로 이 호스트를 고를 수 있다 — 여기서 돈 코드는 Docker 와
# 인스턴스 역할(영상 버킷 · 시크릿)을 그대로 갖는다. GitHub Free 플랜은 runner 를 워크플로 단위로 묶는 설정이
# 없어서 이 스크립트가 그 일을 한다. 인스턴스(root 소유 파일)에 있으므로 저장소 쪽에서 고쳐 우회할 수 없다.
#
# 설치는 deploy/aws/install.sh 가 한다(/etc/snaply/runner-job-started.sh).
set -euo pipefail

ALLOWED_WORKFLOW_REF="vlog-studio/snaply-backend/.github/workflows/deploy.yml@refs/heads/main"

if [ "${GITHUB_WORKFLOW_REF:-}" != "$ALLOWED_WORKFLOW_REF" ] || [ "${GITHUB_EVENT_NAME:-}" != "push" ]; then
  echo "이 runner 는 main 의 deploy.yml(push)만 받는다 — 받은 작업: ${GITHUB_WORKFLOW_REF:-알 수 없음} (${GITHUB_EVENT_NAME:-알 수 없음})" >&2
  exit 1
fi
