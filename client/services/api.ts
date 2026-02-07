import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { API_URL } from '@/constants/config';

// Storage helper for cross-platform support
const getStoredToken = async (): Promise<string | null> => {
                    if (Platform.OS === 'web') {
                                        return localStorage.getItem('access_token');
                    } else {
                                        return await SecureStore.getItemAsync('access_token');
                    }
};

const removeStoredToken = async (): Promise<void> => {
                    if (Platform.OS === 'web') {
                                        localStorage.removeItem('access_token');
                    } else {
                                        await SecureStore.deleteItemAsync('access_token');
                    }
};

// Create axios instance
const api = axios.create({
                    baseURL: API_URL,
                    timeout: 30000,
                    headers: {
                                        'Content-Type': 'application/json',
                                        'ngrok-skip-browser-warning': 'true',
                    },
});

// Request interceptor - add auth token
api.interceptors.request.use(
                    async (config: InternalAxiosRequestConfig) => {
                                        try {
                                                            const token = await getStoredToken();
                                                            if (token && config.headers) {
                                                                                config.headers.Authorization = `Bearer ${token}`;
                                                            }
                                        } catch (error) {
                                                            console.error('Error getting token:', error);
                                        }
                                        return config;
                    },
                    (error) => Promise.reject(error)
);

// Response interceptor - handle errors
api.interceptors.response.use(
                    (response) => response,
                    async (error: AxiosError) => {
                                        if (error.response?.status === 401) {
                                                            // Token expired or invalid - clear stored token
                                                            await removeStoredToken();
                                                            // TODO: Redirect to login
                                        }
                                        return Promise.reject(error);
                    }
);

export default api;

// Helper types
export interface ApiError {
                    code: string;
                    message: string;
}

export interface ApiResponse<T> {
                    success: boolean;
                    data?: T;
                    error?: ApiError;
}
