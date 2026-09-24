#!/usr/bin/env bash
# Local backup of the Alember's Vault Supabase project:
#   1. database roles, schema, and data (via `supabase db dump`)
#   2. every object in the `academic` storage bucket
# Output: backup/alembers-vault-<UTC-stamp>.tar.gz
#
# Run manually:
#   pnpm backup
#
# Env (values are read from the gitignored .env automatically):
#   SUPABASE_DB_URL        (required) session-pooler or direct Postgres URL.
#   SUPABASE_DB_PASSWORD   (optional) paired with SUPABASE_PROJECT_REF, builds
#                          the direct connection string if SUPABASE_DB_URL is unset.
#   SUPABASE_PROJECT_REF   (optional) see above.
#   BACKUP_DIR             (optional) output directory. Default: backup
#   STORAGE_BUCKET         (optional) bucket to archive. Default: academic
#   KEEP                   (optional) archives to retain. Default: 8
#
# Requires Docker (used by `supabase db dump`) and Node >= 22.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-backup}"
STORAGE_BUCKET="${STORAGE_BUCKET:-academic}"
KEEP="${KEEP:-8}"

if [[ -z "${SUPABASE_DB_URL:-}" && -n "${SUPABASE_DB_PASSWORD:-}" && -n "${SUPABASE_PROJECT_REF:-}" ]]; then
  SUPABASE_DB_URL="postgresql://postgres.${SUPABASE_PROJECT_REF}:${SUPABASE_DB_PASSWORD}@db.${SUPABASE_PROJECT_REF}.supabase.co:5432/postgres"
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Error: SUPABASE_DB_URL is not set." >&2
  echo "Get the session-pooler string from the dashboard (Connect) and export it," >&2
  echo "or set SUPABASE_DB_PASSWORD + SUPABASE_PROJECT_REF." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker is required (supabase db dump runs pg_dump in a container)." >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="${BACKUP_DIR}/${STAMP}"
mkdir -p "${WORK}"

echo "Backing up to ${WORK} ..."

echo "  [1/4] roles ..."
npx --yes supabase db dump --db-url "${SUPABASE_DB_URL}" -f "${WORK}/roles.sql" --role-only

echo "  [2/4] schema ..."
npx --yes supabase db dump --db-url "${SUPABASE_DB_URL}" -f "${WORK}/schema.sql"

echo "  [3/4] data ..."
npx --yes supabase db dump --db-url "${SUPABASE_DB_URL}" -f "${WORK}/data.sql" --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes"

echo "  [4/4] storage (${STORAGE_BUCKET}) ..."
node --env-file=.env scripts/backup-storage.mjs --out "${WORK}/storage" --bucket "${STORAGE_BUCKET}"

ARCHIVE="${BACKUP_DIR}/alembers-vault-${STAMP}.tar.gz"
tar -czf "${ARCHIVE}" -C "${WORK}" .
rm -rf "${WORK}"

echo "Done: ${ARCHIVE} ($(du -h "${ARCHIVE}" | cut -f1))"

# Retention: keep the newest KEEP archives, delete the rest.
mapfile -t ARCHIVES < <(ls -1t "${BACKUP_DIR}"/alembers-vault-*.tar.gz 2>/dev/null || true)
if (( ${#ARCHIVES[@]} > KEEP )); then
  for old in "${ARCHIVES[@]:KEEP}"; do
    echo "Pruning: ${old}"
    rm -f "${old}"
  done
fi
RETAINED=$(( ${#ARCHIVES[@]} < KEEP ? ${#ARCHIVES[@]} : KEEP ))
echo "Retained ${RETAINED} archive(s) (KEEP=${KEEP})."
