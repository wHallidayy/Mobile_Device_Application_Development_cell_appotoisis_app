import api, { ApiResponse } from './api';
import { localAnalysisRepository } from './localAnalysisRepository';
import { networkService } from './networkService';

// Request types
export interface AnalyzeImageRequest {
                    model_version?: string;
}

// Response types
export interface AnalyzeImageResponse {
                    job_id: number;
                    image_id: number;
                    status: string;
                    ai_model_version: string;
                    status_url: string;
                    created_at: string;
}

export interface JobStatusResponse {
                    job_id: number;
                    image_id: number;
                    status: string;
                    ai_model_version?: string | null;
                    started_at?: string | null;
                    finished_at?: string | null;
                    error_message?: string | null;
                    result_url?: string | null;
}

export interface CellCounts {
                    viable: number;
                    apoptosis: number;
                    other: number;
}

export interface CellPercentages {
                    viable: number;
                    apoptosis: number;
                    other: number;
}

export interface BoundingBox {
                    class: string;  // 'viable', 'apoptosis', 'other'
                    confidence: number;
                    x: number;
                    y: number;
                    width: number;
                    height: number;
}

export interface RawDetectionData {
                    bounding_boxes: BoundingBox[];
}

export interface AnalysisResultResponse {
                    result_id: number;
                    job_id: number;
                    image_id: number;
                    counts: CellCounts;
                    total_cells: number;
                    avg_confidence_score: number;
                    percentages: CellPercentages;
                    raw_data?: RawDetectionData | null;
                    summary_data?: string | null;
                    analyzed_at: string;
}

export interface AnalysisHistorySummary {
                    job_id: number;
                    status: string;
                    ai_model_version?: string | null;
                    counts?: CellCounts | null;
                    avg_confidence_score?: number | null;
                    finished_at?: string | null;
}

export interface ImageAnalysisHistoryResponse {
                    image_id: number;
                    analyses: AnalysisHistorySummary[];
                    total: number;
}

export const analysisService = {
                    async analyzeImage(imageId: number, data?: AnalyzeImageRequest): Promise<AnalyzeImageResponse> {
                                        const response = await api.post<ApiResponse<AnalyzeImageResponse>>(
                                                            `/images/${imageId}/analyze`,
                                                            data || {}
                                        );
                                        return response.data.data!;
                    },

                    async getJobStatus(jobId: number): Promise<JobStatusResponse> {
                                        const response = await api.get<ApiResponse<JobStatusResponse>>(`/jobs/${jobId}`);
                                        return response.data.data!;
                    },

                    async getJobResult(jobId: number): Promise<AnalysisResultResponse> {
                                        const response = await api.get<ApiResponse<AnalysisResultResponse>>(`/jobs/${jobId}/result`);
                                        const result = response.data.data!;

                                        // Auto-cache the result for offline viewing
                                        try {
                                                            await localAnalysisRepository.saveAnalysisResult(result.image_id, result);
                                        } catch (error) {
                                                            console.warn('Failed to cache analysis result:', error);
                                        }

                                        return result;
                    },

                    async getAnalysisHistory(imageId: number): Promise<ImageAnalysisHistoryResponse> {
                                        const response = await api.get<ApiResponse<ImageAnalysisHistoryResponse>>(
                                                            `/images/${imageId}/analysis-history`
                                        );
                                        return response.data.data!;
                    },

                    /**
                     * Get cached analysis result for offline viewing
                     */
                    async getCachedAnalysisResult(imageId: number): Promise<AnalysisResultResponse | null> {
                                        return await localAnalysisRepository.getAnalysisResult(imageId);
                    },

                    /**
                     * Get analysis result with offline fallback
                     * First tries to get from server, falls back to local cache if offline
                     */
                    async getAnalysisResultWithOfflineFallback(imageId: number): Promise<AnalysisResultResponse | null> {
                                        const isOnline = networkService.getIsOnline();

                                        if (isOnline) {
                                                            try {
                                                                                // Try to get from server via history
                                                                                const history = await this.getAnalysisHistory(imageId);
                                                                                if (history.analyses && history.analyses.length > 0) {
                                                                                                    const completedJob = history.analyses.find(a => a.status === 'completed');
                                                                                                    if (completedJob) {
                                                                                                                        return await this.getJobResult(completedJob.job_id);
                                                                                                    }
                                                                                }
                                                                                return null;
                                                            } catch (error) {
                                                                                console.warn('Failed to get analysis from server, trying cache:', error);
                                                                                // Fall back to cache on error
                                                                                return await this.getCachedAnalysisResult(imageId);
                                                            }
                                        } else {
                                                            // Offline - use cached result
                                                            return await this.getCachedAnalysisResult(imageId);
                                        }
                    },

                    // Poll for job completion
                    async waitForJobCompletion(
                                        jobId: number,
                                        onProgress?: (status: JobStatusResponse) => void,
                                        maxAttempts: number = 60,
                                        intervalMs: number = 2000
                    ): Promise<AnalysisResultResponse> {
                                        let attempts = 0;

                                        while (attempts < maxAttempts) {
                                                            const status = await this.getJobStatus(jobId);
                                                            onProgress?.(status);

                                                            if (status.status === 'completed') {
                                                                                return await this.getJobResult(jobId);
                                                            }

                                                            if (status.status === 'failed') {
                                                                                throw new Error(status.error_message || 'Analysis failed');
                                                            }

                                                            await new Promise(resolve => setTimeout(resolve, intervalMs));
                                                            attempts++;
                                        }

                                        throw new Error('Analysis timed out');
                    },
};
