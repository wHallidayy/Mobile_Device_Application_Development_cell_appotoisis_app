# Class Diagram - Cell Analysis Backend

โครงสร้างของ Rust Backend Application ที่แสดง struct, trait, และความสัมพันธ์ระหว่าง modules

---

## 1. Entity Layer (Domain Models)

```mermaid
classDiagram
    direction TB
    
    %% ========================================
    %% Core Domain Entities
    %% ========================================
    class User {
        +UUID user_id
        +string username
        +string password_hash
        +DateTime? created_at
    }
    
    class UserInfo {
        +UUID user_id
        +string username
        +DateTime? created_at
        +from(User) UserInfo
    }
    
    class Folder {
        +int folder_id
        +UUID user_id
        +string folder_name
        +DateTime? created_at
        +DateTime? deleted_at
    }
    
    class Image {
        +long image_id
        +int folder_id
        +string file_path
        +string original_filename
        +string mime_type
        +int file_size
        +JSON? metadata
        +DateTime? uploaded_at
        +DateTime? deleted_at
    }
    
    class ImageMetadata {
        +uint? width
        +uint? height
        +DateTime? captured_at
        +default() ImageMetadata
    }
    
    class Job {
        +long job_id
        +long image_id
        +JobStatus status
        +string? ai_model_version
        +DateTime? started_at
        +DateTime? finished_at
        +string? error_message
        +DateTime? created_at
    }
    
    class JobStatus {
        <<enumeration>>
        Pending
        Processing
        Completed
        Failed
    }
    
    class AnalysisResult {
        +long result_id
        +long job_id
        +int count_viable
        +int count_apoptosis
        +int count_other
        +double? avg_confidence_score
        +JSON? raw_data
        +string? summary_data
        +DateTime? analyzed_at
    }
    
    %% ========================================
    %% Entity Relationships
    %% ========================================
    User "1" --o "0..*" Folder : owns
    Folder "1" --o "0..*" Image : contains
    Image "1" --o "0..*" Job : analyzed_by
    Job "1" --o "0..1" AnalysisResult : produces
    Job --> JobStatus : has_status
    Image --> ImageMetadata : has_metadata
    User ..> UserInfo : converts_to
```

### Entity Description

| Entity | คำอธิบาย |
|--------|---------|
| **User** | ผู้ใช้ในระบบ เก็บข้อมูล authentication |
| **Folder** | โฟลเดอร์จัดกลุ่มรูปภาพ รองรับ soft delete |
| **Image** | ข้อมูลรูปภาพที่อัพโหลด รองรับ soft delete |
| **Job** | งานวิเคราะห์ AI พร้อม status tracking |
| **AnalysisResult** | ผลลัพธ์การนับเซลล์ (viable, apoptosis, other) |

---

## 2. DTO Layer (Data Transfer Objects)

