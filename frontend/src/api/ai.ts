import axios from 'axios';

// TODO: Set the base URL for the API
const API_BASE_URL = 'http://localhost:8000/api'; // Update with your backend URL

// Function to get AI analysis results
export const getAIAnalysis = async (data: any) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/ai/analysis`, data);
        return response.data;
    } catch (error) {
        console.error('Error fetching AI analysis:', error);
        throw error; // TODO: Handle error appropriately
    }
};

// Function to get AI-generated summaries
export const getAISummary = async (articleId?: any) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/ai/summary/${articleId}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching AI summary:', error);
        throw error; // TODO: Handle error appropriately
    }
};

// Function to check for plagiarism
export const checkPlagiarism = async (articleText: any) => {
    try {
        const response = await axios.post(`${API_BASE_URL}/ai/plagiarism`, { text: articleText });
        return response.data;
    } catch (error) {
        console.error('Error checking plagiarism:', error);
        throw error; // TODO: Handle error appropriately
    }
};

// Function to get recommendations based on AI analysis
export const getAIRecommendations = async (articleId?: any) => {
    try {
        const response = await axios.get(`${API_BASE_URL}/ai/recommendations/${articleId}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching AI recommendations:', error);
        throw error; // TODO: Handle error appropriately
    }
};