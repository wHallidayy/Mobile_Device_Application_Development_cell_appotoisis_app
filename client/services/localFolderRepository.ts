import uuid from 'react-native-uuid';
import { getDatabase, LocalFolder, SyncStatus } from './database';

/**
 * Local folder repository for offline-first operations
 */
export const localFolderRepository = {
                    /**
                     * Get all non-deleted folders from local database
                     */
                    async getAllFolders(): Promise<LocalFolder[]> {
                                        const db = await getDatabase();
                                        const folders = await db.getAllAsync<LocalFolder>(
                                                            'SELECT * FROM folders WHERE is_deleted = 0 ORDER BY created_at DESC'
                                        );
                                        return folders;
                    },

                    /**
                     * Get a folder by local ID
                     */
                    async getFolderByLocalId(localId: string): Promise<LocalFolder | null> {
                                        const db = await getDatabase();
                                        const folder = await db.getFirstAsync<LocalFolder>(
                                                            'SELECT * FROM folders WHERE local_id = ?',
                                                            [localId]
                                        );
                                        return folder ?? null;
                    },

                    /**
                     * Get a folder by server ID
                     */
                    async getFolderByServerId(serverId: number): Promise<LocalFolder | null> {
                                        const db = await getDatabase();
                                        const folder = await db.getFirstAsync<LocalFolder>(
                                                            'SELECT * FROM folders WHERE server_id = ?',
                                                            [serverId]
                                        );
                                        return folder ?? null;
                    },

                    /**
                     * Create a new folder locally (will be synced later)
                     */
                    async createFolder(name: string): Promise<LocalFolder> {
                                        const db = await getDatabase();
                                        const localId = uuid.v4() as string;
                                        const createdAt = new Date().toISOString();

                                        await db.runAsync(
                                                            `INSERT INTO folders (local_id, folder_name, image_count, created_at, sync_status)
             VALUES (?, ?, 0, ?, 'pending')`,
                                                            [localId, name, createdAt]
                                        );

                                        return {
                                                            local_id: localId,
                                                            server_id: null,
                                                            folder_name: name,
                                                            image_count: 0,
                                                            created_at: createdAt,
                                                            sync_status: 'pending',
                                                            last_sync_at: null,
                                                            is_deleted: 0,
                                        };
                    },

                    /**
                     * Update folder name locally
                     */
                    async renameFolder(localId: string, newName: string): Promise<void> {
                                        const db = await getDatabase();
                                        await db.runAsync(
                                                            `UPDATE folders SET folder_name = ?, sync_status = 'pending' WHERE local_id = ?`,
                                                            [newName, localId]
                                        );
                    },

                    /**
                     * Soft delete a folder
                     */
                    async deleteFolder(localId: string): Promise<void> {
                                        const db = await getDatabase();
                                        await db.runAsync(
                                                            `UPDATE folders SET is_deleted = 1, sync_status = 'pending' WHERE local_id = ?`,
                                                            [localId]
                                        );
                    },

                    /**
                     * Mark folder as synced with server ID
                     */
                    async markSynced(localId: string, serverId: number): Promise<void> {
                                        const db = await getDatabase();
                                        const now = new Date().toISOString();
                                        await db.runAsync(
                                                            `UPDATE folders SET server_id = ?, sync_status = 'synced', last_sync_at = ? WHERE local_id = ?`,
                                                            [serverId, now, localId]
                                        );
                    },

                    /**
                     * Mark folder sync as failed
                     */
                    async markFailed(localId: string): Promise<void> {
                                        const db = await getDatabase();
                                        await db.runAsync(
                                                            `UPDATE folders SET sync_status = 'failed' WHERE local_id = ?`,
                                                            [localId]
                                        );
                    },

                    /**
                     * Get folders that need to be synced
                     */
                    async getPendingFolders(): Promise<LocalFolder[]> {
                                        const db = await getDatabase();
                                        const folders = await db.getAllAsync<LocalFolder>(
                                                            `SELECT * FROM folders WHERE sync_status = 'pending' ORDER BY created_at ASC`
                                        );
                                        return folders;
                    },

                    /**
                     * Import folder from server (for initial sync or refresh)
                     */
                    async importFromServer(
                                        serverId: number,
                                        name: string,
                                        imageCount: number,
                                        createdAt: string
                    ): Promise<LocalFolder> {
                                        const db = await getDatabase();

                                        // Check if folder already exists
                                        const existing = await this.getFolderByServerId(serverId);
                                        if (existing) {
                                                            // Update existing
                                                            await db.runAsync(
                                                                                `UPDATE folders SET folder_name = ?, image_count = ?, sync_status = 'synced', last_sync_at = ? WHERE server_id = ?`,
                                                                                [name, imageCount, new Date().toISOString(), serverId]
                                                            );
                                                            return { ...existing, folder_name: name, image_count: imageCount, sync_status: 'synced' };
                                        }

                                        // Create new
                                        const localId = uuid.v4() as string;
                                        const now = new Date().toISOString();

                                        await db.runAsync(
                                                            `INSERT INTO folders (local_id, server_id, folder_name, image_count, created_at, sync_status, last_sync_at)
             VALUES (?, ?, ?, ?, ?, 'synced', ?)`,
                                                            [localId, serverId, name, imageCount, createdAt, now]
                                        );

                                        return {
                                                            local_id: localId,
                                                            server_id: serverId,
                                                            folder_name: name,
                                                            image_count: imageCount,
                                                            created_at: createdAt,
                                                            sync_status: 'synced',
                                                            last_sync_at: now,
                                                            is_deleted: 0,
                                        };
                    },

                    /**
                     * Update image count for a folder
                     */
                    async updateImageCount(localId: string, count: number): Promise<void> {
                                        const db = await getDatabase();
                                        await db.runAsync(
                                                            'UPDATE folders SET image_count = ? WHERE local_id = ?',
                                                            [count, localId]
                                        );
                    },

                    /**
                     * Permanently delete synced folders marked as deleted
                     */
                    async purgeDeletedFolders(): Promise<void> {
                                        const db = await getDatabase();
                                        await db.runAsync(
                                                            `DELETE FROM folders WHERE is_deleted = 1 AND sync_status = 'synced'`
                                        );
                    },
};
