import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// The page reads references off the platform module and pushes imports
// through referenceImport. Both are stubbed to empty / no-op shapes —
// the smoke check only cares about the format toggle + textarea being
// on screen.
jest.mock('../../api/platform', () => ({
    __esModule: true,
    fetchReferences: jest.fn(() => Promise.resolve([])),
    deleteReference: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../api/referenceImport', () => ({
    __esModule: true,
    importReferences: jest.fn(() =>
        Promise.resolve({ inserted: 0, entries: [] }),
    ),
}));

import EditorArticleReferencesPage from '../EditorArticleReferencesPage';

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

describe('<EditorArticleReferencesPage />', () => {
    test('renders the BibTeX / RIS format toggle and the paste textarea', async () => {
        await act(async () => {
            root.render(
                <MemoryRouter
                    initialEntries={['/editor/articles/42/references']}
                >
                    <Routes>
                        <Route
                            path="/editor/articles/:articleId/references"
                            element={<EditorArticleReferencesPage />}
                        />
                    </Routes>
                </MemoryRouter>,
            );
        });
        // Flush the fetchReferences call that fires on mount.
        await act(async () => {});

        const buttons = Array.from(
            container.querySelectorAll<HTMLButtonElement>('button'),
        );
        const bibtex = buttons.find((b) =>
            /^bibtex$/i.test((b.textContent || '').trim()),
        );
        const ris = buttons.find((b) =>
            /^ris$/i.test((b.textContent || '').trim()),
        );
        expect(bibtex).toBeDefined();
        expect(ris).toBeDefined();

        const textarea = container.querySelector('textarea');
        expect(textarea).not.toBeNull();
    });
});
