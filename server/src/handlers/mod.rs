pub mod analysis_handlers;
pub mod auth_handlers;
pub mod folder_handlers;
pub mod image_handlers;

pub use analysis_handlers::{analyze_image, get_analysis_history, get_job_result, get_job_status};
pub use auth_handlers::{login, logout, register};
pub use folder_handlers::{create_folder, delete_folder, list_folders, rename_folder};
pub use image_handlers::{
    confirm_upload, delete_image, get_image, get_image_download_url, get_image_file, list_images,
    list_images_v2, rename_image, request_upload, upload_image,
};