```mermaid
classDiagram
    direction TB
    
    %% ========================================
    %% Authentication DTOs
    %% ========================================
    namespace Authentication {
        class RegisterRequest {
            +string username
            +string password
        }
        
        class LoginRequest {
            +string username
            +string password
        }
        
        class RegisterResponse {
            +UUID user_id
            +string username
            +string created_at
        }
        
        class LoginResponse {
            +string access_token
            +string refresh_token
            +long expires_in
            +UserResponse user
        }
        
        class UserResponse {
            +UUID user_id
            +string username
        }
        
        class LogoutResponse {
            +string message
        }
    }
    
    %% ========================================
    %% Folder DTOs
    %% ========================================
    namespace FolderManagement {
        class CreateFolderRequest {
            +string folder_name
        }
        
        class UpdateFolderRequest {
            +string folder_name
        }
        
        class FolderResponse {
            +int folder_id
            +string folder_name
            +long image_count
            +string created_at
            +string? deleted_at
        }
        
        class FolderListResponse {
            +List~FolderResponse~ folders
            +long total
        }
        
        class DeleteFolderResponse {
            +string message
            +long deleted_images_count
        }
    }
    
    %% ========================================
    %% Image DTOs
    %% ========================================
    namespace ImageManagement {
        class RequestUploadRequest {
            +string filename
            +string content_type
            +long file_size
        }
        
        class RequestUploadResponse {
            +string upload_token
            +string presigned_url
            +string expires_at
        }
        
        class ConfirmUploadRequest {
            +string upload_token
            +string filename
            +string content_type
            +long file_size
        }
        
        class RenameImageRequest {
            +string new_filename
        }
        
        class ImageResponse {
            +long image_id
            +string original_filename
            +string mime_type
            +int file_size
            +ImageMetadataResponse? metadata
            +string uploaded_at
        }
        
        class ImageListResponse {
            +List~ImageResponse~ images
            +PaginationInfo pagination
        }
        
        class PaginationInfo {
            +int page
            +int limit
            +long total
            +int total_pages
        }
    }
    
    %% ========================================
    %% Analysis DTOs
    %% ========================================
    namespace AnalysisManagement {
        class AnalyzeImageRequest {
            +string model_version
        }
        
        class AnalyzeImageResponse {
            +long job_id
            +long image_id
            +string status
            +string ai_model_version
            +string status_url
            +string created_at
        }
        
        class JobStatusResponse {
            +long job_id
            +long image_id
            +string status
            +string? ai_model_version
            +string? started_at
            +string? finished_at
            +string? error_message
            +string? result_url
        }
        
        class AnalysisResultResponse {
            +long result_id
            +long job_id
            +long image_id
            +CellCounts counts
            +int total_cells
            +double avg_confidence_score
            +CellPercentages percentages
            +RawDetectionData? raw_data
            +string analyzed_at
        }
        
        class CellCounts {
            +int viable
            +int apoptosis
            +int other
        }
        
        class CellPercentages {
            +double viable
            +double apoptosis
            +double other
        }
        
        class BoundingBox {
            +string class_name
            +double confidence
            +int x
            +int y
            +int width
            +int height
        }
    }
    
    %% ========================================
    %% Query Parameters
    %% ========================================
    namespace QueryParams {
        class PaginationQuery {
            +int? page
            +int? limit
            +page() int
            +limit() int
            +offset() long
        }
        
        class CursorPaginationQuery {
            +string? cursor
            +int? limit
            +limit() int
            +cursor_datetime() DateTime?
        }
    }
    
    %% Relationships
    LoginResponse --> UserResponse : contains
    AnalysisResultResponse --> CellCounts : contains
    AnalysisResultResponse --> CellPercentages : contains
```

### DTO Categories

| Category | Request DTOs | Response DTOs |
|----------|-------------|---------------|
| **Auth** | RegisterRequest, LoginRequest | RegisterResponse, LoginResponse, LogoutResponse |
| **Folder** | CreateFolderRequest, UpdateFolderRequest | FolderResponse, FolderListResponse, DeleteFolderResponse |
| **Image** | RequestUploadRequest, ConfirmUploadRequest, RenameImageRequest | RequestUploadResponse, ImageResponse, ImageListResponse |
| **Analysis** | AnalyzeImageRequest | AnalyzeImageResponse, JobStatusResponse, AnalysisResultResponse |

---

## 3. Logic Layer (Services, Repositories, Middleware)

