#!/usr/bin/env bash
# test_backup_restore.sh — end-to-end smoke of the dump/restore pipeline.
#
# Uses TEST_DATABASE_URL as the source database:
#   1. pg_dump the source into a temp file.
#   2. Create a fresh scratch database on the same server.
#   3. pg_restore the dump into the scratch DB.
#   4. Assert `SELECT 1` succeeds against the scratch DB.
#   5. Drop the scratch DB and remove the dump.
#
# Skips (exit 0) when TEST_DATABASE_URL is unset so this can be wired
# into CI without becoming a hard failure on unconfigured runners.

set -euo pipefail

if [ -z "${TEST_DATABASE_URL:-}" ]; then
  echo "test_backup_restore: TEST_DATABASE_URL not set, skipping"
  exit 0
fi

for tool in pg_dump pg_restore psql; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "test_backup_restore: required tool '${tool}' not on PATH" >&2
    exit 1
  fi
done

# Derive the admin URL (points at the `postgres` maintenance DB on the
# same server) so we can CREATE/DROP the scratch DB. Also carve the
# scratch DB name out of the source URL so we can rebuild a matching URL
# for pg_restore.
#
# TEST_DATABASE_URL is expected in the standard postgres form:
#   postgres[ql]://user[:pass]@host[:port]/dbname[?params]
SUFFIX="$(printf '%s' "${TEST_DATABASE_URL}" | sed -E 's#^[^/]+//[^/]+/([^?]+).*#\1#')"
BASE="$(printf '%s' "${TEST_DATABASE_URL}" | sed -E 's#(^[^/]+//[^/]+/)[^?]+(.*)#\1#')"
QS="$(printf '%s' "${TEST_DATABASE_URL}" | sed -nE 's#^[^?]+(\?.*)$#\1#p')"

SCRATCH_DB="jgair_restore_test_$$_$(date -u +%s)"
ADMIN_URL="${BASE}postgres${QS}"
SCRATCH_URL="${BASE}${SCRATCH_DB}${QS}"

WORKDIR="$(mktemp -d)"
DUMP_FILE="${WORKDIR}/source.dump"

cleanup() {
  rm -rf "${WORKDIR}"
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=0 \
    -c "DROP DATABASE IF EXISTS \"${SCRATCH_DB}\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "test_backup_restore: dumping ${SUFFIX} -> ${DUMP_FILE}"
pg_dump -Fc "${TEST_DATABASE_URL}" -f "${DUMP_FILE}"

echo "test_backup_restore: creating scratch DB ${SCRATCH_DB}"
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"${SCRATCH_DB}\";" >/dev/null

echo "test_backup_restore: restoring into ${SCRATCH_DB}"
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "${SCRATCH_URL}" "${DUMP_FILE}" >/dev/null

echo "test_backup_restore: asserting SELECT 1"
OUT="$(psql "${SCRATCH_URL}" -Atq -c 'SELECT 1;')"
if [ "${OUT}" != "1" ]; then
  echo "test_backup_restore: unexpected result from SELECT 1: '${OUT}'" >&2
  exit 1
fi

echo "test_backup_restore:ok scratch=${SCRATCH_DB}"
