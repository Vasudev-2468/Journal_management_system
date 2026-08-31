import client from './client';
import { Journal } from '../types';

// Backend routes are mounted at /journals (not /api/journals) — see
// backend/app/main.py. All requests go through the shared axios client so
// that the base URL and auth header handling stay consistent.

const BASE = '/journals';

export const fetchJournals = async (): Promise<Journal[]> => {
    const response = await client.get(`${BASE}/`);
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
