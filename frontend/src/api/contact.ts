import client from './client';

export interface ContactMessage {
    id: number;
    name: string;
    email: string;
    subject: string;
    message: string;
    is_read: boolean;
    resolved: boolean;
    created_at: string;
}

const BASE = '/contact';

export const submitContactMessage = async (payload: {
    name: string;
    email: string;
    subject: string;
    message: string;
}): Promise<ContactMessage> => {
    const response = await client.post(`${BASE}/`, payload);
    return response.data;
};

export const fetchContactMessages = async (params?: {
    unread_only?: boolean;
    resolved?: boolean;
}): Promise<ContactMessage[]> => {
    const response = await client.get(`${BASE}/`, { params });
    return response.data;
};

export const updateContactMessage = async (
    id: number,
    payload: Partial<Pick<ContactMessage, 'is_read' | 'resolved'>>,
): Promise<ContactMessage> => {
    const response = await client.patch(`${BASE}/${id}`, payload);
    return response.data;
};

export const deleteContactMessage = async (id: number): Promise<void> => {
    await client.delete(`${BASE}/${id}`);
};
