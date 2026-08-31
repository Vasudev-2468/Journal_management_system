import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

// Stub the layout so we don't drag JournalContext + its data fetch
// into a smoke test. Both the page and the embedded
// PublicationStatistics component pull from the articles and
// publication API modules — mock those to empty datasets so effects
// resolve quickly.
jest.mock('../../components/layout/Header', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../components/layout/Footer', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../api/articles', () => ({
    __esModule: true,
    fetchArticles: jest.fn(() => Promise.resolve([])),
    fetchArticleById: jest.fn(),
    createArticle: jest.fn(),
    updateArticle: jest.fn(),
    deleteArticle: jest.fn(),
}));
jest.mock('../../api/publication', () => ({
    __esModule: true,
    fetchVolumes: jest.fn(() => Promise.resolve([])),
    fetchIssues: jest.fn(() => Promise.resolve([])),
    fetchIssueDetail: jest.fn(),
    createVolume: jest.fn(),
    updateVolume: jest.fn(),
    deleteVolume: jest.fn(),
    createIssue: jest.fn(),
    updateIssue: jest.fn(),
    deleteIssue: jest.fn(),
    addArticleToIssue: jest.fn(),
    removeArticleFromIssue: jest.fn(),
}));

import StatisticsPage from '../StatisticsPage';

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

describe('<StatisticsPage />', () => {
    test('renders the "Publication Statistics" heading from the embedded card', async () => {
        await act(async () => {
            root.render(
                <MemoryRouter>
                    <StatisticsPage />
                </MemoryRouter>,
            );
        });
        // Flush the effect chain — fetchArticles / fetchVolumes resolve
        // in the next microtask, then setState + rerender lands.
        await act(async () => {});

        const headings = Array.from(container.querySelectorAll('h1, h2'));
        const match = headings.find((h) =>
            /publication statistics/i.test(h.textContent || ''),
        );
        expect(match).toBeDefined();
    });
});
