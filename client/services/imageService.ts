import api, { ApiResponse } from './api';
import { localImageRepository } from './localImageRepository';
import { networkService } from './networkService';
import { localFolderRepository } from './localFolderRepository';

export interface ImageMetadata {
                    width?: number;
                    height?: number;
}

export interface Image {
                    image_id: number;
                    folder_id: number;
                    original_filename: string;
                    file_size: number;
                    mime_type: string;
                    metadata?: ImageMetadata | null;
                    has_analysis: boolean;
                    uploaded_at: string;
}

export interface PaginationInfo {
                    page: number;
                    limit: number;
                    total: number;
                    total_pages: number;
}

export interface ImageListResponse {
                    images: Image[];
                    pagination: PaginationInfo;
}

export interface ImageDetail {
                    image_id: number;
                    folder_id: number;
                    original_filename: string;
                    file_url: string;
                    file_size: number;
                    mime_type: string;
                    metadata?: ImageMetadata | null;
                    analysis_history: AnalysisHistoryItem[];
                    uploaded_at: string;
}

export interface AnalysisHistoryItem {
                    job_id: number;
                    status: string;
                    ai_model_version?: string | null;
                    finished_at?: string | null;
}

export interface DeleteImageResponse {
                    message: string;
}

// Presigned URL types
export interface RequestUploadRequest {
                    filename: string;
                    content_type: string;
                    file_size: number;
}

export interface RequestUploadResponse {
                    presigned_url: string;
                    upload_token: string;
                    expires_at: string;
}

export interface ConfirmUploadRequest {
                    upload_token: string;
                    filename: string;
                    content_type: string;
                    file_size: number;
}

export interface PresignedDownloadResponse {
                    url: string;
                    expires_at: string;
}

export interface RenameImageRequest {
                    new_filename: string;
}

export const imageService = {
                    async listImages(folderId: number, page: number = 1, limit: number = 20): Promise<ImageListResponse> {
                                        const response = await api.get<ApiResponse<ImageListResponse>>(
                                                            `/folders/${folderId}/images`,
                                                            { params: { page, limit } }
                                        );
                                        return response.data.data!;
                    },

                    async uploadImage(folderId: number, imageUri: string, filename: string): Promise<Image> {
                                        console.log('uploadImage called with:', { folderId, imageUri, filename });

                                        const formData = new FormData();

                                        // Determine mime type from extension
                                        const extension = filename.split('.').pop()?.toLowerCase() || 'jpg';
                                        const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';

                                        formData.append('file', {
                                                            uri: imageUri,
                                                            name: filename,
                                                            type: mimeType,
                                        } as any);

                                        console.log('Sending request to:', `/folders/${folderId}/images`);

                                        const response = await api.post<ApiResponse<Image>>(
                                                            `/folders/${folderId}/images`,
                                                            formData,
                                                            {
                                                                                headers: {
                                                                                                    'Content-Type': 'multipart/form-data',
                                                                                },
                                                            }
                                        );
                                        console.log('Upload response:', response.data);
                                        return response.data.data!;
                    },

                    // Request presigned URL for upload
                    async requestUpload(folderId: number, data: RequestUploadRequest): Promise<RequestUploadResponse> {
                                        const response = await api.post<ApiResponse<RequestUploadResponse>>(
                                                            `/folders/${folderId}/images/request-upload`,
                                                            data
                                        );
                                        return response.data.data!;
                    },

                    // Confirm upload after uploading to S3/MinIO
                    async confirmUpload(folderId: number, data: ConfirmUploadRequest): Promise<Image> {
                                        const response = await api.post<ApiResponse<Image>>(
                                                            `/folders/${folderId}/images/confirm-upload`,
                                                            data
                                        );
                                        return response.data.data!;
                    },

                    async getImage(imageId: number): Promise<ImageDetail> {
                                        const response = await api.get<ApiResponse<ImageDetail>>(`/images/${imageId}`);
                                        return response.data.data!;
                    },

                    async deleteImage(imageId: number): Promise<void> {
                                        await api.delete<ApiResponse<DeleteImageResponse>>(`/images/${imageId}`);
                    },

                    async renameImage(imageId: number, newFilename: string): Promise<Image> {
                                        const response = await api.patch<ApiResponse<Image>>(`/images/${imageId}`, {
                                                            new_filename: newFilename,
                                        });
                                        return response.data.data!;
                    },

                    // Get presigned download URL
                    async getImageDownloadUrl(imageId: number): Promise<PresignedDownloadResponse> {
                                        const response = await api.get<ApiResponse<PresignedDownloadResponse>>(
                                                            `/images/${imageId}/download-url`
                                        );
                                        return response.data.data!;
                    },

                    // Helper function to upload file to S3/MinIO using presigned URL
                    async uploadToPresignedUrl(presignedUrl: string, file: Blob, contentType: string): Promise<boolean> {
                                        console.log(`Uploading to presigned URL...`);

                                        try {
                                                            const response = await fetch(presignedUrl, {
                                                                                method: 'PUT',
                                                                                body: file,
                                                                                headers: {
                                                                                                    'Content-Type': contentType,
                                                                                },
                                                            });

                                                            if (!response.ok) {
                                                                                console.error('Presigned upload failed:', response.status, response.statusText);
                                                                                return false;
                                                            }

                                                            return true;
                                        } catch (error) {
                                                            console.error('Presigned upload network error:', error);
                                                            return false;
                                        }
                    },

                    /**
                     * List images with offline fallback
                     * When online: fetches from server and caches to local DB
                     * When offline: returns from local database
                     */
                    async listImagesWithOfflineFallback(folderId: number): Promise<ImageListResponse> {
                                        const isOnline = networkService.getIsOnline();

                                        if (isOnline) {
                                                            try {
                                                                                // Fetch from server
                                                                                const response = await this.listImages(folderId);

                                                                                // Cache each image to local database
                                                                                const folder = await localFolderRepository.getFolderByServerId(folderId);
                                                                                if (folder) {
                                                                                                    for (const img of response.images) {
                                                                                                                        await localImageRepository.importFromServer(
                                                                                                                                            img.image_id,
                                                                                                                                            folder.local_id,
                                                                                                                                            folderId,
                                                                                                                                            img.original_filename,
                                                                                                                                            img.file_size,
                                                                                                                                            img.mime_type,
                                                                                                                                            img.has_analysis,
                                                                                                                                            img.uploaded_at
                                                                                                                        );
                                                                                                    }
                                                                                }

                                                                                return response;
                                                            } catch (error) {
                                                                                console.warn('Failed to fetch images from server, falling back to local:', error);
                                                                                // Fall through to offline handling
                                                            }
                                        }

                                        // Offline or server request failed - use local database
                                        const localImages = await localImageRepository.getImagesByFolderServerId(folderId);

                                        // Convert LocalImage to Image format
                                        const images: Image[] = localImages.map(localImg => ({
                                                            image_id: localImg.server_id!,
                                                            folder_id: localImg.folder_server_id!,
                                                            original_filename: localImg.original_filename,
                                                            file_size: localImg.file_size,
                                                            mime_type: localImg.mime_type,
                                                            has_analysis: localImg.has_analysis === 1,
                                                            uploaded_at: localImg.uploaded_at,
                                        })).filter(img => img.image_id !== null);

                                        return {
                                                            images,
                                                            pagination: {
                                                                                page: 1,
                                                                                limit: images.length,
                                                                                total: images.length,
                                                                                total_pages: 1,
                                                            },
                                        };
                    },
};
