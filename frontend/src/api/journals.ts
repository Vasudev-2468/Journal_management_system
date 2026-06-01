import axios from 'axios';
import { Journal } from '../types';

const API_URL = '/api/journals';

// TODO: Implement function to fetch all journals
export const fetchJournals = async (): Promise<Journal[]> => {
    try {
        const response = await axios.get(API_URL);
        return response.data;
    } catch (error) {
        console.error('Error fetching journals:', error);
        throw error;
    }
};

// TODO: Implement function to fetch a single journal by ID
export const fetchJournalById = async (id: string): Promise<Journal> => {
    try {
        const response = await axios.get(`${API_URL}/${id}`);
        return response.data;
    } catch (error) {
        console.error(`Error fetching journal with ID ${id}:`, error);
        throw error;
    }
};

// TODO: Implement function to create a new journal
export const createJournal = async (journalData: Omit<Journal, 'id'>): Promise<Journal> => {
    try {
        const response = await axios.post(API_URL, journalData);
        return response.data;
    } catch (error) {
        console.error('Error creating journal:', error);
        throw error;
    }
};

// TODO: Implement function to update an existing journal
export const updateJournal = async (id: string, journalData: Journal): Promise<Journal> => {
    try {
        const response = await axios.put(`${API_URL}/${id}`, journalData);
        return response.data;
    } catch (error) {
        console.error(`Error updating journal with ID ${id}:`, error);
        throw error;
    }
};

// TODO: Implement function to delete a journal
export const deleteJournal = async (id: string): Promise<void> => {
    try {
        await axios.delete(`${API_URL}/${id}`);
    } catch (error) {
        console.error(`Error deleting journal with ID ${id}:`, error);
        throw error;
    }
};