"""Assert exactly ONE Alembic head is present.

Run as part of CI (or a local pre-commit) to fail early when a
branch merge is missing. A second head almost always means someone
added a migration in parallel with someone else and forgot to add a
merge migration afterwards, which then causes ``alembic upgrade head``
to refuse to run in production.

Exit codes:
  * 0 — exactly one head found.
  * 1 — zero or multiple heads found. Message names the heads so a
        merge migration can be written immediately.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def main() -> int:
    # Locate the alembic.ini next to backend/. This script lives at
    # backend/scripts/check_migration_heads.py so alembic.ini is the
    # parent directory's neighbour.
    here = Path(__file__).resolve().parent
    backend_root = here.parent
    ini = backend_root / "alembic.ini"
    if not ini.exists():
        print(f"[migration-check] alembic.ini not found at {ini}", file=sys.stderr)
        return 1

    # Make the app package importable — some env.py entries need it.
    sys.path.insert(0, str(backend_root))
    os.chdir(str(backend_root))

    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory
    except ImportError:
        print("[migration-check] alembic is not installed in this Python.", file=sys.stderr)
        return 1

    cfg = Config(str(ini))
    script = ScriptDirectory.from_config(cfg)
    heads = list(script.get_heads())

    if len(heads) == 1:
        print(f"[migration-check] OK — single head: {heads[0]}")
        return 0

    if not heads:
        print("[migration-check] No heads found — the versions directory is empty?", file=sys.stderr)
        return 1

    print(
        "[migration-check] FAIL — multiple heads present. Add a merge "
        "migration to unify them before shipping.\n"
        "  Heads:\n"
        + "\n".join(f"    - {h}" for h in heads)
        + "\n\n"
          "  Fix:\n"
          "    alembic merge -m 'merge heads' " + " ".join(heads),
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