```mermaid
classDiagram
    direction TB
    
    %% ========================================
    %% Repositories (Data Access)
    %% ========================================
    class UserRepository {
        <<repository>>
        +create(pool, username, password_hash) Result~User~
        +find_by_username(pool, username) Result~User?~
        +find_by_id(pool, user_id) Result~User?~
        +username_exists(pool, username) Result~boolean~
    }
    
    class FolderRepository {
        <<repository>>
        +create(pool, user_id, folder_name) Result~Folder~
        +find_by_user_id(pool, user_id) Result~List~Folder~~
        +find_by_id(pool, folder_id, user_id) Result~Folder?~
        +update(pool, folder_id, user_id, new_name) Result~Folder~
        +soft_delete(pool, folder_id, user_id) Result~void~
        +count_images(pool, folder_id) Result~long~
    }
    
    class ImageRepository {
        <<repository>>
        +create(pool, folder_id, file_path, ...) Result~Image~
        +find_by_folder_id(pool, folder_id, limit, offset) Result~List~Image~~
        +find_by_folder_id_cursor(pool, folder_id, cursor, limit) Result~List~Image~~
        +count_by_folder_id(pool, folder_id) Result~long~
        +find_by_id(pool, image_id, user_id) Result~Image?~
        +update_filename(pool, image_id, user_id, new_filename) Result~Image~
        +soft_delete(pool, image_id, user_id) Result~void~
        +soft_delete_by_folder(pool, folder_id) Result~long~
    }
    
    class JobRepository {
        <<repository>>
        +create(pool, image_id, model_version) Result~Job~
        +find_by_id(pool, job_id, user_id) Result~Job?~
        +start_processing(pool, job_id) Result~void~
        +complete(pool, job_id) Result~void~
        +fail(pool, job_id, error_message) Result~void~
        +get_history_by_image(pool, image_id, user_id) Result~List~Job~~
        +create_result(pool, job_id, counts, ...) Result~AnalysisResult~
        +get_result_by_job(pool, job_id, user_id) Result~AnalysisResult?~
    }
    
    %% ========================================
    %% Services (Business Logic)
    %% ========================================
    class AuthService {
        <<service>>
        +register(pool, request) Result~RegisterResponse~
        +login(pool, jwt_config, request) Result~LoginResponse~
        -hash_password(password) Result~string~
        -verify_password(password, hash) Result~boolean~
        -generate_tokens(user, jwt_config) Result~Tokens~
    }
    
    class S3StorageService {
        <<service>>
        -bucket Bucket
        -presign_bucket Bucket
        -presign_expiry_secs long
        +new(config) Result~S3StorageService~
        +upload_file(key, bytes, content_type) Result~void~
        +download_file(key) Result~bytes~
        +delete_file(key) Result~void~
        +presigned_put_url(key, content_type) Result~string~
        +presigned_get_url(key) Result~string~
        +file_exists(key) Result~boolean~
    }
    
    class RabbitmqService {
        <<service>>
        -channel Channel
        -queue_name string
        +new(config) Result~RabbitmqService~
        +publish_analysis_job(message) Result~void~
    }
    
    class ImageService {
        <<service>>
        +validate_file(content_type, bytes) Result~void~
        +generate_storage_path(original_filename) Tuple~string, string~
        +save_to_disk(bytes, storage_path) Result~void~
        +extract_metadata(bytes) Result~ImageMetadata~
    }
    
    class AnalysisJobMessage {
        <<message>>
        +long job_id
        +long image_id
        +string s3_key
        +string model_version
        +string created_at
    }
    
    %% ========================================
    %% Middleware
    %% ========================================
    class AuthMiddleware {
        <<middleware>>
        -jwt_config JwtConfig
        +new(jwt_config) AuthMiddleware
        +verify_token(token, config) Result~TokenClaims~
    }
    
    class AuthenticatedUser {
        <<context>>
        +UUID user_id
        +string username
    }
    
    class TokenClaims {
        <<claims>>
        +string sub
        +string username
        +string token_type
    }
    
    class SecurityHeadersMiddleware {
        <<middleware>>
        +add_security_headers(response) Response
    }
    
    %% ========================================
    %% Error Types
    %% ========================================
    class AuthError {
        <<error>>
        UsernameExists
        InvalidCredentials
        HashingError
        TokenError
        DatabaseError
        ValidationError
    }
    
    class S3Error {
        <<error>>
        CredentialsError
        BucketError
        UploadError
        DownloadError
        DeleteError
        NotFound
    }
    
    class RabbitmqError {
        <<error>>
        Connection
        Channel
        QueueDeclare
        Publish
        Serialize
        NotConnected
    }
    
    class ImageServiceError {
        <<error>>
        InvalidFileType
        InvalidMagicBytes
        FileTooLarge
        SaveError
        IoError
    }
    
    %% ========================================
    %% Relationships
    %% ========================================
    AuthService ..> UserRepository : uses
    AuthService --> AuthError : throws
    
    S3StorageService --> S3Error : throws
    
    RabbitmqService ..> AnalysisJobMessage : publishes
    RabbitmqService --> RabbitmqError : throws
    
    ImageService --> ImageServiceError : throws
    
    AuthMiddleware ..> TokenClaims : validates
    AuthMiddleware ..> AuthenticatedUser : produces
```

