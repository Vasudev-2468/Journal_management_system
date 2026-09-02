# UI Primitives

Shared components + canonical palette. New pages MUST build on these.

## Palette

Use the semantic tone name, not the raw Tailwind class:

| Tone | Use for | Class family |
|---|---|---|
| `primary` | main actions, links, focused controls | `blue-*` |
| `success` | acceptance, confirmed states, positive outcomes | `emerald-*` |
| `warning` | pending, needs-attention, expiring | `amber-*` |
| `danger` | rejection, retraction, destructive actions | `rose-*` |
| `neutral` | secondary buttons, dividers, muted text | `gray-*` |

**Do not** reach for `bg-brand-*`, `bg-indigo-*`, `bg-green-*`, `bg-red-*`,
`bg-orange-*`, or `bg-yellow-*` in new code. Those exist in legacy pages
and are being retired.

## Components

```tsx
import {
  Button, IconButton, PageHeader, AlertBanner,
  EmptyState, LoadingIndicator, Card, SectionTitle,
} from '../components/ui';
```

### Button

```tsx
<Button tone="primary" size="md" onClick={save}>Save changes</Button>
<Button tone="danger" variant="soft">Revoke</Button>
<Button tone="success" loading={busy}>Publishing…</Button>
```

- `tone`: primary | success | warning | danger | neutral
- `variant`: solid (default) | soft | ghost
- `size`: sm | md (default) | lg
- Focus rings + disabled state baked in

### IconButton

Icon-only buttons that ARE screen-reader safe. `label` is required.

```tsx
<IconButton icon="⚖️" label="Decision workspace" onClick={openDecision} />
```

### PageHeader

Consistent page header with title, subtitle, right-side actions.

```tsx
<PageHeader
  icon="📧"
  title="Email templates"
  subtitle="Customise the transactional emails sent by JGAIR."
  right={<Button tone="primary">+ Template</Button>}
/>
```

### AlertBanner

Replaces the inline error/success banners each page rolls its own version of.

```tsx
{error && <AlertBanner tone="danger">{error}</AlertBanner>}
{savedAt && <AlertBanner tone="success" onDismiss={() => setSavedAt(null)}>Saved.</AlertBanner>}
```

### EmptyState

```tsx
<EmptyState
  icon="📭"
  title="No submissions yet."
  hint="Author submissions appear here as they arrive."
  action={<Button tone="primary">Refresh</Button>}
/>
```

### LoadingIndicator

```tsx
{loading && <LoadingIndicator />}
{loading && <LoadingIndicator label="Loading briefing…" fullPage />}
```

### Card + SectionTitle

```tsx
<Card>
  <SectionTitle>Reviewer signal</SectionTitle>
  ...
</Card>
```

## Migration plan

1. **New pages** — build on primitives from day one.
2. **Existing editor admin pages** — migrate one per PR when touching for another reason.
3. **Auto codemod** — deferred; requires test coverage first.
