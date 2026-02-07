import { getDatabase, SyncQueueItem } from './database';
import { localFolderRepository } from './localFolderRepository';
import { localImageRepository } from './localImageRepository';
import { networkService } from './networkService';
import api, { ApiResponse } from './api';
import { Folder } from './folderService';
import { Image } from './imageService';

const MAX_RETRY_COUNT = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // Exponential backoff delays

type SyncListener = (status: 'idle' | 'syncing' | 'error') => void;

class SyncService {
                    private isSyncing: boolean = false;
                    private listeners: Set<SyncListener> = new Set();
                    private networkUnsubscribe: (() => void) | null = null;

                    /**
                     * Start the sync service (listen for network changes)
                     */
                    start(): void {
                                        networkService.start();
                                        this.networkUnsubscribe = networkService.addListener((isOnline) => {
                                                            if (isOnline) {
                                                                                // Trigger sync when coming back online
                                                                                this.syncAll();
                                                            }
                                        });
                    }

                    /**
                     * Stop the sync service
                     */
                    stop(): void {
                                        if (this.networkUnsubscribe) {
                                                            this.networkUnsubscribe();
                                                            this.networkUnsubscribe = null;
                                        }
                                        networkService.stop();
                    }

                    /**
                     * Add listener for sync status changes
                     */
                    addListener(listener: SyncListener): () => void {
                                        this.listeners.add(listener);
                                        return () => this.listeners.delete(listener);
                    }

                    /**
                     * Notify listeners of sync status change
                     */
                    private notifyListeners(status: 'idle' | 'syncing' | 'error'): void {
                                        this.listeners.forEach((listener) => listener(status));
                    }

                    /**
                     * Check if currently syncing
                     */
                    getIsSyncing(): boolean {
                                        return this.isSyncing;
                    }

                    /**
                     * Add item to sync queue
                     */
                    async addToQueue(
                                        operation: SyncQueueItem['operation'],
                                        entityType: 'folder' | 'image',
                                        localId: string,
                                        payload?: object
                    ): Promise<void> {
                                        const db = await getDatabase();
                                        const now = new Date().toISOString();

                                        await db.runAsync(
                                                            `INSERT INTO sync_queue (operation, entity_type, local_id, payload, status, created_at)
             VALUES (?, ?, ?, ?, 'pending', ?)`,
                                                            [operation, entityType, localId, payload ? JSON.stringify(payload) : null, now]
                                        );

                                        // Try to sync immediately if online
                                        if (networkService.getIsOnline()) {
                                                            this.syncAll();
                                        }
                    }

                    /**
                     * Sync all pending items
                     */
                    async syncAll(): Promise<void> {
                                        if (this.isSyncing || !networkService.getIsOnline()) {
                                                            return;
                                        }

                                        this.isSyncing = true;
                                        this.notifyListeners('syncing');

                                        try {
                                                            await this.processSyncQueue();
                                                            await this.pullFromServer();
                                                            this.notifyListeners('idle');
                                        } catch (error) {
                                                            console.error('Sync error:', error);
                                                            this.notifyListeners('error');
                                        } finally {
                                                            this.isSyncing = false;
                                        }
                    }

