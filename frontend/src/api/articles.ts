import axios from 'axios';
import { Article } from '../types';

const API_URL = '/api/articles';

// Function to fetch all articles
export const fetchArticles = async (): Promise<Article[]> => {
    try {
        const response = await axios.get(API_URL);
        return response.data;
    } catch (error) {
        console.error('Error fetching articles:', error);
        throw error; // TODO: Handle error appropriately
    }
};

// Function to fetch a single article by ID
export const fetchArticleById = async (id: string): Promise<Article> => {
    try {
        const response = await axios.get(`${API_URL}/${id}`);
        return response.data;
    } catch (error) {
        console.error(`Error fetching article with ID ${id}:`, error);
        throw error; // TODO: Handle error appropriately
    }
};

// Function to create a new article
export const createArticle = async (articleData: Article): Promise<Article> => {
    try {
        const response = await axios.post(API_URL, articleData);
        return response.data;
    } catch (error) {
        console.error('Error creating article:', error);
        throw error; // TODO: Handle error appropriately
    }
};

// Function to update an existing article
export const updateArticle = async (id: string, articleData: Article): Promise<Article> => {
    try {
        const response = await axios.put(`${API_URL}/${id}`, articleData);
        return response.data;
    } catch (error) {
        console.error(`Error updating article with ID ${id}:`, error);
        throw error; // TODO: Handle error appropriately
    }
};

// Function to delete an article
export const deleteArticle = async (id: string): Promise<void> => {
    try {
        await axios.delete(`${API_URL}/${id}`);
    } catch (error) {
        console.error(`Error deleting article with ID ${id}:`, error);
        throw error; // TODO: Handle error appropriately
    }
};