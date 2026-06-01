import React, { createContext, useContext, useState, useEffect } from 'react';
import { getUser, login, logout } from '../api/auth'; // TODO: Implement API calls for authentication

interface AuthContextType {
  user: any; // TODO: Define a proper user type
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null); // TODO: Define a proper user type

  useEffect(() => {
    const fetchUser = async () => {
      const fetchedUser = await getUser(); // TODO: Handle errors and loading state
      setUser(fetchedUser);
    };

    fetchUser();
  }, []);

  const handleLogin = async (username: string, password: string) => {
    const loggedInUser = await login(username, password); // TODO: Handle errors
    setUser(loggedInUser);
  };

  const handleLogout = () => {
    logout(); // TODO: Handle errors
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login: handleLogin, logout: handleLogout }}>
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