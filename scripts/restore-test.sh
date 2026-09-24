#!/usr/bin/env bash
# Restore a backup archive into a throwaway Postgres container to prove it is
# valid. Nothing persists: the container and its data are removed afterwards.
#
# Usage:
#   pnpm restore:test                 # newest archive in backup/
#   pnpm restore:test -- backup/alembers-vault-20260923T031500Z.tar.gz
#   pnpm restore:test -- --keep       # leave the container running for inspection
#
# Env:
#   IMAGE   (optional) Postgres image. Default: supabase/postgres:17.6.1.166
#           (matches the project's server version and bundles pgcrypto + pg_cron).
#
# Requires Docker and python3.

set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE="${IMAGE:-supabase/postgres:17.6.1.166}"
CONTAINER="alembers-restore-test"
PGPORT="${PGPORT:-54329}"

ARCHIVE=""
KEEP_CONTAINER=0
for arg in "$@"; do
  case "$arg" in
    --keep) KEEP_CONTAINER=1 ;;
    -*) echo "Error: unknown flag $arg" >&2; exit 1 ;;
    *) ARCHIVE="$arg" ;;
  esac
done

if [[ -z "$ARCHIVE" ]]; then
  ARCHIVE="$(ls -1t backup/alembers-vault-*.tar.gz 2>/dev/null | head -n1 || true)"
fi
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "Error: no archive found. Run \`pnpm backup\` first, or pass a path." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker is required." >&2
  exit 1
fi

WORK="$(mktemp -d)"

echo "Archive: ${ARCHIVE}"
echo "Extracting ..."
tar -xzf "${ARCHIVE}" -C "${WORK}"

for f in schema.sql data.sql; do
  [[ -f "${WORK}/${f}" ]] || { echo "Error: ${f} missing from archive." >&2; exit 1; }
done

cleanup_container() {
  if (( KEEP_CONTAINER )); then
    echo "Container '${CONTAINER}' left running (--keep). Stop it with:"
    echo "  docker rm -f ${CONTAINER}"
  else
    docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  fi
}
trap 'cleanup_container; rm -rf "${WORK}"' EXIT

# Start from a clean slate.
docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true

if ! docker image inspect "${IMAGE}" >/dev/null 2>&1; then
  echo "Pulling ${IMAGE} ..."
  docker pull "${IMAGE}"
fi

echo "Starting throwaway Postgres (${IMAGE}) ..."
docker run -d --name "${CONTAINER}" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=postgres \
  -p "127.0.0.1:${PGPORT}:5432" \
  "${IMAGE}" >/dev/null

echo "Waiting for Postgres ..."
for _ in $(seq 1 60); do
  if docker exec "${CONTAINER}" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! docker exec "${CONTAINER}" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
  echo "Error: Postgres did not become ready." >&2
  docker logs "${CONTAINER}" | tail -n 20 >&2 || true
  exit 1
fi

# pg_isready fires before the image's init scripts finish creating the
# Supabase schemas/roles/extension. Wait until that settles.
echo "Waiting for Supabase init (vault schema + roles) ..."
for _ in $(seq 1 120); do
  if docker exec "${CONTAINER}" psql -U postgres -d postgres -tAc \
       "select 1 from pg_extension where extname = 'supabase_vault'" 2>/dev/null | grep -q 1 \
     && docker exec "${CONTAINER}" psql -U postgres -d postgres -tAc \
       "select 1 from pg_roles where rolname = 'authenticated'" 2>/dev/null | grep -q 1; then
    break
  fi
  sleep 1
done
if ! docker exec "${CONTAINER}" psql -U postgres -d postgres -tAc \
     "select 1 from pg_extension where extname = 'supabase_vault'" 2>/dev/null | grep -q 1; then
  echo "Error: Supabase init did not complete in time." >&2
  docker logs "${CONTAINER}" | tail -n 20 >&2 || true
  exit 1
fi

echo "[1/3] Applying schema.sql ..."
docker exec -i "${CONTAINER}" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 \
  < "${WORK}/schema.sql"

echo "[2/3] Applying data.sql ..."
# The dump contains managed-schema data (auth, storage, ...) that a real
# Supabase target provides itself; the throwaway image ships a different
# version, so restore only the schemas our own schema.sql defines.
SCHEMAS="$(grep -aoE 'CREATE TABLE (IF NOT EXISTS )?"[a-zA-Z_]+"\.' "${WORK}/schema.sql" | sed -E 's/CREATE TABLE (IF NOT EXISTS )?"([a-zA-Z_]+)"\./\2/' | sort -u | paste -sd, -)"
[[ -z "$SCHEMAS" ]] && SCHEMAS="public,analytics"
echo "  data schemas: ${SCHEMAS}"
awk -v keep=",${SCHEMAS}," '
  match($0, /Schema: [a-zA-Z_]+/) { cur = substr($0, RSTART + 8, RLENGTH - 8) }
  cur == "" { print; next }
  index(keep, "," cur ",") > 0 { print }
' "${WORK}/data.sql" > "${WORK}/data.local.sql"

docker exec -i "${CONTAINER}" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 \
  -c 'set session_replication_role = replica' -f - \
  < "${WORK}/data.local.sql"

echo "[3/3] Sanity checks ..."
docker exec -i "${CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
select 'public.academic_resources' as table, count(*) from public.academic_resources
union all select 'public.admins', count(*) from public.admins
union all select 'public.redirects', count(*) from public.redirects
union all select 'analytics.analytics_events', count(*) from analytics.analytics_events
order by 1;"

if [[ -f "${WORK}/storage/academic/_manifest.json" ]]; then
  python3 - "${WORK}" <<'PY'
import json, os, sys
work = sys.argv[1]
manifest = os.path.join(work, "storage", "academic", "_manifest.json")
data = json.load(open(manifest))
base = os.path.join(work, "storage", "academic")
on_disk = sum(
    len(files)
    for _, _, files in os.walk(base)
)
on_disk -= 1  # exclude _manifest.json itself
expected = data.get("object_count", 0)
status = "OK" if on_disk == expected else "MISMATCH"
print(f"storage/academic: manifest={expected} files={on_disk} -> {status}")
if on_disk != expected:
    sys.exit(1)
PY
else
  echo "Note: no storage manifest in archive (storage step skipped?)."
fi

echo "Restore test passed."
