import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

// Header/Footer both require JournalContext — stub them out to keep
// this smoke test focused on the page copy.
jest.mock('../../components/layout/Header', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../components/layout/Footer', () => ({
    __esModule: true,
    default: () => null,
}));

import APCPage from '../APCPage';

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

describe('<APCPage />', () => {
    test('renders the "no article processing charges" statement', () => {
        act(() => {
            root.render(
                <MemoryRouter>
                    <APCPage />
                </MemoryRouter>,
            );
        });
        // The hero copy reads "There are no article processing charges."
        // — a case-insensitive substring is enough.
        expect(container.textContent || '').toMatch(
            /no article processing charges/i,
        );
    });
});
