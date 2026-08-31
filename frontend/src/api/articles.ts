import client from './client';
import { Article } from '../types';

const BASE = '/articles';

export const fetchArticles = async (): Promise<Article[]> => {
    const response = await client.get(`${BASE}/`);
    return response.data;
};

export const fetchArticleById = async (id: string): Promise<Article> => {
    const response = await client.get(`${BASE}/${id}`);
    return response.data;
};

export const createArticle = async (articleData: Omit<Article, 'id'>): Promise<Article> => {
    const response = await client.post(`${BASE}/`, articleData);
    return response.data;
};

export const updateArticle = async (id: string, articleData: Article): Promise<Article> => {
    const response = await client.put(`${BASE}/${id}`, articleData);
    return response.data;
};

export const deleteArticle = async (id: string): Promise<void> => {
    await client.delete(`${BASE}/${id}`);
};
