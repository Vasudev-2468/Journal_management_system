#!/usr/bin/env bash
# restore_db.sh — restore a jgair pg_dump file into $DATABASE_URL.
#
# Usage:
#   restore_db.sh <path/to/dump-or-s3-url> [--yes]
#
# The single positional argument is either a local .dump path or an
# s3://bucket/key URL. When it is s3://, the file is downloaded to a
# temp directory first (requires the `aws` CLI on PATH).
#
# Restore uses:
#   pg_restore --clean --if-exists --no-owner --no-privileges
# so it is safe to rerun into the same target and does not carry
# owner/ACL clutter forward.
#
# Because a restore drops and recreates every object in the target DB,
# we warn loudly. When a TTY is attached the operator has to type
# "yes"; scripted callers can pass --yes to skip the prompt.

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <dump-path-or-s3-url> [--yes]" >&2
  exit 2
fi

SRC="$1"
shift || true

ASSUME_YES=0
for arg in "$@"; do
  case "${arg}" in
    --yes|-y) ASSUME_YES=1 ;;
    *) echo "unknown argument: ${arg}" >&2; exit 2 ;;
  esac
done

CLEANUP_FILE=""
cleanup() {
  if [ -n "${CLEANUP_FILE}" ] && [ -f "${CLEANUP_FILE}" ]; then
    rm -f -- "${CLEANUP_FILE}"
  fi
}
trap cleanup EXIT

# Fetch from S3 into a temp file if requested.
case "${SRC}" in
  s3://*)
    if ! command -v aws >/dev/null 2>&1; then
      echo "restore: source is s3:// but 'aws' CLI not found on PATH" >&2
      exit 1
    fi
    TMPDIR_LOCAL="$(mktemp -d)"
    CLEANUP_FILE="${TMPDIR_LOCAL}/$(basename "${SRC}")"
    echo "restore: downloading ${SRC} -> ${CLEANUP_FILE}"
    aws s3 cp "${SRC}" "${CLEANUP_FILE}"
    FILE="${CLEANUP_FILE}"
    ;;
  *)
    FILE="${SRC}"
    ;;
esac

if [ ! -f "${FILE}" ]; then
  echo "restore: dump file not found: ${FILE}" >&2
  exit 1
fi

# Redact any password in the URL so it does not land in the log.
SAFE_URL="$(printf '%s' "${DATABASE_URL}" | sed -E 's#(://[^:/@]+:)[^@]*(@)#\1***\2#')"

cat >&2 <<WARN
================================================================
WARNING: THIS WILL OVERWRITE THE TARGET DB
  source dump : ${FILE}
  target DB   : ${SAFE_URL}
Every object in the target database will be dropped and recreated
from the dump. This is destructive and irreversible.
================================================================
WARN

if [ "${ASSUME_YES}" -ne 1 ]; then
  if [ -t 0 ]; then
    read -r -p "Type 'yes' to proceed: " REPLY
    if [ "${REPLY}" != "yes" ]; then
      echo "restore: aborted by operator" >&2
      exit 1
    fi
  else
    echo "restore: refusing to proceed without --yes (no TTY attached)" >&2
    exit 1
  fi
fi

echo "restore: running pg_restore"
pg_restore \
  --clean --if-exists \
  --no-owner --no-privileges \
  -d "${DATABASE_URL}" \
  "${FILE}"

echo "restore:ok source=${FILE}"
