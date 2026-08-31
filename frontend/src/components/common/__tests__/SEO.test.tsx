import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import SEO from '../SEO';

// SEO renders no DOM of its own — every assertion looks at document.title
// and the <head> tags the component upserts. Even so, we spin up a real
// React root so the useEffect actually runs, mirroring how the component
// behaves in the SPA.

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
    // Strip meta tags we appended so tests don't cross-contaminate.
    document.head
        .querySelectorAll('meta[name], meta[property], link[rel="canonical"], script[data-seo="1"]')
        .forEach((el) => el.remove());
    document.title = '';
});

describe('<SEO />', () => {
    test('sets document.title from the title prop', () => {
        act(() => {
            root.render(<SEO title="Hello World" />);
        });
        expect(document.title).toBe('Hello World');
    });

    test('writes the description prop into <meta name="description">', () => {
        act(() => {
            root.render(<SEO title="Search" description="A helpful search page." />);
        });
        const meta = document.head.querySelector<HTMLMetaElement>(
            'meta[name="description"]',
        );
        expect(meta).not.toBeNull();
        expect(meta?.getAttribute('content')).toBe('A helpful search page.');
    });
});
