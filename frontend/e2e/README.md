# Frontend E2E smoke suite

Minimal Playwright smoke tests that exercise the top three public flows:
homepage load, articles list, and the search page input.

## One-time setup

Install the Chromium browser Playwright uses (the driver itself comes in
via `npm ci` in `frontend/`):

```bash
npx playwright install chromium
```

On Linux CI runners, add the OS packages Chromium needs:

```bash
npx playwright install --with-deps chromium
```

## Running the suite

From `frontend/`:

```bash
npm run e2e
```

Playwright will boot a local dev server on `http://localhost:3000`
(reusing an existing one if you already have `npm start` running) and
run the smoke specs headlessly in Chromium.

## Skipping in CI

To skip the whole suite for a given run without deleting anything, set:

```bash
E2E_SKIP=1
```

Every test in `smoke.spec.ts` early-returns when this variable is
truthy. This is convenient for release branches or preview deploys where
the browser install would otherwise dominate the pipeline.

## Artefacts

Test results, HTML reports, and blob reports are all written under
`frontend/e2e/` and are gitignored — see `frontend/e2e/.gitignore`.
