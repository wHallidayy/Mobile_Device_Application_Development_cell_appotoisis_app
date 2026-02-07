import uuid from 'react-native-uuid';
import { getDatabase, LocalImage, SyncStatus } from './database';

/**
 * Local image repository for offline-first operations
 */
export const localImageRepository = {
                    /**
                     * Get all non-deleted images for a folder by local ID
                     */
                    async getImagesByFolderLocalId(folderLocalId: string): Promise<LocalImage[]> {
                                        const db = await getDatabase();
                                        const images = await db.getAllAsync<LocalImage>(
                                                            'SELECT * FROM images WHERE folder_local_id = ? AND is_deleted = 0 ORDER BY uploaded_at DESC',
                                                            [folderLocalId]
                                        );
                                        return images;
                    },

                    /**
                     * Get all non-deleted images for a folder by server ID
                     */
                    async getImagesByFolderServerId(folderServerId: number): Promise<LocalImage[]> {
                                        const db = await getDatabase();
                                        const images = await db.getAllAsync<LocalImage>(
                                                            'SELECT * FROM images WHERE folder_server_id = ? AND is_deleted = 0 ORDER BY uploaded_at DESC',
                                                            [folderServerId]
                                        );
                                        return images;
                    },

                    /**
                     * Get an image by local ID
                     */
                    async getImageByLocalId(localId: string): Promise<LocalImage | null> {
                                        const db = await getDatabase();
                                        const image = await db.getFirstAsync<LocalImage>(
                                                            'SELECT * FROM images WHERE local_id = ?',
                                                            [localId]
                                        );
                                        return image ?? null;
                    },

                    /**
                     * Get an image by server ID
                     */
                    async getImageByServerId(serverId: number): Promise<LocalImage | null> {
                                        const db = await getDatabase();
                                        const image = await db.getFirstAsync<LocalImage>(
                                                            'SELECT * FROM images WHERE server_id = ?',
                                                            [serverId]
                                        );
                                        return image ?? null;
                    },

                    /**
                     * Save an image locally (for upload queue)
                     */
                    async createImage(
                                        folderLocalId: string,
                                        folderServerId: number | null,
                                        filename: string,
                                        localUri: string,
                                        fileSize: number,
                                        mimeType: string
                    ): Promise<LocalImage> {
                                        const db = await getDatabase();
                                        const localId = uuid.v4() as string;
                                        const uploadedAt = new Date().toISOString();

                                        await db.runAsync(
                                                            `INSERT INTO images (local_id, folder_local_id, folder_server_id, original_filename, local_uri, file_size, mime_type, uploaded_at, sync_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                                                            [localId, folderLocalId, folderServerId, filename, localUri, fileSize, mimeType, uploadedAt]
                                        );

                                        return {
                                                            local_id: localId,
                                                            server_id: null,
                                                            folder_local_id: folderLocalId,
                                                            folder_server_id: folderServerId,
                                                            original_filename: filename,
                                                            local_uri: localUri,
                                                            cached_file_path: null,
                                                            file_size: fileSize,
                                                            mime_type: mimeType,
                                                            has_analysis: 0,
                                                            uploaded_at: uploadedAt,
                                                            sync_status: 'pending',
                                                            last_sync_at: null,
                                                            is_deleted: 0,
                                        };
                    },

                    /**
                     * Update image filename locally
                     */
                    async renameImage(localId: string, newFilename: string): Promise<void> {
                                        const db = await getDatabase();
                                        await db.runAsync(
                                                            `UPDATE images SET original_filename = ?, sync_status = 'pending' WHERE local_id = ?`,
                                                            [newFilename, localId]
                                        );
                    },

                    /**
                     * Soft delete an image
                     */
                    async deleteImage(localId: string): Promise<void> {
                                        const db = await getDatabase();
                                        await db.runAsync(
                                                            `UPDATE images SET is_deleted = 1, sync_status = 'pending' WHERE local_id = ?`,
                                                            [localId]
                                        );
                    },

                    /**
                     * Mark image as synced with server ID
                     */
                    async markSynced(localId: string, serverId: number): Promise<void> {
                                        const db = await getDatabase();
                                        const now = new Date().toISOString();
                                        await db.runAsync(
                                                            `UPDATE images SET server_id = ?, sync_status = 'synced', last_sync_at = ? WHERE local_id = ?`,
                                                            [serverId, now, localId]
                                        );
                    },

                    /**
                     * Mark image sync as failed
                     */
                    async markFailed(localId: string): Promise<void> {
                                        const db = await getDatabase();
                                        await db.runAsync(
                                                            `UPDATE images SET sync_status = 'failed' WHERE local_id = ?`,
                                                            [localId]
                                        );
                    },

                    /**
                     * Get images that need to be synced (uploaded)
                     */
                    async getPendingImages(): Promise<LocalImage[]> {
                                        const db = await getDatabase();
                                        const images = await db.getAllAsync<LocalImage>(
                                                            `SELECT * FROM images WHERE sync_status = 'pending' AND is_deleted = 0 ORDER BY uploaded_at ASC`
                                        );
                                        return images;
                    },

                    /**
                     * Import image from server (for initial sync or refresh)
                     */
                    async importFromServer(
                                        serverId: number,
                                        folderLocalId: string,
                                        folderServerId: number,
                                        filename: string,
                                        fileSize: number,
                                        mimeType: string,
                                        hasAnalysis: boolean,
                                        uploadedAt: string
                    ): Promise<LocalImage> {
                                        const db = await getDatabase();

                                        // Check if image already exists
                                        const existing = await this.getImageByServerId(serverId);
                                        if (existing) {
                                                            // Update existing
                                                            await db.runAsync(
                                                                                `UPDATE images SET original_filename = ?, has_analysis = ?, sync_status = 'synced', last_sync_at = ? WHERE server_id = ?`,
                                                                                [filename, hasAnalysis ? 1 : 0, new Date().toISOString(), serverId]
                                                            );
                                                            return { ...existing, original_filename: filename, has_analysis: hasAnalysis ? 1 : 0, sync_status: 'synced' };
                                        }

                                        // Create new
                                        const localId = uuid.v4() as string;
                                        const now = new Date().toISOString();

                                        await db.runAsync(
                                                            `INSERT INTO images (local_id, server_id, folder_local_id, folder_server_id, original_filename, file_size, mime_type, has_analysis, uploaded_at, sync_status, last_sync_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)`,
                                                            [localId, serverId, folderLocalId, folderServerId, filename, fileSize, mimeType, hasAnalysis ? 1 : 0, uploadedAt, now]
                                        );

                                        return {
                                                            local_id: localId,
                                                            server_id: serverId,
                                                            folder_local_id: folderLocalId,
                                                            folder_server_id: folderServerId,
                                                            original_filename: filename,
                                                            local_uri: null,
                                                            cached_file_path: null,
                                                            file_size: fileSize,
                                                            mime_type: mimeType,
                                                            has_analysis: hasAnalysis ? 1 : 0,
                                                            uploaded_at: uploadedAt,
                                                            sync_status: 'synced',
                                                            last_sync_at: now,
                                                            is_deleted: 0,
                                        };
                    },

                    /**
                     * Permanently delete synced images marked as deleted
                     */
                    async purgeDeletedImages(): Promise<void> {
                                        const db = await getDatabase();
                                        await db.runAsync(
                                                            `DELETE FROM images WHERE is_deleted = 1 AND sync_status = 'synced'`
                                        );
                    },

                    /**
                     * Count images in a folder
                     */
                    async countImagesInFolder(folderLocalId: string): Promise<number> {
                                        const db = await getDatabase();
                                        const result = await db.getFirstAsync<{ count: number }>(
                                                            'SELECT COUNT(*) as count FROM images WHERE folder_local_id = ? AND is_deleted = 0',
                                                            [folderLocalId]
                                        );
                                        return result?.count ?? 0;
                    },
};
