#!/usr/bin/env bash
#
# AWS 서버(EC2 dweax-snaply) 준비 — 인스턴스를 새로 만들 때마다 한 번 돌린다. 다시 돌려도 된다(멱등).
#
#   sudo dnf install -y git
#   git clone --depth 1 https://github.com/vlog-studio/snaply-backend.git /tmp/snaply
#   sudo bash /tmp/snaply/deploy/aws/install.sh
#
# 루트 볼륨에 있는 것(runner · Docker 설정 · cron)은 인스턴스를 교체하면 사라진다 — /data 만 다시 붙는다.
# 그래서 그것들을 여기서 깐다. 앱은 깔지 않는다: 첫 배포(GitHub Actions 의 deploy-aws 잡)가 올린다.
#
# runner 가 아직 등록되지 않았으면 등록 토큰을 묻는다 — 저장소 Settings → Actions → Runners →
# New self-hosted runner 화면의 토큰(1시간 유효, 한 번 쓰면 끝). 절차와 이유: docs/deployment-aws.md
set -euo pipefail

REPO_URL="https://github.com/vlog-studio/snaply-backend"
# runner 는 새 버전이 나오면 스스로 업데이트한다. 여기 버전은 처음 받을 파일이고, 해시로 검증한다.
RUNNER_VERSION="2.338.0"
RUNNER_SHA256="af4b794c1bc41d73d40535e3fe092a39f9679cd8d965954c2aca25a05ca41d32"
RUNNER_DIR="/opt/actions-runner"
RUNNER_NAME="dweax-snaply"
RUNNER_LABEL="snaply-aws"
# 배포(runner)와 cron 배치를 같은 계정이 돌린다.
SERVICE_USER="snaply"
SNAPLY_DIR="/data/compose"
BACKUP_DIR="/data/backup"
LOG_DIR="/var/log/snaply"
HOOK="/etc/snaply/runner-job-started.sh"
HERE="$(cd "$(dirname "$0")" && pwd)"

