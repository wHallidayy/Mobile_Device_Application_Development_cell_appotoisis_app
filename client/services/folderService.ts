import api, { ApiResponse } from './api';

export interface Folder {
                    folder_id: number;
                    folder_name: string;
                    image_count: number;
                    created_at: string;
                    deleted_at?: string | null;
}

export interface FolderListResponse {
                    folders: Folder[];
                    total: number;
}

export interface CreateFolderRequest {
                    folder_name: string;
}

export interface UpdateFolderRequest {
                    folder_name: string;
}

export interface DeleteFolderResponse {
                    message: string;
                    deleted_images_count: number;
}

export const folderService = {
                    async listFolders(): Promise<FolderListResponse> {
                                        const response = await api.get<ApiResponse<FolderListResponse>>('/folders');
                                        return response.data.data!;
                    },

                    async createFolder(name: string): Promise<Folder> {
                                        const response = await api.post<ApiResponse<Folder>>('/folders', { folder_name: name });
                                        return response.data.data!;
                    },

                    async renameFolder(folderId: number, name: string): Promise<Folder> {
                                        const response = await api.patch<ApiResponse<Folder>>(`/folders/${folderId}`, { folder_name: name });
                                        return response.data.data!;
                    },

                    async deleteFolder(folderId: number): Promise<DeleteFolderResponse> {
                                        const response = await api.delete<ApiResponse<DeleteFolderResponse>>(`/folders/${folderId}`);
                                        return response.data.data!;
                    },
};
