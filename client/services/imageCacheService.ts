import * as ExpoFileSystem from 'expo-file-system';
import { getDatabase } from './database';
import { API_URL } from '@/constants/config';
import { authService } from './authService';

// Use cacheDirectory from expo-file-system (legacy API)
const getCacheDirectory = () => {
                    // expo-file-system exports cacheDirectory as a property
                    return (ExpoFileSystem as any).cacheDirectory || '';
};

const getImageCacheDir = () => `${getCacheDirectory()}image_cache/`;

/**
 * Image cache service for offline viewing
 * Automatically caches images when viewed and provides cached paths for offline access
 */
export const imageCacheService = {
                    /**
                     * Initialize cache directory
                     */
                    async init(): Promise<void> {
                                        const cacheDir = getImageCacheDir();
                                        const dirInfo = await ExpoFileSystem.getInfoAsync(cacheDir);
                                        if (!dirInfo.exists) {
                                                            await ExpoFileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
                                        }
                    },

                    /**
                     * Get the cache file path for an image
                     */
                    getCacheFilePath(imageId: number): string {
                                        return `${getImageCacheDir()}image_${imageId}.jpg`;
                    },

                    /**
                     * Check if an image is cached
                     */
                    async isCached(imageId: number): Promise<boolean> {
                                        const path = this.getCacheFilePath(imageId);
                                        const info = await ExpoFileSystem.getInfoAsync(path);
                                        return info.exists;
                    },

                    /**
                     * Cache an image from server
                     * Downloads the image and stores it locally
                     */
                    async cacheImage(imageId: number): Promise<string | null> {
                                        try {
                                                            await this.init();

                                                            const token = await authService.getStoredToken();
                                                            if (!token) {
                                                                                console.log('No token available for caching');
                                                                                return null;
                                                            }

                                                            const downloadUrl = `${API_URL}/images/${imageId}/file`;
                                                            const localPath = this.getCacheFilePath(imageId);

                                                            // Download the image
                                                            const downloadResult = await ExpoFileSystem.downloadAsync(
                                                                                downloadUrl,
                                                                                localPath,
                                                                                {
                                                                                                    headers: {
                                                                                                                        Authorization: `Bearer ${token}`,
                                                                                                    },
                                                                                }
                                                            );

                                                            if (downloadResult.status === 200) {
                                                                                // Update database with cached path
                                                                                await this.updateCachedPath(imageId, localPath);
                                                                                console.log(`Image ${imageId} cached successfully`);
                                                                                return localPath;
                                                            } else {
                                                                                console.log(`Failed to cache image ${imageId}: HTTP ${downloadResult.status}`);
                                                                                return null;
                                                            }
                                        } catch (error) {
                                                            console.error(`Error caching image ${imageId}:`, error);
                                                            return null;
                                        }
                    },

                    /**
                     * Get cached image path or cache it if not available
                     * Returns server URL if caching fails
                     */
                    async getCachedImagePath(imageId: number): Promise<string> {
                                        const isCached = await this.isCached(imageId);
                                        if (isCached) {
                                                            return this.getCacheFilePath(imageId);
                                        }

                                        // Try to cache the image
                                        const cachedPath = await this.cacheImage(imageId);
                                        if (cachedPath) {
                                                            return cachedPath;
                                        }

                                        // Return server URL as fallback
                                        return `${API_URL}/images/${imageId}/file`;
                    },

                    /**
                     * Get image URI for display (offline-aware)
                     * Returns cached path if available and offline, otherwise server URL
                     */
                    async getImageUri(imageId: number, isOnline: boolean): Promise<{ uri: string; isLocal: boolean }> {
                                        const localPath = this.getCacheFilePath(imageId);
                                        const isCached = await this.isCached(imageId);

                                        if (isCached) {
                                                            // If cached, use local path (works offline)
                                                            return { uri: localPath, isLocal: true };
                                        }

                                        if (isOnline) {
                                                            // Online and not cached - cache it in background
                                                            this.cacheImage(imageId).catch(console.error);
                                                            return { uri: `${API_URL}/images/${imageId}/file`, isLocal: false };
                                        }

                                        // Offline and not cached - cannot display
                                        return { uri: '', isLocal: false };
                    },

                    /**
                     * Update the cached file path in database
                     */
                    async updateCachedPath(imageId: number, cachedPath: string): Promise<void> {
                                        const db = await getDatabase();
                                        await db.runAsync(
                                                            'UPDATE images SET cached_file_path = ? WHERE server_id = ?',
                                                            [cachedPath, imageId]
                                        );
                    },

                    /**
                     * Clear cache for specific image
                     */
                    async clearImageCache(imageId: number): Promise<void> {
                                        const path = this.getCacheFilePath(imageId);
                                        const info = await ExpoFileSystem.getInfoAsync(path);
                                        if (info.exists) {
                                                            await ExpoFileSystem.deleteAsync(path);
                                        }

                                        // Update database
                                        const db = await getDatabase();
                                        await db.runAsync(
                                                            'UPDATE images SET cached_file_path = NULL WHERE server_id = ?',
                                                            [imageId]
                                        );
                    },

                    /**
                     * Clear all cached images
                     */
                    async clearAllCache(): Promise<void> {
                                        const cacheDir = getImageCacheDir();
                                        const dirInfo = await ExpoFileSystem.getInfoAsync(cacheDir);
                                        if (dirInfo.exists) {
                                                            await ExpoFileSystem.deleteAsync(cacheDir, { idempotent: true });
                                                            await this.init(); // Recreate directory
                                        }

                                        // Update database
                                        const db = await getDatabase();
                                        await db.runAsync('UPDATE images SET cached_file_path = NULL');
                    },

                    /**
                     * Get total cache size in bytes
                     */
                    async getCacheSize(): Promise<number> {
                                        try {
                                                            const cacheDir = getImageCacheDir();
                                                            const dirInfo = await ExpoFileSystem.getInfoAsync(cacheDir);
                                                            if (!dirInfo.exists) return 0;

                                                            const files = await ExpoFileSystem.readDirectoryAsync(cacheDir);
                                                            let totalSize = 0;

                                                            for (const file of files) {
                                                                                const fileInfo = await ExpoFileSystem.getInfoAsync(`${cacheDir}${file}`);
                                                                                if (fileInfo.exists && 'size' in fileInfo) {
                                                                                                    totalSize += (fileInfo as any).size || 0;
                                                                                }
                                                            }

                                                            return totalSize;
                                        } catch (error) {
                                                            console.error('Error getting cache size:', error);
                                                            return 0;
                                        }
                    },

                    /**
                     * Get formatted cache size string
                     */
                    async getFormattedCacheSize(): Promise<string> {
                                        const bytes = await this.getCacheSize();
                                        if (bytes < 1024) return `${bytes} B`;
                                        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                                        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
                    },
};
