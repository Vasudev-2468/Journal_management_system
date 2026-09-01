import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

// Header/Footer both drag JournalContext + a live API call into the tree.
// The route guard itself hits /author-auth/me — collapse it to a
// pass-through so the smoke test doesn't need a fake token or a mocked
// axios verify call.
jest.mock('../../components/layout/Header', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../components/layout/Footer', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../components/common/ProtectedAuthorRoute', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Bare jest.fn() shells here; the test body sets the resolved payload
// with mockResolvedValueOnce. Inline Promise.resolve() factories were
// flaky against react-scripts' babel-jest transform in this repo, so we
// match the pattern from SubmissionThread.test.tsx that lands reliably.
jest.mock('../../api/sessions', () => ({
    __esModule: true,
    fetchMySessions: jest.fn(),
    revokeSession: jest.fn(),
    revokeOthers: jest.fn(),
}));

import { fetchMySessions } from '../../api/sessions';
import SessionsPage from '../SessionsPage';

const mockedFetch = fetchMySessions as jest.Mock;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    mockedFetch.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => {
        root.unmount();
    });
    container.remove();
});

// One current row + one other-device row. Keeping the second row
// non-current also ensures the "Revoke all other sessions" bulk button
// stays enabled (the component disables it when otherCount is 0).
const twoRows = [
    {
        id: 1,
        ip_address: '10.0.0.1',
        user_agent:
            'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36',
        created_at: '2026-01-01T10:00:00Z',
        last_seen_at: '2026-01-02T09:00:00Z',
        is_current: true,
    },
    {
        id: 2,
        ip_address: '203.0.113.4',
        user_agent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Firefox/121.0',
        created_at: '2025-12-01T10:00:00Z',
        last_seen_at: '2025-12-30T22:00:00Z',
        is_current: false,
    },
];

describe('<SessionsPage />', () => {
    test('renders one row per mocked session', async () => {
        mockedFetch.mockResolvedValueOnce(twoRows);

        await act(async () => {
            root.render(
                <MemoryRouter>
                    <SessionsPage />
                </MemoryRouter>,
            );
        });
        // Flush fetchMySessions' resolution + the setState rerender.
        await act(async () => {});

        const bodyRows = container.querySelectorAll('tbody tr');
        expect(bodyRows.length).toBe(2);
        // The current row carries the "This device" chip.
        expect(container.textContent || '').toMatch(/this device/i);
        // The second row surfaces the parsed Firefox label from its UA.
        expect(container.textContent || '').toMatch(/firefox/i);
    });

    test('shows the "Revoke all other sessions" bulk-revoke button', async () => {
        mockedFetch.mockResolvedValueOnce(twoRows);

        await act(async () => {
            root.render(
                <MemoryRouter>
                    <SessionsPage />
                </MemoryRouter>,
            );
        });
        await act(async () => {});

        const buttons = Array.from(
            container.querySelectorAll<HTMLButtonElement>('button'),
        );
        const bulk = buttons.find((b) =>
            /revoke all other sessions/i.test(b.textContent || ''),
        );
        expect(bulk).toBeDefined();
    });
});
