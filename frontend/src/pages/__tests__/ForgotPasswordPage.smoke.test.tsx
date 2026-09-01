import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

// The page's only network call is requestReset; Header/Footer are
// stubbed for the usual JournalContext reasons.
jest.mock('../../components/layout/Header', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../components/layout/Footer', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../../api/passwordReset', () => ({
    __esModule: true,
    requestReset: jest.fn(() =>
        Promise.resolve({
            message: 'If an account exists for that email, we sent it.',
        }),
    ),
    verifyReset: jest.fn(),
}));

import ForgotPasswordPage from '../ForgotPasswordPage';

// React tracks the intercepted "value" setter — dispatching a plain event
// with e.target.value would be swallowed by the synthetic event layer.
const setControlledValue = (
    input: HTMLInputElement,
    value: string,
): void => {
    const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
};

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

describe('<ForgotPasswordPage />', () => {
    test('renders the email input', () => {
        act(() => {
            root.render(
                <MemoryRouter>
                    <ForgotPasswordPage />
                </MemoryRouter>,
            );
        });
        const input = container.querySelector<HTMLInputElement>(
            'input#reset-email',
        );
        expect(input).not.toBeNull();
        expect(input!.type).toBe('email');
    });

    test('typing an email and submitting shows the "check your inbox" success copy', async () => {
        act(() => {
            root.render(
                <MemoryRouter>
                    <ForgotPasswordPage />
                </MemoryRouter>,
            );
        });
        const input = container.querySelector<HTMLInputElement>(
            'input#reset-email',
        )!;
        act(() => {
            setControlledValue(input, 'ada@example.edu');
        });
        const form = container.querySelector('form')!;
        await act(async () => {
            form.dispatchEvent(
                new Event('submit', { bubbles: true, cancelable: true }),
            );
        });
        // Flush the requestReset resolution + the setSent(true) rerender.
        await act(async () => {});

        // The success card renders inside role="status" with the
        // "Check your inbox" bolded header.
        expect(container.textContent || '').toMatch(/check your inbox/i);
    });
});
