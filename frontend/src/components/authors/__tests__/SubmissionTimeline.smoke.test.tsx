import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

// fetchTimeline is the sole network dependency. Mock it as a bare
// jest.fn and set the resolved payload in the test — matching the
// pattern established in SubmissionThread.test.tsx.
jest.mock('../../../api/timeline', () => ({
    __esModule: true,
    fetchTimeline: jest.fn(),
}));

import { fetchTimeline } from '../../../api/timeline';
import SubmissionTimeline from '../SubmissionTimeline';

const mockedFetch = fetchTimeline as jest.Mock;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    mockedFetch.mockReset();
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

describe('<SubmissionTimeline />', () => {
    test('renders the mocked "Submitted" event label', async () => {
        mockedFetch.mockResolvedValueOnce({
            events: [
                {
                    at: '2026-01-15T10:00:00Z',
                    kind: 'submitted',
                    label: 'Submitted',
                    actor: null,
                    meta: null,
                },
            ],
        });

        await act(async () => {
            root.render(<SubmissionTimeline submissionId="abc-123" />);
        });
        // Flush the fetchTimeline microtask + the setState rerender.
        await act(async () => {});

        expect(container.textContent || '').toContain('Submitted');
    });
});
