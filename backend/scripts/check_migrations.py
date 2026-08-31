#!/usr/bin/env python3
"""CI guard: fail if Alembic has more than one migration head.

Cross-platform equivalent of ``check_migrations.sh`` — invoked from
Windows CI runners, from Docker-based build agents, and from
pre-commit hooks that already have Python available.

Behaviour matches the shell script exactly:

* Runs ``alembic heads`` from the backend directory (the parent of
  ``scripts/``).
* Counts lines containing ``(head)``.
* Exits 0 if exactly one head, 1 otherwise, with a helpful message
  telling the reader how to merge.

Multiple heads means two branches added migrations in parallel;
``alembic upgrade head`` in that state fails hard on newer Alembic
and — worse — silently upgrades to only one branch on older Alembic.
Merging them into a single revision with ``alembic merge`` restores a
linear history.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent.parent


def _run_alembic_heads() -> tuple[int, str, str]:
    alembic = shutil.which("alembic")
    if alembic is None:
        # Fall back to `python -m alembic` for environments where the
        # console script is not on PATH (some virtualenvs on Windows).
        cmd = [sys.executable, "-m", "alembic", "heads"]
    else:
        cmd = [alembic, "heads"]

    proc = subprocess.run(
        cmd,
        cwd=str(BACKEND_DIR),
        capture_output=True,
        text=True,
        check=False,
    )
    return proc.returncode, proc.stdout or "", proc.stderr or ""


def main() -> int:
    rc, stdout, stderr = _run_alembic_heads()
    if rc != 0:
        print("ERROR: `alembic heads` exited non-zero.", file=sys.stderr)
        if stderr.strip():
            print(stderr.strip(), file=sys.stderr)
        return 1

    head_lines = [ln for ln in stdout.splitlines() if "(head)" in ln]
    count = len(head_lines)

    if count == 1:
        print("alembic heads: OK (1 head)")
        return 0

    print("", file=sys.stderr)
    print(
        f"ERROR: expected exactly 1 alembic head, found {count}.",
        file=sys.stderr,
    )
    print("", file=sys.stderr)
    print("Current heads:", file=sys.stderr)
    print(stdout.rstrip() or "(no output)", file=sys.stderr)
    print("", file=sys.stderr)
    print(
        "This usually means two branches added migrations in parallel.\n"
        "Resolve by merging the heads into a single revision:\n"
        "\n"
        "    # From backend/, with both parents' revision ids:\n"
        "    alembic merge -m \"merge heads\" <rev_a> <rev_b>\n"
        "\n"
        "Commit the resulting merge revision alongside your branch and\n"
        "re-run this check.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
