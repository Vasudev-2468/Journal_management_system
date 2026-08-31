#!/usr/bin/env bash
#
# CI guard: fail the build if the Alembic migration graph has more
# than one head. Multiple heads means two branches added migrations
# in parallel and nobody has merged them yet — running `alembic
# upgrade head` in that state is undefined and often silently skips
# tables.
#
# Usage (from the backend/ directory):
#   ./scripts/check_migrations.sh
#
# Exit codes:
#   0 — exactly one head; safe to deploy.
#   1 — multiple heads or alembic reported an error.
#
set -euo pipefail

# Locate the backend directory (parent of scripts/) so this script can
# be invoked from anywhere in CI.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${BACKEND_DIR}"

# `alembic heads` prints one line per head, each ending with " (head)".
# Blank lines and warnings on stderr are ignored.
HEADS_OUTPUT="$(alembic heads 2>/dev/null || true)"
HEAD_COUNT="$(printf '%s\n' "${HEADS_OUTPUT}" | grep -c '(head)' || true)"

if [ "${HEAD_COUNT}" -eq 1 ]; then
    echo "alembic heads: OK (1 head)"
    exit 0
fi

echo "" >&2
echo "ERROR: expected exactly 1 alembic head, found ${HEAD_COUNT}." >&2
echo "" >&2
echo "Current heads:" >&2
printf '%s\n' "${HEADS_OUTPUT}" >&2
echo "" >&2
echo "This usually means two branches added migrations in parallel." >&2
echo "Resolve by merging the heads into a single revision:" >&2
echo "" >&2
echo "  # From backend/, with both parents' revision ids:" >&2
echo "  alembic merge -m \"merge heads\" <rev_a> <rev_b>" >&2
echo "" >&2
echo "Commit the resulting merge revision alongside your branch and" >&2
echo "re-run this check. See docs/BACKUP.md for restore procedure if" >&2
echo "a bad merge slips through to production." >&2
exit 1
