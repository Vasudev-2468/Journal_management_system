import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

jest.mock('../../components/layout/Header', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../components/layout/Footer', () => ({
    __esModule: true,
    default: () => null,
}));
jest.mock('../../components/common/SEO', () => ({
    __esModule: true,
    default: () => null,
}));

// Bare jest.fn() shells — the test sets the resolved profile with
// mockResolvedValueOnce. The absence of profile_picture_url in the
// payload flips the primary button label to "Upload photo" (rather
// than "Replace photo"), which is what the assertion looks for.
jest.mock('../../api/authorProfile', () => ({
    __esModule: true,
    getProfile: jest.fn(),
    uploadPicture: jest.fn(),
    removePicture: jest.fn(),
}));

import { getProfile } from '../../api/authorProfile';
import AuthorProfileEditPage from '../AuthorProfileEditPage';

const mockedGetProfile = getProfile as jest.Mock;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    mockedGetProfile.mockReset();
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

describe('<AuthorProfileEditPage />', () => {
    test('renders the "Upload photo" button once the profile loads', async () => {
        mockedGetProfile.mockResolvedValueOnce({
            id: 1,
            username: 'jdoe',
            email: 'jane@example.edu',
            full_name: 'Jane Doe',
            first_name: 'Jane',
            last_name: 'Doe',
            role: 'author',
            whatsapp_number: null,
            institution: 'University of Testing',
            department: null,
            orcid: null,
            research_areas: null,
            country: null,
            bio: null,
            profile_picture_url: null,
        });

        await act(async () => {
            root.render(<AuthorProfileEditPage />);
        });
        // Flush getProfile + the setState that swaps the Loading
        // skeleton for the real card.
        await act(async () => {});

        const buttons = Array.from(
            container.querySelectorAll<HTMLButtonElement>('button'),
        );
        const upload = buttons.find((b) =>
            /upload photo/i.test(b.textContent || ''),
        );
        expect(upload).toBeDefined();
    });
});
