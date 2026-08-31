import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react';
import { getUser, login as apiLogin, logout as apiLogout } from '../api/auth';

export interface AuthUser {
    id: number | string;
    username: string;
    email?: string;
    full_name?: string;
    role?: string;
    mfa_enabled?: boolean;
}

interface AuthContextType {
    user: AuthUser | null;
    loading: boolean;
    error: string | null;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const fetchUser = async () => {
            try {
                const fetched = await getUser();
                if (!cancelled) setUser(fetched);
            } catch (err) {
                if (!cancelled) setUser(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchUser();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleLogin = useCallback(async (username: string, password: string) => {
        setError(null);
        try {
            const loggedInUser = await apiLogin(username, password);
            setUser(loggedInUser);
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Login failed. Please try again.';
            setError(message);
            throw err;
        }
    }, []);

    const handleLogout = useCallback(() => {
        try {
            apiLogout();
        } finally {
            setUser(null);
        }
    }, []);

    return (
        <AuthContext.Provider
            value={{ user, loading, error, login: handleLogin, logout: handleLogout }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
