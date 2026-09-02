"""Board Import Validation Agent.

Deterministic pre-flight for CSV bulk-import of editorial board members.
No LLM, no network. Parses rows, normalises field names, validates
required fields and formats (email, ORCID, category), and matches
against the existing roster to classify each row as ``create``,
``update`` (email already on file), or ``skip`` (invalid).

The router calls :func:`analyse_csv` for the dry-run report the UI
displays, then — only if the editor confirms — calls :func:`apply_rows`
with the same validated payload to persist changes.
"""

from __future__ import annotations

import csv
import io
import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session

from ..models.editorial_board_member import BOARD_CATEGORIES, EditorialBoardMember


# ── Field mapping ───────────────────────────────────────
# Accepted header aliases. Keys are the canonical column names; values
# are the lowercase strings we will accept from the uploaded CSV. This
# lets an editor drop in a spreadsheet exported from any tool without
# renaming the columns first.
_HEADER_ALIASES: Dict[str, Tuple[str, ...]] = {
    "name": ("name", "full name", "member name"),
    "role": ("role", "title", "position"),
    "category": ("category", "group", "board category"),
    "affiliation": ("affiliation", "institution", "university"),
    "department": ("department", "dept"),
    "country": ("country",),
    "email": ("email", "email address", "e-mail"),
    "orcid": ("orcid", "orcid id"),
    "scholar_url": ("scholar", "scholar url", "google scholar"),
    "scopus_id": ("scopus", "scopus id"),
    "institutional_profile_url": ("profile", "profile url", "institutional profile"),
    "expertise": ("expertise", "research interests", "keywords"),
    "bio": ("bio", "biography"),
    "phone": ("phone", "phone number"),
    "years_editorial_experience": ("years experience", "editorial years", "years"),
    "sort_order": ("sort order", "order"),
    "is_active": ("active", "is active", "enabled"),
}

_CATEGORY_ALIASES: Dict[str, str] = {
    "eic": "editor_in_chief",
    "editor in chief": "editor_in_chief",
    "editor-in-chief": "editor_in_chief",
    "associate editor": "associate_editor",
    "managing editor": "managing_editor",
    "section editor": "section_editor",
    "board member": "board_member",
    "member": "board_member",
    "advisory": "advisory",
    "advisory board": "advisory",
    "technical": "technical",
    "production": "technical",
}
for c in BOARD_CATEGORIES:
    _CATEGORY_ALIASES[c] = c

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_ORCID_RE = re.compile(r"^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$")


def _norm(value: str) -> str:
    return (value or "").strip().lower()


def _build_header_map(headers: Iterable[str]) -> Dict[str, str]:
    """Map each incoming header to the canonical field name (if any)."""
    result: Dict[str, str] = {}
    for raw in headers:
        key = _norm(raw)
        for canonical, aliases in _HEADER_ALIASES.items():
            if key in aliases:
                result[raw] = canonical
                break
    return result


def _coerce_bool(value: Any) -> Optional[bool]:
    if value is None:
        return None
    s = str(value).strip().lower()
    if s in ("true", "yes", "y", "1", "active"):
        return True
    if s in ("false", "no", "n", "0", "inactive"):
        return False
    return None


def _coerce_int(value: Any) -> Optional[int]:
    if value is None or str(value).strip() == "":
        return None
    try:
        return int(str(value).strip())
    except (ValueError, TypeError):
        return None


def _parse_row(raw_row: Dict[str, str], header_map: Dict[str, str]) -> Tuple[Dict[str, Any], List[str]]:
    """Return (fields, errors) for one CSV row."""
    fields: Dict[str, Any] = {}
    errors: List[str] = []

    for raw_col, canonical in header_map.items():
        raw_value = (raw_row.get(raw_col) or "").strip()
        if not raw_value:
            continue

        if canonical == "category":
            fields[canonical] = _CATEGORY_ALIASES.get(_norm(raw_value), raw_value)
        elif canonical == "is_active":
            b = _coerce_bool(raw_value)
            if b is None:
                errors.append(f"Unrecognised value for is_active: {raw_value!r}")
            else:
                fields[canonical] = b
        elif canonical in ("years_editorial_experience", "sort_order"):
            n = _coerce_int(raw_value)
            if n is None:
                errors.append(f"Non-integer {canonical}: {raw_value!r}")
            else:
                fields[canonical] = n
        else:
            fields[canonical] = raw_value

    # Required fields
    if not fields.get("name"):
        errors.append("Missing required field: name")
    if not fields.get("role"):
        errors.append("Missing required field: role")

    # Format checks
    email = fields.get("email")
    if email and not _EMAIL_RE.match(email):
        errors.append(f"Invalid email: {email!r}")
    orcid = fields.get("orcid")
    if orcid and not _ORCID_RE.match(orcid):
        errors.append(f"Invalid ORCID format: {orcid!r} (expected XXXX-XXXX-XXXX-XXXX)")
    cat = fields.get("category")
    if cat and cat not in BOARD_CATEGORIES:
        errors.append(
            f"Unknown category {cat!r}. Allowed: {', '.join(BOARD_CATEGORIES)}",
        )
    if not cat:
        fields["category"] = "board_member"

    return fields, errors


