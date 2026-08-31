import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import DecisionLetterCard from '../DecisionLetterCard';

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

describe('<DecisionLetterCard />', () => {
    test('renders the acceptance letter template when status="accepted"', () => {
        act(() => {
            root.render(
                <DecisionLetterCard
                    submissionId="00000000-0000-0000-0000-000000000001"
                    status="accepted"
                    authorName="Ada Lovelace"
                    paperTitle="On the Analytical Engine"
                    paperIdCode="JG-2026-001"
                />,
            );
        });
        // The section landmark + the accepted-pill are the twin tells of
        // the template selection; the wrong branch would render "Rejected"
        // or "Revision Requested" or return null.
        const region = container.querySelector('section[aria-label="Decision letter"]');
        expect(region).not.toBeNull();
        expect(container.textContent).toContain('Accepted');
        expect(container.textContent).toContain('Manuscript accepted — JG-2026-001');
    });

    test('substitutes {{author_name}} and {{paper_title}} into the body', () => {
        act(() => {
            root.render(
                <DecisionLetterCard
                    submissionId="00000000-0000-0000-0000-000000000002"
                    status="accepted"
                    authorName="Grace Hopper"
                    paperTitle="Compilers Considered Harmless"
                    paperIdCode="JG-2026-002"
                />,
            );
        });
        // Substring matches over the whole text — the body sits in one
        // <pre> so this catches the mustache-style interpolation on both
        // variables without pinning to internal element structure.
        expect(container.textContent).toContain('Dear Grace Hopper');
        expect(container.textContent).toContain('"Compilers Considered Harmless"');
    });

    test('renders nothing when status is not a decision state', () => {
        act(() => {
            root.render(
                <DecisionLetterCard
                    submissionId="00000000-0000-0000-0000-000000000003"
                    status="in_review"
                    authorName="Ada"
                    paperTitle="Any"
                />,
            );
        });
        expect(container.innerHTML).toBe('');
    });
});
