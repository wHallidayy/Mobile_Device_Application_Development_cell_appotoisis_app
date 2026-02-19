# Mobile Device Application Development - Cell Apoptosis App

This project is a mobile application designed for analyzing cell apoptosis images. It features a distributed architecture with a React Native mobile client, a high-performance Rust backend, and a Python-based model worker for AI inference.

## 🏗️ Architecture Overview

The system consists of three main components:
1.  **Mobile Client**: Captures or selects images and communicates with the backend.
2.  **Backend API**: Handles user requests, image uploads, and manages the job queue.
3.  **Model Worker**: Processes images using AI models (YOLO) to detect and analyze cells.

## 🛠️ Tech Stack

### 📱 Client (Mobile)
-   **Framework**: React Native with Expo
-   **Language**: TypeScript
-   **Key Libraries**:
    -   `expo-router` for navigation
    -   `axios` for API requests
    -   `expo-image-picker` for media handling
    -   `expo-sqlite` for local storage

### 🚀 Backend (Server)
-   **Language**: Rust
-   **Framework**: Actix-web
-   **Database**: PostgreSQL (via `sqlx`)
-   **Key Libraries**:
    -   `tokio` for async runtime
    -   `serde` for serialization
    -   `lapin` for RabbitMQ messaging
    -   `rust-s3` for MinIO object storage interaction

### 🧠 Model Worker (AI)
-   **Language**: Python
-   **Framework**: Ultralytics YOLO
-   **Key Libraries**:
    -   `pika` for RabbitMQ consumer
    -   `minio` for object storage access
    -   `psycopg2` for database updates
    -   `pillow` and `numpy` for image processing

## 📂 Project Structure

```
├── client/         # React Native Expo project
├── server/         # Rust Actix-web backend
├── model_worker/   # Python AI worker
├── scripts/        # Utility scripts (e.g., test_upload.py)
├── migrations/     # Database migrations
├── docker-compose.yml # Container orchestration
└── Makefile        # Project automation commands
```

## 🚀 Getting Started

### Prerequisites
-   Docker & Docker Compose
-   Node.js & npm/yarn
-   Rust Toolchain (cargo)
-   Python 3.10+

### Running with Docker
The easiest way to start the entire stack is using Docker Compose:

```bash
docker-compose up --build
```

### Manual Setup
Refer to the `README.md` within each subdirectory for specific component instructions.
