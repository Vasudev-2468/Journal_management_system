import client from './client';

export interface PolicySection {
    id: string;
    title: string;
    content: string[];
}

export interface PolicyPage {
    id: number;
    slug: string;
    title: string;
    subtitle: string | null;
    body: PolicySection[];
    footer_note: string | null;
    version: number;
    is_published: boolean;
    last_reviewed_at: string | null;
    updated_at: string;
}

const BASE = '/policies';

export const fetchPolicies = async (): Promise<PolicyPage[]> => {
    const response = await client.get(`${BASE}/`);
    return response.data;
};

export const fetchPolicy = async (slug: string): Promise<PolicyPage> => {
    const response = await client.get(`${BASE}/${slug}`);
    return response.data;
};

export const createPolicy = async (payload: {
    slug: string;
    title: string;
    subtitle?: string;
    body?: PolicySection[];
    footer_note?: string;
    is_published?: boolean;
}): Promise<PolicyPage> => {
    const response = await client.post(`${BASE}/`, payload);
    return response.data;
};

export const updatePolicy = async (
    slug: string,
    payload: Partial<Omit<PolicyPage, 'id' | 'slug' | 'version' | 'last_reviewed_at' | 'updated_at'>>,
): Promise<PolicyPage> => {
    const response = await client.patch(`${BASE}/${slug}`, payload);
    return response.data;
};

export const deletePolicy = async (slug: string): Promise<void> => {
    await client.delete(`${BASE}/${slug}`);
};
