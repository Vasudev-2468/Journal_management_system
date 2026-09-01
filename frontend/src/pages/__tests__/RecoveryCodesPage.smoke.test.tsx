import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../../components/layout/Header', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../components/layout/Footer', () => ({
    __esModule: true,
    default: () => null,
}));
// Collapse the auth guard — it would otherwise hit /author-auth/me.
jest.mock('../../components/common/ProtectedAuthorRoute', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../api/recoveryCodes', () => ({
    __esModule: true,
    getCount: jest.fn(),
    generateCodes: jest.fn(),
    consumeCode: jest.fn(),
}));

import { getCount } from '../../api/recoveryCodes';
import RecoveryCodesPage from '../RecoveryCodesPage';

const mockedGetCount = getCount as jest.Mock;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    mockedGetCount.mockReset();
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

describe('<RecoveryCodesPage />', () => {
    test('renders the remaining-count digit from the mocked API', async () => {
        mockedGetCount.mockResolvedValueOnce({ total: 8, remaining: 5 });

        await act(async () => {
            root.render(
                <MemoryRouter>
                    <RecoveryCodesPage />
                </MemoryRouter>,
            );
        });
        // Flush getCount's resolution + the re-render.
        await act(async () => {});

        // The page renders "5 of 8" in the big counter.
        expect(container.textContent || '').toContain('5');
        expect(container.textContent || '').toMatch(/5\s*of\s*8/i);
    });

    test('shows the "Generate new codes" call-to-action button', async () => {
        mockedGetCount.mockResolvedValueOnce({ total: 8, remaining: 5 });

        await act(async () => {
            root.render(
                <MemoryRouter>
                    <RecoveryCodesPage />
                </MemoryRouter>,
            );
        });
        await act(async () => {});

        const buttons = Array.from(
            container.querySelectorAll<HTMLButtonElement>('button'),
        );
        const gen = buttons.find((b) =>
            /generate new codes/i.test(b.textContent || ''),
        );
        expect(gen).toBeDefined();
    });
});
