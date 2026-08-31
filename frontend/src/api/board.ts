import client from './client';

export type BoardCategory =
    | 'editor_in_chief'
    | 'associate_editor'
    | 'managing_editor'
    | 'section_editor'
    | 'board_member'
    | 'advisory'
    | 'technical';

export interface BoardMember {
    id: number;
    name: string;
    role: string;
    category: BoardCategory;
    affiliation: string | null;
    department: string | null;
    country: string | null;
    email: string | null;
    orcid: string | null;
    scholar_url: string | null;
    scopus_id: string | null;
    institutional_profile_url: string | null;
    qualifications: string | null;
    bio: string | null;
    expertise: string | null;
    photo_url: string | null;
    sort_order: number;
    is_active: boolean;
}

export const CATEGORY_LABELS: Record<BoardCategory, string> = {
    editor_in_chief: 'Editor-in-Chief',
    associate_editor: 'Associate Editors',
    managing_editor: 'Managing Editor',
    section_editor: 'Section Editors',
    board_member: 'Editorial Board Members',
    advisory: 'Advisory Board',
    technical: 'Technical / Production Team',
};

export const CATEGORY_ORDER: BoardCategory[] = [
    'editor_in_chief',
    'associate_editor',
    'managing_editor',
    'section_editor',
    'board_member',
    'advisory',
    'technical',
];

const BASE = '/board';

export const fetchBoardMembers = async (
    include_inactive = false,
    category?: BoardCategory,
): Promise<BoardMember[]> => {
    const params: Record<string, unknown> = { include_inactive };
    if (category) params.category = category;
    const response = await client.get(`${BASE}/`, { params });
    return response.data;
};

export const fetchBoardMember = async (id: number | string): Promise<BoardMember> => {
    const response = await client.get(`${BASE}/${id}`);
    return response.data;
};

export const createBoardMember = async (
    payload: Omit<BoardMember, 'id'>,
): Promise<BoardMember> => {
    const response = await client.post(`${BASE}/`, payload);
    return response.data;
};

export const updateBoardMember = async (
    id: number,
    payload: Partial<Omit<BoardMember, 'id'>>,
): Promise<BoardMember> => {
    const response = await client.patch(`${BASE}/${id}`, payload);
    return response.data;
};

export const deleteBoardMember = async (id: number): Promise<void> => {
    await client.delete(`${BASE}/${id}`);
};