                    /**
                     * Process sync queue (push local changes to server)
                     */
                    private async processSyncQueue(): Promise<void> {
                                        const db = await getDatabase();
                                        const pendingItems = await db.getAllAsync<SyncQueueItem>(
                                                            `SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC`
                                        );

                                        for (const item of pendingItems) {
                                                            try {
                                                                                // Mark as processing
                                                                                await db.runAsync(
                                                                                                    `UPDATE sync_queue SET status = 'processing' WHERE id = ?`,
                                                                                                    [item.id]
                                                                                );

                                                                                await this.processQueueItem(item);

                                                                                // Remove from queue on success
                                                                                await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [item.id]);
                                                            } catch (error) {
                                                                                console.error('Queue item processing error:', error);

                                                                                const newRetryCount = item.retry_count + 1;
                                                                                if (newRetryCount >= MAX_RETRY_COUNT) {
                                                                                                    // Mark as failed after max retries
                                                                                                    await db.runAsync(
                                                                                                                        `UPDATE sync_queue SET status = 'failed', retry_count = ?, error_message = ? WHERE id = ?`,
                                                                                                                        [newRetryCount, String(error), item.id]
                                                                                                    );

                                                                                                    // Mark entity as failed
                                                                                                    if (item.entity_type === 'folder') {
                                                                                                                        await localFolderRepository.markFailed(item.local_id);
                                                                                                    } else {
                                                                                                                        await localImageRepository.markFailed(item.local_id);
                                                                                                    }
                                                                                } else {
                                                                                                    // Update retry count and reset to pending
                                                                                                    await db.runAsync(
                                                                                                                        `UPDATE sync_queue SET status = 'pending', retry_count = ?, error_message = ? WHERE id = ?`,
                                                                                                                        [newRetryCount, String(error), item.id]
                                                                                                    );
                                                                                }
                                                            }
                                        }
                    }

                    /**
                     * Process individual queue item
                     */
                    private async processQueueItem(item: SyncQueueItem): Promise<void> {
                                        const payload = item.payload ? JSON.parse(item.payload) : {};

                                        switch (item.operation) {
                                                            case 'create_folder': {
                                                                                const folder = await localFolderRepository.getFolderByLocalId(item.local_id);
                                                                                if (!folder) throw new Error('Folder not found');

                                                                                const response = await api.post<ApiResponse<Folder>>('/folders', {
                                                                                                    folder_name: folder.folder_name,
                                                                                });
                                                                                await localFolderRepository.markSynced(item.local_id, response.data.data!.folder_id);
                                                                                break;
                                                            }

                                                            case 'rename_folder': {
                                                                                const folder = await localFolderRepository.getFolderByLocalId(item.local_id);
                                                                                if (!folder || !folder.server_id) throw new Error('Folder not found or not synced');

                                                                                await api.patch<ApiResponse<Folder>>(`/folders/${folder.server_id}`, {
                                                                                                    folder_name: folder.folder_name,
                                                                                });
                                                                                await localFolderRepository.markSynced(item.local_id, folder.server_id);
                                                                                break;
                                                            }

                                                            case 'delete_folder': {
                                                                                const folder = await localFolderRepository.getFolderByLocalId(item.local_id);
                                                                                if (!folder) throw new Error('Folder not found');

                                                                                if (folder.server_id) {
                                                                                                    await api.delete(`/folders/${folder.server_id}`);
                                                                                }
                                                                                await localFolderRepository.markSynced(item.local_id, folder.server_id ?? 0);
                                                                                break;
                                                            }

                                                            case 'upload_image': {
                                                                                const image = await localImageRepository.getImageByLocalId(item.local_id);
                                                                                if (!image || !image.local_uri) throw new Error('Image not found or no local URI');

                                                                                // Need folder server ID to upload
                                                                                let folderServerId = image.folder_server_id;
                                                                                if (!folderServerId) {
                                                                                                    const folder = await localFolderRepository.getFolderByLocalId(image.folder_local_id);
                                                                                                    folderServerId = folder?.server_id ?? null;
                                                                                }
                                                                                if (!folderServerId) throw new Error('Folder not synced yet');

                                                                                const formData = new FormData();
                                                                                formData.append('file', {
                                                                                                    uri: image.local_uri,
                                                                                                    name: image.original_filename,
                                                                                                    type: image.mime_type,
                                                                                } as any);

                                                                                const response = await api.post<ApiResponse<Image>>(
                                                                                                    `/folders/${folderServerId}/images`,
                                                                                                    formData,
                                                                                                    { headers: { 'Content-Type': 'multipart/form-data' } }
                                                                                );
                                                                                await localImageRepository.markSynced(item.local_id, response.data.data!.image_id);
                                                                                break;
                                                            }

                                                            case 'rename_image': {
                                                                                const image = await localImageRepository.getImageByLocalId(item.local_id);
                                                                                if (!image || !image.server_id) throw new Error('Image not found or not synced');

                                                                                await api.patch<ApiResponse<Image>>(`/images/${image.server_id}`, {
                                                                                                    new_filename: image.original_filename,
                                                                                });
                                                                                await localImageRepository.markSynced(item.local_id, image.server_id);
                                                                                break;
                                                            }

                                                            case 'delete_image': {
                                                                                const image = await localImageRepository.getImageByLocalId(item.local_id);
                                                                                if (!image) throw new Error('Image not found');

                                                                                if (image.server_id) {
                                                                                                    await api.delete(`/images/${image.server_id}`);
                                                                                }
                                                                                await localImageRepository.markSynced(item.local_id, image.server_id ?? 0);
                                                                                break;
                                                            }
                                        }
                    }

                    /**
                     * Pull latest data from server
                     */
                    private async pullFromServer(): Promise<void> {
                                        try {
                                                            // Pull folders
                                                            const foldersResponse = await api.get<ApiResponse<{ folders: Folder[]; total: number }>>('/folders');
                                                            const serverFolders = foldersResponse.data.data!.folders;

                                                            for (const folder of serverFolders) {
                                                                                await localFolderRepository.importFromServer(
                                                                                                    folder.folder_id,
                                                                                                    folder.folder_name,
                                                                                                    folder.image_count,
                                                                                                    folder.created_at
                                                                                );
                                                            }

                                                            // Purge deleted items that have been synced
                                                            await localFolderRepository.purgeDeletedFolders();
                                                            await localImageRepository.purgeDeletedImages();
                                        } catch (error) {
                                                            console.error('Pull from server error:', error);
                                                            throw error;
                                        }
                    }

                    /**
                     * Pull images for a specific folder from server
                     */
                    async pullFolderImages(folderServerId: number, folderLocalId: string): Promise<void> {
                                        if (!networkService.getIsOnline()) return;

                                        try {
                                                            const response = await api.get<ApiResponse<{ images: Image[] }>>(
                                                                                `/folders/${folderServerId}/images`
                                                            );

                                                            for (const image of response.data.data!.images) {
                                                                                await localImageRepository.importFromServer(
                                                                                                    image.image_id,
                                                                                                    folderLocalId,
                                                                                                    folderServerId,
                                                                                                    image.original_filename,
                                                                                                    image.file_size,
                                                                                                    image.mime_type,
                                                                                                    image.has_analysis,
                                                                                                    image.uploaded_at
                                                                                );
                                                            }
                                        } catch (error) {
                                                            console.error('Pull folder images error:', error);
                                        }
                    }

                    /**
                     * Get count of pending sync items
                     */
                    async getPendingCount(): Promise<number> {
                                        const db = await getDatabase();
                                        const result = await db.getFirstAsync<{ count: number }>(
                                                            `SELECT COUNT(*) as count FROM sync_queue WHERE status IN ('pending', 'processing')`
                                        );
                                        return result?.count ?? 0;
                    }

                    /**
                     * Get count of failed sync items
                     */
                    async getFailedCount(): Promise<number> {
                                        const db = await getDatabase();
                                        const result = await db.getFirstAsync<{ count: number }>(
                                                            `SELECT COUNT(*) as count FROM sync_queue WHERE status = 'failed'`
                                        );
                                        return result?.count ?? 0;
                    }

                    /**
                     * Retry failed sync items
                     */
                    async retryFailed(): Promise<void> {
                                        const db = await getDatabase();
                                        await db.runAsync(
                                                            `UPDATE sync_queue SET status = 'pending', retry_count = 0 WHERE status = 'failed'`
                                        );
                                        this.syncAll();
                    }
}

// Export singleton instance
export const syncService = new SyncService();
