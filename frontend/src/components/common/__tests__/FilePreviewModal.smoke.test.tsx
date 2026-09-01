import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

import FilePreviewModal from '../FilePreviewModal';

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

describe('<FilePreviewModal />', () => {
    test('renders the filename in the dialog header', () => {
        act(() => {
            root.render(
                <FilePreviewModal
                    url="https://example.test/paper.pdf"
                    filename="paper.pdf"
                    mimeType="application/pdf"
                    onClose={() => {}}
                />,
            );
        });
        // The header's <h2> carries id="file-preview-title" — asserting
        // both the element and its text keeps a rename honest.
        const h2 = container.querySelector('#file-preview-title');
        expect(h2).not.toBeNull();
        expect(h2!.textContent).toBe('paper.pdf');
    });

    test('clicking the Close button fires the onClose prop', () => {
        const onClose = jest.fn();
        act(() => {
            root.render(
                <FilePreviewModal
                    url="https://example.test/paper.pdf"
                    filename="paper.pdf"
                    mimeType="application/pdf"
                    onClose={onClose}
                />,
            );
        });
        // The close control is the only <button aria-label="Close preview">
        // in the dialog. Fire a bubbling click so React's synthetic
        // handler picks it up through delegation.
        const closeBtn = container.querySelector<HTMLButtonElement>(
            'button[aria-label="Close preview"]',
        );
        expect(closeBtn).not.toBeNull();
        act(() => {
            closeBtn!.dispatchEvent(
                new MouseEvent('click', { bubbles: true }),
            );
        });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
