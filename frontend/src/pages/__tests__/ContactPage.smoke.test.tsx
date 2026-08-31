import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

// Header/Footer both reach into JournalContext; ContactPage itself
// consumes useJournal directly. Mock the context module with a
// hook-only surface so the page has a benign "no journal loaded"
// state without spinning up the real provider.
jest.mock('../../components/layout/Header', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../components/layout/Footer', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../context/JournalContext', () => ({
    __esModule: true,
    useJournal: () => ({
        journal: null,
        loading: false,
        error: null,
        refresh: jest.fn(async () => {}),
        update: jest.fn(async () => ({})),
    }),
    JournalProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../api/contact', () => ({
    __esModule: true,
    submitContactMessage: jest.fn(() => Promise.resolve({ id: 1 })),
    fetchContactMessages: jest.fn(),
    updateContactMessage: jest.fn(),
    deleteContactMessage: jest.fn(),
}));

import ContactPage from '../ContactPage';

// Controlled inputs read the "next value" from the native value setter;
// dispatching a plain event with target.value would be silently swallowed
// because React tracks the intercepted setter.
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

describe('<ContactPage />', () => {
    test('renders the contact form heading', () => {
        act(() => {
            root.render(
                <MemoryRouter>
                    <ContactPage />
                </MemoryRouter>,
            );
        });
        const h1 = container.querySelector('h1');
        expect(h1).not.toBeNull();
        expect(h1!.textContent).toMatch(/contact the editorial office/i);
    });

    test('typing into the Name field updates its value', () => {
        act(() => {
            root.render(
                <MemoryRouter>
                    <ContactPage />
                </MemoryRouter>,
            );
        });
        const name = container.querySelector<HTMLInputElement>('#c-name');
        expect(name).not.toBeNull();
        act(() => {
            setControlledValue(name!, 'Ada Lovelace');
        });
        expect(name!.value).toBe('Ada Lovelace');
    });
});