step() { printf '\n== %s\n' "$*"; }
die() { echo "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "sudo 로 실행한다"
# /data 가 안 붙은 채 진행하면 Docker 가 루트 볼륨의 빈 /data/docker 에 쓰기 시작한다(인프라 문서 6-2).
findmnt -n /data >/dev/null || die "/data 가 마운트돼 있지 않다 — 인스턴스 상태를 먼저 확인한다"

step "패키지"
# cron 은 Amazon Linux 2023 에 기본으로 없다. git 은 runner 의 checkout, libicu 는 runner(.NET)가 쓴다.
dnf install -y -q cronie git jq libicu tar
systemctl enable --now crond

step "서비스 계정 $SERVICE_USER"
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "/home/$SERVICE_USER" --shell /bin/bash "$SERVICE_USER"
fi
# docker 그룹은 사실상 root 다. 그래서 runner 가 받는 작업을 runner-job-started.sh 로 묶는다.
usermod -aG docker "$SERVICE_USER"

step "Docker 데이터를 /data/docker 로 (인프라 문서 6-2)"
# 마운트 대기는 매번 맞춰 둔다 — 없으면 재부팅 때 Docker 가 /data 보다 먼저 떠 빈 DB 로 뜬 것처럼 보인다.
mkdir -p /etc/systemd/system/docker.service.d
printf '[Unit]\nRequiresMountsFor=/data\n' >/etc/systemd/system/docker.service.d/data-mount.conf
systemctl daemon-reload
if [ "$(docker info --format '{{.DockerRootDir}}' 2>/dev/null)" != "/data/docker" ]; then
  # 처음 한 번만 Docker 를 멈춘다. 앱이 떠 있는 서버에서 다시 돌려도 여기는 건너뛴다.
  systemctl stop docker docker.socket
  if [ -s /etc/docker/daemon.json ]; then
    jq '. + {"data-root": "/data/docker"}' /etc/docker/daemon.json >/etc/docker/daemon.json.new
    mv /etc/docker/daemon.json.new /etc/docker/daemon.json
  else
    mkdir -p /etc/docker
    echo '{ "data-root": "/data/docker" }' >/etc/docker/daemon.json
  fi
  systemctl start docker
fi
systemctl enable docker >/dev/null 2>&1
[ "$(docker info --format '{{.DockerRootDir}}')" = "/data/docker" ] || die "Docker data-root 가 /data/docker 가 아니다"

step "디렉터리"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 750 "$SNAPLY_DIR" "$BACKUP_DIR"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 755 "$LOG_DIR"

step "runner 작업 검사 스크립트"
# root 소유 — runner 계정(배포 작업)이 고칠 수 없어야 검사가 의미 있다.
install -d -o root -g root -m 755 "$(dirname "$HOOK")"
install -o root -g root -m 755 "$HERE/runner-job-started.sh" "$HOOK"

step "GitHub runner"
if [ ! -f "$RUNNER_DIR/.runner" ]; then
  token="${RUNNER_TOKEN:-}"
  if [ -z "$token" ]; then
    read -rsp "runner 등록 토큰(Settings → Actions → Runners → New self-hosted runner): " token
    echo
  fi
  [ -n "$token" ] || die "등록 토큰이 없다"

  tarball="/tmp/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
  curl -fsSL -o "$tarball" \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
  echo "${RUNNER_SHA256}  ${tarball}" | sha256sum -c -
  install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 750 "$RUNNER_DIR"
  tar -xzf "$tarball" -C "$RUNNER_DIR"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$RUNNER_DIR"
  rm -f "$tarball"

  # --replace: 인스턴스를 교체하면 같은 이름의 예전 등록(오프라인)을 이어받는다.
  sudo -u "$SERVICE_USER" -H "$RUNNER_DIR/config.sh" --unattended --replace \
    --url "$REPO_URL" --token "$token" --name "$RUNNER_NAME" --labels "$RUNNER_LABEL" --work _work
fi

# 작업 전 검사를 runner 에 건다. runner 는 시작할 때 자기 폴더의 .env 를 읽는다.
if ! grep -q '^ACTIONS_RUNNER_HOOK_JOB_STARTED=' "$RUNNER_DIR/.env" 2>/dev/null; then
  echo "ACTIONS_RUNNER_HOOK_JOB_STARTED=$HOOK" >>"$RUNNER_DIR/.env"
  chown "$SERVICE_USER:$SERVICE_USER" "$RUNNER_DIR/.env"
fi

cd "$RUNNER_DIR"
if [ ! -f .service ]; then
  ./svc.sh install "$SERVICE_USER"
fi
# 다시 시작해야 .env(작업 전 검사)와 docker 그룹이 반영된다.
systemctl restart "$(cat .service)"
cd - >/dev/null

step "cron 배치"
"$HERE/render-cron.sh" >/etc/cron.d/snaply.new
chown root:root /etc/cron.d/snaply.new
chmod 644 /etc/cron.d/snaply.new
mv /etc/cron.d/snaply.new /etc/cron.d/snaply

step "확인"
echo "Docker data-root : $(docker info --format '{{.DockerRootDir}}')"
echo "runner 서비스     : $(systemctl is-active "$(cat "$RUNNER_DIR/.service")")"
echo "작업 전 검사       : $(grep '^ACTIONS_RUNNER_HOOK_JOB_STARTED=' "$RUNNER_DIR/.env")"
echo "cron             : $(grep -c 'run-batch.sh\|backup-db.sh' /etc/cron.d/snaply)개 배치"
cat <<EOF

다음 할 일 (docs/deployment-aws.md):
  1. GitHub 저장소 Settings → Actions → Runners 에 ${RUNNER_NAME} 가 Idle 로 보이는지
  2. Secrets Manager 의 값을 채운다
  3. 저장소 Variables 에 DEPLOY_AWS_ENABLED=true → main 머지(또는 마지막 배포 잡 재실행)로 첫 배포
EOF
