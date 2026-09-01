import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

// Header/Footer both consume JournalContext + fire off a network call;
// ProtectedAuthorRoute would try to verify the author_token via
// /author-auth/me. Stub the whole shell so this smoke test only asserts
// the page copy.
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

jest.mock('../../api/authorAuth', () => ({
    __esModule: true,
    getAuthorProfile: jest.fn(() =>
        Promise.resolve({ email: 'jane@example.edu' }),
    ),
    authorLogout: jest.fn(),
}));
jest.mock('../../api/gdpr', () => ({
    __esModule: true,
    exportMyData: jest.fn(() => Promise.resolve()),
    deleteMyAccount: jest.fn(() =>
        Promise.resolve({ ok: true, message: 'Account anonymised.' }),
    ),
}));

import PrivacyControlsPage from '../PrivacyControlsPage';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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

describe('<PrivacyControlsPage />', () => {
    test('renders the "Download your data" and "Delete your account" section headings', async () => {
        await act(async () => {
            root.render(
                <MemoryRouter>
                    <PrivacyControlsPage />
                </MemoryRouter>,
            );
        });
        // Flush the getAuthorProfile microtask so the modal-side code
        // path is not what we're asserting — just the two card headings
        // rendered on first paint.
        await act(async () => {});

        const headings = Array.from(container.querySelectorAll('h2'));
        const download = headings.find((h) =>
            /download your data/i.test(h.textContent || ''),
        );
        const del = headings.find((h) =>
            /delete your account/i.test(h.textContent || ''),
        );
        expect(download).toBeDefined();
        expect(del).toBeDefined();
    });
});
