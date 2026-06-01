import client from './client';

export const login = async (username: string, password: string) => {
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);
    const response = await client.post('/auth/login', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const { access_token } = response.data;
    localStorage.setItem('token', access_token);
    return getUser();
};

export const getUser = async () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
        const response = await client.get('/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
        });
        return response.data;
    } catch {
        localStorage.removeItem('token');
        return null;
    }
};

export const logout = () => {
    localStorage.removeItem('token');
};
