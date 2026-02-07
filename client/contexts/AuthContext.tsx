import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authService, LoginResponse } from '@/services/authService';

interface User {
                    user_id: string;
                    username: string;
}

interface AuthContextType {
                    user: User | null;
                    isLoading: boolean;
                    isAuthenticated: boolean;
                    login: (username: string, password: string) => Promise<void>;
                    register: (username: string, password: string) => Promise<void>;
                    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
                    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
                    const [user, setUser] = useState<User | null>(null);
                    const [isLoading, setIsLoading] = useState(true);

                    useEffect(() => {
                                        // Check if user is already authenticated
                                        checkAuthStatus();
                    }, []);

                    const checkAuthStatus = async () => {
                                        try {
                                                            const token = await authService.getStoredToken();
                                                            const storedUser = await authService.getStoredUser();

                                                            if (token && storedUser) {
                                                                                setUser(storedUser);
                                                            } else {
                                                                                setUser(null);
                                                            }
                                        } catch (error) {
                                                            console.error('Auth check error:', error);
                                                            setUser(null);
                                        } finally {
                                                            setIsLoading(false);
                                        }
                    };

                    const login = async (username: string, password: string) => {
                                        setIsLoading(true);
                                        try {
                                                            console.log('AuthContext: Calling authService.login...');
                                                            const response = await authService.login({ username, password });
                                                            console.log('AuthContext: Login successful, setting user:', response.user);
                                                            setUser(response.user);
                                                            console.log('AuthContext: User state updated');
                                        } catch (error) {
                                                            console.error('AuthContext: Login error:', error);
                                                            throw error;
                                        } finally {
                                                            setIsLoading(false);
                                        }
                    };

                    const register = async (username: string, password: string) => {
                                        setIsLoading(true);
                                        try {
                                                            await authService.register({ username, password });
                                                            // After registration, login automatically
                                                            await login(username, password);
                                        } finally {
                                                            setIsLoading(false);
                                        }
                    };

                    const logout = async () => {
                                        setIsLoading(true);
                                        try {
                                                            await authService.logout();
                                                            setUser(null);
                                        } finally {
                                                            setIsLoading(false);
                                        }
                    };

                    return (
                                        <AuthContext.Provider
                                                            value={{
                                                                                user,
                                                                                isLoading,
                                                                                isAuthenticated: !!user,
                                                                                login,
                                                                                register,
                                                                                logout,
                                                            }}
                                        >
                                                            {children}
                                        </AuthContext.Provider>
                    );
}

export function useAuth() {
                    const context = useContext(AuthContext);
                    if (context === undefined) {
                                        throw new Error('useAuth must be used within an AuthProvider');
                    }
                    return context;
}
