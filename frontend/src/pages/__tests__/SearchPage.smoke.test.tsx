import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

// The page pulls Header and Footer from the layout bundle. Both reach
// into JournalContext, which itself makes an authenticated API call
// during mount — we stub them to null-returning components so this
// smoke test stays focused on the page shell.
jest.mock('../../components/layout/Header', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../components/layout/Footer', () => ({
    __esModule: true,
    default: () => null,
}));

// searchArticles is the only network dependency the page owns directly.
// A stub that resolves to an empty result keeps the hero render clean.
jest.mock('../../api/search', () => ({
    __esModule: true,
    searchArticles: jest.fn(() =>
        Promise.resolve({ items: [], total: 0, page: 1, page_size: 20 }),
    ),
}));

import SearchPage from '../SearchPage';

const renderWithRouter = (node: React.ReactElement, root: Root): void => {
    act(() => {
        root.render(<MemoryRouter>{node}</MemoryRouter>);
    });
};

// Controlled inputs read the "next value" from the native value setter —
// dispatching a plain event with e.target.value would be silently
// swallowed because React tracks the intercepted setter.
const setControlledValue = (
    input: HTMLInputElement | HTMLTextAreaElement,
    value: string,
): void => {
    const proto =
        input instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
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

describe('<SearchPage />', () => {
    test('renders the hero heading', () => {
        renderWithRouter(<SearchPage />, root);
        const h1 = container.querySelector('h1');
        expect(h1).not.toBeNull();
        expect(h1!.textContent).toMatch(/search the archive/i);
    });

    test('the search input accepts typed text', () => {
        renderWithRouter(<SearchPage />, root);
        const input = container.querySelector<HTMLInputElement>(
            'input[type="search"]',
        );
        expect(input).not.toBeNull();
        act(() => {
            setControlledValue(input!, 'quantum computing');
        });
        expect(input!.value).toBe('quantum computing');
    });
});
