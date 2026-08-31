import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

// SubmissionThread pulls its data through the messages API helper — the
// axios client is one layer down. Mocking the helper module is both
// simpler and keeps the poll timer harmless (fetchMessages resolves
// immediately with the stub payload; polling is not asserted here).
jest.mock('../../../api/messages', () => ({
    __esModule: true,
    fetchMessages: jest.fn(),
    sendMessage: jest.fn(),
    markRead: jest.fn(),
}));

import { fetchMessages } from '../../../api/messages';
import SubmissionThread from '../SubmissionThread';

const mockedFetch = fetchMessages as jest.Mock;

const isoNow = () => new Date().toISOString();

let container: HTMLDivElement;
let root: Root;

const flush = async (): Promise<void> => {
    await act(async () => {});
};

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

describe('<SubmissionThread />', () => {
    test('renders bubbles from the mocked message list', async () => {
        mockedFetch.mockResolvedValueOnce([
            {
                id: 1,
                submission_id: 'x',
                sender_role: 'author',
                sender_email: null,
                body: 'Hello from the author.',
                is_from_editor: false,
                read_by_author_at: null,
                read_by_editor_at: null,
                created_at: isoNow(),
            },
            {
                id: 2,
                submission_id: 'x',
                sender_role: 'editor',
                sender_email: null,
                body: 'Thanks — the desk has it.',
                is_from_editor: true,
                read_by_author_at: null,
                read_by_editor_at: null,
                created_at: isoNow(),
            },
        ]);

        await act(async () => {
            root.render(<SubmissionThread submissionId="x" viewerRole="author" />);
        });
        await flush();

        expect(container.textContent).toContain('Hello from the author.');
        expect(container.textContent).toContain('Thanks — the desk has it.');
    });

    test('author-side bubble sits inside a right-aligned flex row', async () => {
        mockedFetch.mockResolvedValueOnce([
            {
                id: 1,
                submission_id: 'x',
                sender_role: 'author',
                sender_email: null,
                body: 'My own message.',
                is_from_editor: false,
                read_by_author_at: null,
                read_by_editor_at: null,
                created_at: isoNow(),
            },
        ]);

        await act(async () => {
            root.render(<SubmissionThread submissionId="x" viewerRole="author" />);
        });
        await flush();

        // Find the paragraph carrying the message body, then walk up to
        // its flex row. The viewer's own messages get `justify-end`.
        const paragraphs = Array.from(container.querySelectorAll('p'));
        const bubble = paragraphs.find((p) => p.textContent === 'My own message.');
        expect(bubble).toBeDefined();
        const row = bubble!.closest('.flex');
        expect(row).not.toBeNull();
        expect(row!.className).toContain('justify-end');
    });
});
