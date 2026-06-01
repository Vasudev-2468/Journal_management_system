import axios from 'axios';

// Create an Axios instance with default settings
const client = axios.create({
    baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000',
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptors for request and response can be added here
client.interceptors.request.use(
    (config) => {
        // Only inject token if the caller didn't already set an explicit Authorization header
        if (config.headers && !config.headers.Authorization) {
            const editorToken = localStorage.getItem('editor_token');
            const authorToken = localStorage.getItem('author_token');
            const regularToken = localStorage.getItem('token');
            const token = editorToken || authorToken || regularToken;
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

client.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        // If 403 with MFA required header, redirect to editor login
        if (error.response?.status === 403 && error.response?.headers?.['x-mfa-required']) {
            localStorage.removeItem('editor_token');
            localStorage.removeItem('editor_mfa_verified');
            window.location.href = '/editor-login';
        }
        // If 401, clear tokens
        if (error.response?.status === 401) {
            const url = error.config?.url || '';
            if (url.includes('/editor-portal') || url.includes('/editor-auth')) {
                localStorage.removeItem('editor_token');
                localStorage.removeItem('editor_mfa_verified');
            }
        }
        // TODO: Handle response errors here
        return Promise.reject(error);
    }
);

export default client;