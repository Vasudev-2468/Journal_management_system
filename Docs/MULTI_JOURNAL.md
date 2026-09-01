# Multi-journal deployments

This platform grew up as a single-journal deployment. The changes described
here lay the storage and API scaffolding for multi-journal deployments
**without** changing any behavior for existing single-journal installs.

## The idea in one paragraph

Every operationally-scoped table now carries a nullable `journal_id` column.
A `NULL` value means "belongs to the primary journal" — the primary journal
is defined as the first `journals` row ordered by `created_at`. The frontend
still asks `/journals/current` first and only falls back to
`/tenancy/primary-journal` when the current-journal lookup returns nothing.
Nothing is ever backfilled: existing rows stay `NULL` and every existing
query keeps returning the same results it always did.

## Tables that now carry a `journal_id`

Migration `q3o8m6d7e1k2` adds a nullable `journal_id INTEGER` (FK to
`journals.id`, single-column index) to each of the following tables where it
is not already present:

- `submissions`
- `articles` — was already added by an earlier migration; the new one
  detects the pre-existing column and skips it, so the migration is safe on
  both fresh databases and databases that have already been through the
  earlier revision.
- `announcements`
- `editorial_board_members`
- `special_issues`
- `policy_pages`
- `reviewers`

The migration guards every add with an `information_schema.columns` check
and wraps the actual `ADD COLUMN` in a defensive `try/except`, so re-runs
and partial applies never fail with `DuplicateColumn`.

## The tenancy helper

`backend/app/services/tenancy.py` provides three tiny read-only helpers:

- `get_primary_journal(db)` — returns the primary `Journal` row (oldest by
  `created_at`, ties broken by `id`), or `None` if none exists yet.
- `get_primary_journal_id(db)` — same, but returns just the `id`.
- `ensure_journal_id(db, current)` — if `current` is set, returns it; else
  returns the primary journal's id. Handy when defaulting `journal_id` on
  write without special-casing single-journal deployments.

## The public endpoint

`GET /tenancy/primary-journal` returns the primary Journal in the same
shape as `GET /journals/current`. The frontend `JournalContext` uses it as
a silent fallback: if `/journals/current` throws (typically because no
journal is marked `is_active`), the context tries the primary-journal
endpoint. If both fail, the context stays `null` and the UI keeps working
with its pre-existing "no journal" defaults.

## Adding a second journal

Once you're ready to run more than one journal on a single deployment:

1. **Insert a Journal row.** Fill in `title`, `licence`, and any of the
   identity block you have. Do this via the editor UI (`/journals/`) or an
   admin script.
2. **Tag new operational rows.** When creating submissions, articles,
   announcements, board members, special issues, policy pages, or
   reviewers that should belong to the new journal, set their `journal_id`
   to the new Journal row's id. Existing rows stay `NULL` and keep behaving
   as "primary journal" content.
3. **Filter reads by `journal_id`.** In new read paths, treat `NULL` as
   "primary journal" and the new id as "second journal":
   ```python
   from app.services.tenancy import get_primary_journal_id

   primary_id = get_primary_journal_id(db)
   rows = (
       db.query(Model)
       .filter(
           (Model.journal_id == journal_id)
           | ((Model.journal_id.is_(None)) & (journal_id == primary_id))
       )
       .all()
   )
   ```
   Or, if you have already backfilled `journal_id` for every row, simply
   filter on `Model.journal_id == journal_id`.
4. **Route the request to a journal.** Pick the scoping mechanism that
   suits your product — a subdomain (`journal-a.example.org`), a path
   prefix (`/j/<slug>/…`), or a session-level "active journal" the user
   selects. The tenancy helper doesn't force a choice; it just gives you
   the id to filter on.

## Default behavior (single-journal deployments)

Nothing changes. Every `journal_id` column stays `NULL`. Every existing
query — none of which reference `journal_id` — keeps returning exactly what
it did before. The frontend continues to render off `/journals/current`.
The migration is additive; the downgrade drops only the columns it added.