def analyse_csv(db: Session, csv_bytes: bytes) -> Dict[str, Any]:
    """Parse the CSV and classify each row without touching the database."""
    try:
        text = csv_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = csv_bytes.decode("latin-1", errors="replace")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return {
            "total_rows": 0, "will_create": 0, "will_update": 0, "will_skip": 0,
            "unrecognised_headers": [], "rows": [],
            "summary": "No header row found — is this a valid CSV?",
        }

    header_map = _build_header_map(reader.fieldnames)
    unrecognised = [h for h in reader.fieldnames if h not in header_map]

    # Existing members keyed by email (case-insensitive) for update-detection.
    existing_by_email: Dict[str, EditorialBoardMember] = {}
    for m in db.query(EditorialBoardMember).all():
        if m.email:
            existing_by_email[m.email.strip().lower()] = m

    rows: List[Dict[str, Any]] = []
    seen_emails_in_file: Dict[str, int] = {}  # email → first row index

    will_create = will_update = will_skip = 0
    for idx, raw_row in enumerate(reader, start=2):  # start=2 → header is row 1
        fields, errors = _parse_row(raw_row, header_map)

        # Duplicate-within-file
        email = (fields.get("email") or "").strip().lower()
        if email:
            if email in seen_emails_in_file:
                errors.append(
                    f"Duplicate email in this file (first seen at row {seen_emails_in_file[email]})",
                )
            else:
                seen_emails_in_file[email] = idx

        # Action
        if errors:
            action = "skip"
            will_skip += 1
        elif email and email in existing_by_email:
            action = "update"
            fields["_existing_id"] = existing_by_email[email].id
            will_update += 1
        else:
            action = "create"
            will_create += 1

        rows.append({
            "row_number": idx,
            "action": action,
            "name": fields.get("name") or "",
            "email": fields.get("email"),
            "role": fields.get("role"),
            "category": fields.get("category"),
            "errors": errors,
            "fields": fields,
        })

    return {
        "total_rows": len(rows),
        "will_create": will_create,
        "will_update": will_update,
        "will_skip": will_skip,
        "unrecognised_headers": unrecognised,
        "rows": rows,
        "summary": (
            f"{will_create} to create, {will_update} to update, "
            f"{will_skip} to skip due to errors."
        ),
    }


def apply_rows(db: Session, report: Dict[str, Any]) -> Dict[str, int]:
    """Persist rows classified as create/update by :func:`analyse_csv`.

    Rows with any errors are always skipped. Returns a small stats dict.
    """
    created = updated = 0
    for row in report.get("rows", []):
        if row.get("errors"):
            continue
        fields = dict(row.get("fields") or {})
        existing_id = fields.pop("_existing_id", None)

        if row["action"] == "update" and existing_id is not None:
            member = db.query(EditorialBoardMember).filter(
                EditorialBoardMember.id == existing_id,
            ).first()
            if member is None:
                # Row said update, but record disappeared between dry-run
                # and apply. Fall back to create.
                member = EditorialBoardMember(**fields)
                db.add(member)
                created += 1
            else:
                for k, v in fields.items():
                    setattr(member, k, v)
                updated += 1
        elif row["action"] == "create":
            db.add(EditorialBoardMember(**fields))
            created += 1

    db.commit()
    return {"created": created, "updated": updated}


# ── Export ──────────────────────────────────────────────
# Kept in the same file so the export column order stays in lockstep
# with the import canonical field list — one place to add a column.

EXPORT_COLUMNS: Tuple[str, ...] = (
    "name", "role", "category", "affiliation", "department", "country",
    "email", "orcid", "scholar_url", "scopus_id", "institutional_profile_url",
    "expertise", "phone", "years_editorial_experience", "sort_order", "is_active",
)


def export_csv(members: Iterable[EditorialBoardMember]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(EXPORT_COLUMNS)
    for m in members:
        writer.writerow([getattr(m, col, "") if getattr(m, col, None) is not None else "" for col in EXPORT_COLUMNS])
    return buf.getvalue()
