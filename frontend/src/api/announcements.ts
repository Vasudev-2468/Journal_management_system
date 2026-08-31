import client from './client';

export type AnnouncementKind = 'news' | 'cfp' | 'update';

export interface Announcement {
    id: number;
    title: string;
    body: string;
    kind: AnnouncementKind;
    link_url: string | null;
    is_published: boolean;
    published_at: string;
    expires_at: string | null;
}

const BASE = '/announcements';

export const fetchAnnouncements = async (params?: {
    include_unpublished?: boolean;
    kind?: AnnouncementKind;
    limit?: number;
}): Promise<Announcement[]> => {
    const response = await client.get(`${BASE}/`, { params });
    return response.data;
};

export const createAnnouncement = async (payload: {
    title: string;
    body: string;
    kind?: AnnouncementKind;
    link_url?: string;
    is_published?: boolean;
    expires_at?: string;
}): Promise<Announcement> => {
    const response = await client.post(`${BASE}/`, payload);
    return response.data;
};

export const updateAnnouncement = async (
    id: number,
    payload: Partial<Omit<Announcement, 'id' | 'published_at'>>,
): Promise<Announcement> => {
    const response = await client.patch(`${BASE}/${id}`, payload);
    return response.data;
};

export const deleteAnnouncement = async (id: number): Promise<void> => {
    await client.delete(`${BASE}/${id}`);
};
