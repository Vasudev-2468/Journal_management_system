import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

// Mock the shared axios client so the fetch inside the effect resolves
// synchronously with whatever payload the test wants to exercise.
jest.mock('../../../api/client', () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
        post: jest.fn(),
    },
}));

// authorAuth is a plain-JS helper — the component only reads a token from
// it, so a stub value is enough. Keeping the shape aligned with the real
// module so `getAuthorToken()` still returns a string.
jest.mock('../../../api/authorAuth', () => ({
    __esModule: true,
    getAuthorToken: jest.fn(() => 'stub-author-token'),
}));

import client from '../../../api/client';
import ReviewerCommentsCard from '../ReviewerCommentsCard';

const mockedGet = client.get as jest.Mock;

let container: HTMLDivElement;
let root: Root;

const flush = async (): Promise<void> => {
    // Runs pending microtasks so state updates from the effect land in
    // the DOM before assertions.
    await act(async () => {});
};

beforeEach(() => {
    mockedGet.mockReset();
    try {
        localStorage.clear();
    } catch {
        /* ignore */
    }
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

describe('<ReviewerCommentsCard />', () => {
    test('renders the accordion when the API returns one reviewer', async () => {
        mockedGet.mockResolvedValueOnce({
            data: [
                {
                    reviewer_alias: 'Reviewer #1',
                    overall_recommendation: 'accept',
                    comments_to_authors: 'Beautifully argued — no changes needed.',
                    completed_at: '2026-01-01T00:00:00Z',
                },
            ],
        });

        await act(async () => {
            root.render(
                <ReviewerCommentsCard submissionId="sub-123" status="accepted" />,
            );
        });
        await flush();

        // The accordion header + accept pill prove the reviewer row
        // rendered from the mocked API response. The first entry is open
        // by default (openIdx starts at 0), so the body text is visible
        // without a click.
        expect(container.textContent).toContain('Reviewer #1');
        expect(container.textContent).toContain('Accept');
        expect(container.textContent).toContain('Beautifully argued — no changes needed.');
    });

    test('shows the friendly holding copy when the API returns []', async () => {
        mockedGet.mockResolvedValueOnce({ data: [] });

        await act(async () => {
            root.render(
                <ReviewerCommentsCard submissionId="sub-456" status="accepted" />,
            );
        });
        await flush();

        expect(container.textContent).toContain(
            'Reviewer comments will appear once released by the editorial office.',
        );
    });
});
