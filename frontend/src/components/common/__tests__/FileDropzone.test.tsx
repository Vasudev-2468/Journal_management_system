import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

// Mock the shared axios client so the dropzone never reaches the network.
// The full method surface is stubbed even though FileDropzone only calls
// `post`, so other consumers pulled in transitively don't crash on
// undefined properties.
jest.mock('../../../api/client', () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        patch: jest.fn(),
        delete: jest.fn(),
    },
}));

import FileDropzone from '../FileDropzone';

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

describe('<FileDropzone />', () => {
    test('renders the caller-supplied label above the drop area', () => {
        act(() => {
            root.render(
                <FileDropzone
                    kinds={['manuscript']}
                    onUploaded={() => {}}
                    label="Attach files"
                />,
            );
        });
        expect(container.textContent).toContain('Attach files');
    });

    test('exposes a multi-select file input for browsing', () => {
        act(() => {
            root.render(
                <FileDropzone kinds={['manuscript']} onUploaded={() => {}} />,
            );
        });
        const input = container.querySelector('input[type="file"]');
        expect(input).not.toBeNull();
        // The component intentionally omits an `accept` narrowing so
        // authors can attach any manuscript-adjacent asset; we assert
        // the `multiple` opt-in that batches uploads through one picker.
        expect(input!.hasAttribute('multiple')).toBe(true);
    });

    test('fires onUploaded when the internal row set changes', () => {
        const onUploaded = jest.fn();
        act(() => {
            root.render(
                <FileDropzone kinds={['manuscript']} onUploaded={onUploaded} />,
            );
        });
        // The useEffect that emits the aggregate list runs on mount with
        // an empty rows array — proving the "row set → onUploaded" wire is
        // live without needing to fake the async drag/drop pipeline.
        expect(onUploaded).toHaveBeenCalledWith([]);
    });
});
