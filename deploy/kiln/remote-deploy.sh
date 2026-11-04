#!/usr/bin/env bash
# Run on the server from GitHub Actions, or by hand:
#   bash /opt/kiln/remote-deploy.sh ghcr.io/<owner>/kiln:<sha>
set -euo pipefail

cd /opt/kiln

if [[ ! -f .env ]]; then
  echo ".env is missing. Copy .env.example to /opt/kiln/.env and fill it in." >&2
  exit 1
fi
if [[ ! -f docker-compose.yml ]]; then
  echo "docker-compose.yml is missing in /opt/kiln." >&2
  exit 1
fi

target_image="${1:-${KILN_IMAGE:-}}"
if [[ -z "${target_image}" ]]; then
  echo "pass the image to deploy, for example ghcr.io/owner/kiln:abc1234" >&2
  exit 1
fi

env_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { value = substr($0, index($0, "=") + 1) } END { print value }' .env
}

write_image() {
  local image="$1"
  local tmp
  tmp="$(mktemp)"
  awk -v image="$image" '
    BEGIN { done = 0 }
    /^KILN_IMAGE=/ { print "KILN_IMAGE=" image; done = 1; next }
    { print }
    END { if (!done) print "KILN_IMAGE=" image }
  ' .env > "${tmp}"
  mv "${tmp}" .env
  chmod 600 .env
}

can_roll_back() {
  case "${previous_image}" in
    ""|*:unset) return 1 ;;
  esac
  [[ "${previous_image}" != "${target_image}" ]]
}

previous_image="$(env_value KILN_IMAGE)"
backup_file=""
db_user="$(env_value POSTGRES_USER)"
db_name="$(env_value POSTGRES_DB)"
db_user="${db_user:-kiln}"
db_name="${db_name:-kiln}"

if [[ -n "${KILN_GHCR_TOKEN:-}" ]]; then
  if [[ -z "${KILN_GHCR_USER:-}" ]]; then
    echo "KILN_GHCR_TOKEN is set but KILN_GHCR_USER is empty" >&2
    exit 1
  fi
  printf '%s' "${KILN_GHCR_TOKEN}" | docker login ghcr.io -u "${KILN_GHCR_USER}" --password-stdin >/dev/null
fi

bash /opt/kiln/init-certs.sh

rollback() {
  echo "deploy failed" >&2
  if [[ -n "${backup_file}" ]]; then
    echo "database backup: ${backup_file}" >&2
  fi
  docker compose logs --tail=80 kiln >&2 || true
  if ! can_roll_back; then
    echo "no previous image to start" >&2
    exit 1
  fi
  echo "starting the previous image again: ${previous_image}" >&2
  write_image "${previous_image}"
  docker compose up -d --force-recreate --no-deps kiln nginx
  exit 1
}

if docker compose ps --status running --services 2>/dev/null | grep -qx postgres; then
  mkdir -p backups
  stamp="$(date +%Y%m%d%H%M%S)"
  backup_file="backups/kiln-${stamp}.sql.gz"
  echo "backing up ${db_name} to ${backup_file}"
  docker compose exec -T postgres pg_dump -U "${db_user}" "${db_name}" | gzip > "${backup_file}"
fi

write_image "${target_image}"

if ! docker compose pull kiln; then
  rollback
fi

docker compose up -d postgres
ready=0
for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "${db_user}" -d "${db_name}" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "${ready}" -ne 1 ]]; then
  echo "postgres did not become ready" >&2
  rollback
fi

if ! docker compose up -d --force-recreate --no-deps kiln nginx; then
  rollback
fi

healthy=0
for _ in $(seq 1 60); do
  if docker compose exec -T kiln wget -q -O - http://127.0.0.1:3000/api/status 2>/dev/null \
    | grep -Eq '"success"[[:space:]]*:[[:space:]]*true'; then
    healthy=1
    break
  fi
  sleep 3
done

if [[ "${healthy}" -ne 1 ]]; then
  rollback
fi

domain="$(env_value KILN_DOMAIN)"
echo "kiln ${target_image} is up"
if [[ -n "${domain}" ]]; then
  echo "https://${domain}"
fi
