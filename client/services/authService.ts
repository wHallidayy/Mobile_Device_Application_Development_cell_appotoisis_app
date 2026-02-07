import api, { ApiResponse } from './api';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface RegisterRequest {
                    username: string;
                    password: string;
}

export interface RegisterResponse {
                    user_id: string;
                    username: string;
                    created_at: string;
}

export interface LoginRequest {
                    username: string;
                    password: string;
}

export interface LoginResponse {
                    access_token: string;
                    refresh_token: string;
                    expires_in: number;
                    user: {
                                        user_id: string;
                                        username: string;
                    };
}

export interface LogoutResponse {
                    message: string;
}

// Storage helper functions to handle both web and native
const storage = {
                    async setItem(key: string, value: string): Promise<void> {
                                        if (Platform.OS === 'web') {
                                                            localStorage.setItem(key, value);
                                        } else {
                                                            await SecureStore.setItemAsync(key, value);
                                        }
                    },
                    async getItem(key: string): Promise<string | null> {
                                        if (Platform.OS === 'web') {
                                                            return localStorage.getItem(key);
                                        } else {
                                                            return await SecureStore.getItemAsync(key);
                                        }
                    },
                    async removeItem(key: string): Promise<void> {
                                        if (Platform.OS === 'web') {
                                                            localStorage.removeItem(key);
                                        } else {
                                                            await SecureStore.deleteItemAsync(key);
                                        }
                    },
};

export const authService = {
                    async register(data: RegisterRequest): Promise<RegisterResponse> {
                                        const response = await api.post<ApiResponse<RegisterResponse>>('/auth/register', data);
                                        return response.data.data!;
                    },

                    async login(data: LoginRequest): Promise<LoginResponse> {
                                        console.log('authService.login: Starting login request...');
                                        const response = await api.post<ApiResponse<LoginResponse>>('/auth/login', data);
                                        console.log('authService.login: Received response', response.data);

                                        const { access_token, refresh_token, user } = response.data.data!;

                                        // Store token securely
                                        console.log('authService.login: Storing access_token...');
                                        await storage.setItem('access_token', access_token);

                                        // Store refresh token
                                        console.log('authService.login: Storing refresh_token...');
                                        await storage.setItem('refresh_token', refresh_token);

                                        // Store user info
                                        console.log('authService.login: Storing user_info...');
                                        await storage.setItem('user_info', JSON.stringify(user));

                                        console.log('authService.login: All data stored successfully');
                                        return response.data.data!;
                    },

                    async logout(): Promise<void> {
                                        try {
                                                            await api.post<ApiResponse<LogoutResponse>>('/auth/logout');
                                        } finally {
                                                            // Always clear token even if request fails
                                                            await storage.removeItem('access_token');
                                                            await storage.removeItem('refresh_token');
                                                            await storage.removeItem('user_info');
                                        }
                    },

                    async getStoredToken(): Promise<string | null> {
                                        return await storage.getItem('access_token');
                    },

                    async getStoredUser(): Promise<any | null> {
                                        const userStr = await storage.getItem('user_info');
                                        return userStr ? JSON.parse(userStr) : null;
                    },

                    async isAuthenticated(): Promise<boolean> {
                                        const token = await storage.getItem('access_token');
                                        return !!token;
                    },
};
