import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

jest.mock('../../components/layout/Header', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../components/layout/Footer', () => ({
    __esModule: true,
    default: () => null,
}));
// SEO writes to <head> but returns no DOM — stubbing it keeps the test
// output focused on the hero block.
jest.mock('../../components/common/SEO', () => ({
    __esModule: true,
    default: () => null,
}));

// The board API is mocked as bare jest.fns; the test sets the payload
// with mockResolvedValueOnce. The two label constants the page reads
// synchronously (CATEGORY_LABELS, CATEGORY_ORDER) are also stubbed.
jest.mock('../../api/board', () => ({
    __esModule: true,
    fetchBoardMember: jest.fn(),
    fetchBoardMembers: jest.fn(),
    createBoardMember: jest.fn(),
    updateBoardMember: jest.fn(),
    deleteBoardMember: jest.fn(),
    CATEGORY_LABELS: {
        editor_in_chief: 'Editor-in-Chief',
        associate_editor: 'Associate Editors',
        managing_editor: 'Managing Editor',
        section_editor: 'Section Editors',
        board_member: 'Editorial Board Members',
        advisory: 'Advisory Board',
        technical: 'Technical / Production Team',
    },
    CATEGORY_ORDER: [],
}));

import { fetchBoardMember } from '../../api/board';
import EditorialBoardMemberPage from '../EditorialBoardMemberPage';

const mockedFetch = fetchBoardMember as jest.Mock;

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

describe('<EditorialBoardMemberPage />', () => {
    test('renders the mocked member name and role after the effect resolves', async () => {
        mockedFetch.mockResolvedValueOnce({
            id: 1,
            name: 'Prof. Jane Doe',
            role: 'Editor-in-Chief',
            category: 'editor_in_chief',
            affiliation: 'University of Testing',
            department: null,
            country: null,
            email: null,
            orcid: null,
            scholar_url: null,
            scopus_id: null,
            institutional_profile_url: null,
            qualifications: null,
            bio: null,
            expertise: null,
            photo_url: null,
            sort_order: 0,
            is_active: true,
        });

        await act(async () => {
            root.render(
                <MemoryRouter initialEntries={['/editorial-board/1']}>
                    <Routes>
                        <Route
                            path="/editorial-board/:memberId"
                            element={<EditorialBoardMemberPage />}
                        />
                    </Routes>
                </MemoryRouter>,
            );
        });
        // Flush fetchBoardMember + the setState that lifts the member
        // into view.
        await act(async () => {});

        expect(container.textContent || '').toMatch(/prof\.\s*jane doe/i);
        expect(container.textContent || '').toMatch(/editor-in-chief/i);
    });
});
