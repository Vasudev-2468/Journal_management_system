#!/usr/bin/env bash
# backup_db.sh — take a compressed logical dump of the journal database.
#
# Reads DATABASE_URL from the environment (same connection string the
# backend uses). Writes /backups/jgair_<UTC-timestamp>.dump using
# pg_dump's custom format so pg_restore can do selective restores.
#
# Optional environment variables:
#   RETENTION_DAYS      Delete jgair_*.dump files older than N days
#                       from /backups. Default: 30.
#   BACKUP_S3_BUCKET    If set (e.g. "s3://my-bucket/prod/pg"), upload
#                       the dump there via `aws s3 cp`. Assumes the
#                       aws CLI is on PATH and credentials are wired
#                       via the environment / instance profile.
#   BACKUP_DIR          Destination directory. Default: /backups.
#
# On success prints size + destination and a one-line summary of the
# form: `backup:ok size=<bytes> retention_removed=<N>`.
# Exits non-zero on any failure (set -euo pipefail).

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "${BACKUP_DIR}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/jgair_${STAMP}.dump"

echo "backup: starting pg_dump -> ${OUT}"
pg_dump -Fc "${DATABASE_URL}" -f "${OUT}"

# Verify the dump has a readable table-of-contents before we trust it.
pg_restore --list "${OUT}" > /dev/null

# Report size in bytes (portable across GNU/BSD stat).
if SIZE_BYTES="$(stat -c '%s' "${OUT}" 2>/dev/null)"; then
  :
else
  SIZE_BYTES="$(stat -f '%z' "${OUT}")"
fi

# Human-friendly size for the log line.
if command -v numfmt >/dev/null 2>&1; then
  SIZE_HUMAN="$(numfmt --to=iec --suffix=B "${SIZE_BYTES}")"
else
  SIZE_HUMAN="${SIZE_BYTES}B"
fi

echo "backup: wrote ${OUT} (${SIZE_HUMAN})"

# Optional S3 upload — assumes `aws` CLI available and creds configured.
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  if ! command -v aws >/dev/null 2>&1; then
    echo "backup: BACKUP_S3_BUCKET set but 'aws' CLI not found on PATH" >&2
    exit 1
  fi
  # Trim any trailing slash so the join is clean.
  DEST="${BACKUP_S3_BUCKET%/}/jgair_${STAMP}.dump"
  echo "backup: uploading to ${DEST}"
  aws s3 cp "${OUT}" "${DEST}"
fi

# Retention sweep — remove old local dumps.
RETENTION_REMOVED=0
if [ "${RETENTION_DAYS}" -gt 0 ]; then
  # -mtime +N picks files strictly older than N*24h.
  while IFS= read -r -d '' old; do
    rm -f -- "${old}"
    RETENTION_REMOVED=$((RETENTION_REMOVED + 1))
  done < <(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'jgair_*.dump' -mtime "+${RETENTION_DAYS}" -print0)
fi

echo "backup:ok size=${SIZE_BYTES} retention_removed=${RETENTION_REMOVED}"
