import { test, expect } from '@playwright/test';

/**
 * Smoke suite for the top three public flows. These tests intentionally
 * assert very little beyond "the page rendered and interactive elements
 * work" — anything deeper belongs in a targeted spec.
 *
 * Set `E2E_SKIP=1` in the environment to bypass the whole suite (used
 * by CI when the smoke tests should be skipped for a given run).
 */
test.skip(!!process.env.E2E_SKIP, 'E2E_SKIP is set — smoke suite bypassed');

test('homepage loads and shows a top-level heading', async ({ page }) => {
    await page.goto('/');
    // The exact copy is not asserted — we only care that the page
    // rendered something at heading level 1.
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
});

test('articles list shows at least one card or an empty-state message', async ({
    page,
}) => {
    await page.goto('/articles');

    // The list page renders either article cards (usually <article>
    // elements or role="article") or a friendly "No articles..."
    // placeholder when the collection is empty. Either satisfies the
    // smoke assertion — we just want to prove the route mounted.
    const card = page.locator('article, [data-testid="article-card"]').first();
    const emptyState = page.getByText(/no articles/i).first();

    await expect(card.or(emptyState)).toBeVisible();
});

test('search page updates the input value on typing', async ({ page }) => {
    await page.goto('/search?q=test');

    // Prefer the visible search box. `type="search"` is the most
    // distinctive selector on the page.
    const input = page.locator('input[type="search"]').first();
    await expect(input).toBeVisible();

    // Clear and type a fresh value, then confirm the controlled input
    // reflects it.
    await input.fill('');
    await input.type('playwright');
    await expect(input).toHaveValue('playwright');
});
