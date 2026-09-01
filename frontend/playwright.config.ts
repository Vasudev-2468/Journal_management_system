import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for the frontend smoke suite.
 *
 * The tests live in ./e2e and hit the app served by `npm start`. Locally
 * an already-running dev server is reused; in CI we always boot a fresh
 * one so the run is deterministic.
 */
export default defineConfig({
    testDir: './e2e',
    use: {
        baseURL: 'http://localhost:3000',
        headless: true,
        viewport: { width: 1280, height: 720 },
    },
    projects: [
        {
            name: 'chromium',
            use: { browserName: 'chromium' },
        },
    ],
    webServer: {
        command: 'npm start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
