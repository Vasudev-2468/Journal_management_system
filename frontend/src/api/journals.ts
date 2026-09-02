import client from './client';
import { Journal } from '../types';

// Backend routes are mounted at /journals (not /api/journals) — see
// backend/app/main.py. All requests go through the shared axios client so
// that the base URL and auth header handling stay consistent.

const BASE = '/journals';

export const fetchJournals = async (): Promise<Journal[]> => {
    const response = await client.get(`${BASE}/`);
    // Backend now wraps the list in {journals: [...]}. Older callers
    // received a bare array, so accept either shape.
    if (Array.isArray(response.data)) return response.data;
    return response.data?.journals ?? [];
};

export const activateJournal = async (id: number): Promise<Journal> => {
    const response = await client.post(`${BASE}/${id}/activate`);
    return response.data;
};

export interface TenancyHealthReport {
    generated_at: string;
    invariants: Array<{ severity: 'critical' | 'warning' | 'info'; message: string }>;
    journals: Array<{
        id: number;
        title: string;
        is_active: boolean;
        completeness: number;
        missing_fields: string[];
    }>;
}

export const fetchTenancyHealth = async (): Promise<TenancyHealthReport> => {
    const response = await client.get(`${BASE}/agent/tenancy-health`);
    return response.data;
};

export const fetchJournalById = async (id: string): Promise<Journal> => {
    const response = await client.get(`${BASE}/${id}`);
    return response.data;
};

export const createJournal = async (journalData: Omit<Journal, 'id'>): Promise<Journal> => {
    const response = await client.post(`${BASE}/`, journalData);
    return response.data;
};

export const updateJournal = async (id: string, journalData: Journal): Promise<Journal> => {
    const response = await client.put(`${BASE}/${id}`, journalData);
    return response.data;
};

export const deleteJournal = async (id: string): Promise<void> => {
    await client.delete(`${BASE}/${id}`);
};
