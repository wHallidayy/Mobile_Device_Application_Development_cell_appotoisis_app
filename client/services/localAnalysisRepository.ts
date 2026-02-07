import { getDatabase, LocalAnalysisResult } from './database';
import { AnalysisResultResponse, BoundingBox } from './analysisService';

/**
 * Local analysis repository for offline viewing
 * Stores and retrieves analysis results from local SQLite database
 */
export const localAnalysisRepository = {
                    /**
                     * Save analysis result to local database
                     */
                    async saveAnalysisResult(imageServerId: number, result: AnalysisResultResponse): Promise<void> {
                                        const db = await getDatabase();
                                        const now = new Date().toISOString();

                                        const boundingBoxesJson = result.raw_data?.bounding_boxes
                                                            ? JSON.stringify(result.raw_data.bounding_boxes)
                                                            : null;

                                        // Use INSERT OR REPLACE to update if exists
                                        await db.runAsync(
                                                            `INSERT OR REPLACE INTO analysis_results (
                image_server_id, job_id,
                counts_viable, counts_apoptosis, counts_other,
                total_cells, avg_confidence,
                percentages_viable, percentages_apoptosis, percentages_other,
                bounding_boxes_json, analyzed_at, cached_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                                            [
                                                                                imageServerId,
                                                                                result.job_id,
                                                                                result.counts.viable,
                                                                                result.counts.apoptosis,
                                                                                result.counts.other,
                                                                                result.total_cells,
                                                                                result.avg_confidence_score,
                                                                                result.percentages.viable,
                                                                                result.percentages.apoptosis,
                                                                                result.percentages.other,
                                                                                boundingBoxesJson,
                                                                                result.analyzed_at,
                                                                                now
                                                            ]
                                        );
                    },

                    /**
                     * Get analysis result from local database
                     */
                    async getAnalysisResult(imageServerId: number): Promise<AnalysisResultResponse | null> {
                                        const db = await getDatabase();
                                        const row = await db.getFirstAsync<LocalAnalysisResult>(
                                                            'SELECT * FROM analysis_results WHERE image_server_id = ?',
                                                            [imageServerId]
                                        );

                                        if (!row) return null;

                                        // Convert local format back to API format
                                        const boundingBoxes: BoundingBox[] = row.bounding_boxes_json
                                                            ? JSON.parse(row.bounding_boxes_json)
                                                            : [];

                                        return {
                                                            result_id: row.id,
                                                            job_id: row.job_id,
                                                            image_id: row.image_server_id,
                                                            counts: {
                                                                                viable: row.counts_viable,
                                                                                apoptosis: row.counts_apoptosis,
                                                                                other: row.counts_other,
                                                            },
                                                            total_cells: row.total_cells,
                                                            avg_confidence_score: row.avg_confidence,
                                                            percentages: {
                                                                                viable: row.percentages_viable,
                                                                                apoptosis: row.percentages_apoptosis,
                                                                                other: row.percentages_other,
                                                            },
                                                            raw_data: boundingBoxes.length > 0 ? { bounding_boxes: boundingBoxes } : null,
                                                            analyzed_at: row.analyzed_at,
                                        };
                    },

                    /**
                     * Check if analysis result exists in local database
                     */
                    async hasAnalysisResult(imageServerId: number): Promise<boolean> {
                                        const db = await getDatabase();
                                        const result = await db.getFirstAsync<{ count: number }>(
                                                            'SELECT COUNT(*) as count FROM analysis_results WHERE image_server_id = ?',
                                                            [imageServerId]
                                        );
                                        return (result?.count ?? 0) > 0;
                    },

                    /**
                     * Delete analysis result from local database
                     */
                    async deleteAnalysisResult(imageServerId: number): Promise<void> {
                                        const db = await getDatabase();
                                        await db.runAsync(
                                                            'DELETE FROM analysis_results WHERE image_server_id = ?',
                                                            [imageServerId]
                                        );
                    },

                    /**
                     * Delete all analysis results
                     */
                    async clearAll(): Promise<void> {
                                        const db = await getDatabase();
                                        await db.runAsync('DELETE FROM analysis_results');
                    },

                    /**
                     * Get count of cached analysis results
                     */
                    async getCachedCount(): Promise<number> {
                                        const db = await getDatabase();
                                        const result = await db.getFirstAsync<{ count: number }>(
                                                            'SELECT COUNT(*) as count FROM analysis_results'
                                        );
                                        return result?.count ?? 0;
                    },
};