---

## 4. Module Dependencies Overview

```mermaid
graph TB
    subgraph Handlers["🎯 Handler Layer"]
        AH[Auth Handlers]
        FH[Folder Handlers]
        IH[Image Handlers]
        ANH[Analysis Handlers]
    end
    
    subgraph Services["⚙️ Service Layer"]
        AS[AuthService]
        S3[S3StorageService]
        RMQ[RabbitmqService]
        IS[ImageService]
    end
    
    subgraph Repositories["💾 Repository Layer"]
        UR[UserRepository]
        FR[FolderRepository]
        IR[ImageRepository]
        JR[JobRepository]
    end
    
    subgraph Models["📦 Model Layer"]
        U[User]
        F[Folder]
        I[Image]
        J[Job]
        AR[AnalysisResult]
    end
    
    subgraph Middleware["🔒 Middleware"]
        AM[AuthMiddleware]
        SH[SecurityHeaders]
    end
    
    subgraph External["☁️ External Services"]
        DB[(PostgreSQL)]
        MINIO[(MinIO/S3)]
        RABBIT[(RabbitMQ)]
    end
    
    AH --> AS
    FH --> FR
    IH --> IR
    IH --> S3
    IH --> IS
    ANH --> JR
    ANH --> RMQ
    
    AS --> UR
    
    UR --> U
    FR --> F
    IR --> I
    JR --> J
    JR --> AR
    
    AH -.-> AM
    FH -.-> AM
    IH -.-> AM
    ANH -.-> AM
    
    UR --> DB
    FR --> DB
    IR --> DB
    JR --> DB
    
    S3 --> MINIO
    RMQ --> RABBIT
    
    classDef handlerStyle fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef serviceStyle fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef repoStyle fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    classDef modelStyle fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef middlewareStyle fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef externalStyle fill:#e0e0e0,stroke:#424242,stroke-width:2px
    
    class AH,FH,IH,ANH handlerStyle
    class AS,S3,RMQ,IS serviceStyle
    class UR,FR,IR,JR repoStyle
    class U,F,I,J,AR modelStyle
    class AM,SH middlewareStyle
    class DB,MINIO,RABBIT externalStyle
```

---

## Type Mapping Reference

| Language-Neutral | Rust | TypeScript | Java |
|-----------------|------|------------|------|
| `int` | `i32` | `number` | `int` |
| `long` | `i64` | `number` | `long` |
| `uint` | `u32` | `number` | `int` |
| `double` | `f64` | `number` | `double` |
| `string` | `String` | `string` | `String` |
| `boolean` | `bool` | `boolean` | `boolean` |
| `UUID` | `Uuid` | `string` | `UUID` |
| `DateTime` | `DateTime<Utc>` | `Date` | `Instant` |
| `T?` | `Option<T>` | `T \| null` | `Optional<T>` |
| `List<T>` | `Vec<T>` | `T[]` | `List<T>` |
| `JSON` | `serde_json::Value` | `object` | `JsonNode` |
| `Result<T>` | `Result<T, E>` | `Promise<T>` | `T throws E` |

---

## Summary

### Architecture Layers

| Layer | Responsibility | Components |
|-------|---------------|------------|
| **Handler** | HTTP request/response handling | AuthHandlers, FolderHandlers, ImageHandlers, AnalysisHandlers |
| **Service** | Business logic & external integrations | AuthService, S3StorageService, RabbitmqService, ImageService |
| **Repository** | Data persistence & queries | UserRepository, FolderRepository, ImageRepository, JobRepository |
| **Model** | Domain entities | User, Folder, Image, Job, AnalysisResult |
| **DTO** | API contracts | Request/Response objects |
| **Middleware** | Cross-cutting concerns | AuthMiddleware, SecurityHeaders |
