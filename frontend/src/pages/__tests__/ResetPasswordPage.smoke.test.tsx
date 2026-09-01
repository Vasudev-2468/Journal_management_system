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

// verifyReset is the only network dependency; a resolved stub is enough
// for a smoke render that never submits.
jest.mock('../../api/passwordReset', () => ({
    __esModule: true,
    requestReset: jest.fn(),
    verifyReset: jest.fn(() => Promise.resolve({ ok: true })),
}));

import ResetPasswordPage from '../ResetPasswordPage';

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

describe('<ResetPasswordPage />', () => {
    test('renders the new-password and confirm-password fields when a ?token= arrives', () => {
        act(() => {
            root.render(
                <MemoryRouter
                    initialEntries={['/reset-password?token=abc.def.ghi']}
                >
                    <ResetPasswordPage />
                </MemoryRouter>,
            );
        });
        const first = container.querySelector<HTMLInputElement>(
            'input#new-password',
        );
        const second = container.querySelector<HTMLInputElement>(
            'input#confirm-password',
        );
        expect(first).not.toBeNull();
        expect(second).not.toBeNull();
        // Both inputs are type=password — asserting this catches a
        // regression where either field is downgraded to text.
        expect(first!.type).toBe('password');
        expect(second!.type).toBe('password');
    });
});
