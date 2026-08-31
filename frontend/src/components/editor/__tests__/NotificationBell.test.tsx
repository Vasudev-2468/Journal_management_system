import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

// The bell reads through the editor API layer's `fetchNotificationLog`.
// Mocking the module directly keeps the test independent of the
// axios instance and its interceptor stack.
jest.mock('../../../api/editor', () => ({
    __esModule: true,
    fetchNotificationLog: jest.fn(),
}));

import { fetchNotificationLog } from '../../../api/editor';
import NotificationBell from '../NotificationBell';

const mockedFetch = fetchNotificationLog as jest.Mock;

let container: HTMLDivElement;
let root: Root;

const flush = async (): Promise<void> => {
    await act(async () => {});
};

beforeEach(() => {
    mockedFetch.mockReset();
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

describe('<NotificationBell />', () => {
    test('renders the bell trigger button', async () => {
        mockedFetch.mockResolvedValueOnce({ entries: [] });
        await act(async () => {
            root.render(<NotificationBell />);
        });
        await flush();

        // The accessible name flips between "Notifications" and
        // "Notifications — N unread"; the shared prefix is enough here.
        const button = container.querySelector('button');
        expect(button).not.toBeNull();
        expect((button!.getAttribute('aria-label') || '')).toMatch(/notifications/i);
    });

    test('badge shows the unread count when the API returns unread items', async () => {
        // All three rows carry a sent_at newer than the (missing)
        // last-read timestamp, so computeUnreadIds treats them as unread.
        const now = Date.now();
        mockedFetch.mockResolvedValueOnce({
            entries: [
                {
                    id: 'n-1',
                    channel: 'email',
                    trigger_event: 'submission.received',
                    status: 'sent',
                    sent_at: new Date(now).toISOString(),
                    recipient: 'a@example.com',
                },
                {
                    id: 'n-2',
                    channel: 'whatsapp',
                    trigger_event: 'decision.accepted',
                    status: 'sent',
                    sent_at: new Date(now).toISOString(),
                    recipient: '+10000000000',
                },
                {
                    id: 'n-3',
                    channel: 'email',
                    trigger_event: 'invited.reviewer',
                    status: 'failed',
                    sent_at: new Date(now).toISOString(),
                    recipient: 'r@example.com',
                    error_message: 'temporary bounce',
                },
            ],
        });

        await act(async () => {
            root.render(<NotificationBell />);
        });
        await flush();

        const button = container.querySelector('button');
        expect(button).not.toBeNull();
        // The trigger's aria-label is the authoritative unread count for
        // assistive tech; asserting it avoids matching the "3 recent"
        // chip inside the popover (which is hidden while closed anyway).
        expect(button!.getAttribute('aria-label')).toBe('Notifications — 3 unread');
        // The visible badge span sits inside the button and carries "3".
        expect(button!.textContent).toContain('3');
    });
});
