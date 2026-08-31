import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import CookieBanner from '../CookieBanner';

// Inline router helper — one banner test file, no reason to lift into a
// shared util.
const renderWithRouter = (node: React.ReactElement, root: Root): void => {
    act(() => {
        root.render(<MemoryRouter>{node}</MemoryRouter>);
    });
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    try {
        localStorage.clear();
    } catch {
        /* ignore */
    }
    delete (window as unknown as { grantAnalyticsConsent?: () => void })
        .grantAnalyticsConsent;
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

describe('<CookieBanner />', () => {
    test('appears when cookie_consent is null in localStorage', () => {
        renderWithRouter(<CookieBanner />, root);
        const dialog = container.querySelector('[role="dialog"][aria-label="Cookie consent"]');
        expect(dialog).not.toBeNull();
    });

    test('Accept writes "1" to localStorage and hides the banner', () => {
        renderWithRouter(<CookieBanner />, root);
        // The Accept button is the second/only <button> with "Accept" text.
        const buttons = Array.from(
            container.querySelectorAll<HTMLButtonElement>('button'),
        );
        const accept = buttons.find((b) => /accept/i.test(b.textContent || ''));
        expect(accept).toBeDefined();
        act(() => {
            accept!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(localStorage.getItem('cookie_consent')).toBe('1');
        expect(
            container.querySelector('[role="dialog"][aria-label="Cookie consent"]'),
        ).toBeNull();
    });

    test('"Learn more" links to /cookie-policy', () => {
        renderWithRouter(<CookieBanner />, root);
        const link = Array.from(
            container.querySelectorAll<HTMLAnchorElement>('a'),
        ).find((a) => /learn more/i.test(a.textContent || ''));
        expect(link).toBeDefined();
        expect(link!.getAttribute('href')).toBe('/cookie-policy');
    });
});
