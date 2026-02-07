import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'cellanalyzer.db';
const DATABASE_VERSION = 2;

let dbInstance: SQLite.SQLiteDatabase | null = null;

/**
 * Get or create the database instance
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
    if (dbInstance) {
        return dbInstance;
    }

    dbInstance = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await dbInstance.execAsync('PRAGMA journal_mode = WAL;');
    await migrateDatabase(dbInstance);

    return dbInstance;
}

/**
 * Run database migrations
 */
async function migrateDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
    // Get current version
    const result = await db.getFirstAsync<{ user_version: number }>(
        'PRAGMA user_version;'
    );
    const currentVersion = result?.user_version ?? 0;

    if (currentVersion < DATABASE_VERSION) {
        await db.withExclusiveTransactionAsync(async (txn) => {
            // Migration for version 1: Initial schema
            if (currentVersion < 1) {
                // Folders table
                await txn.execAsync(`
                    CREATE TABLE IF NOT EXISTS folders (
                        local_id TEXT PRIMARY KEY,
                        server_id INTEGER,
                        folder_name TEXT NOT NULL,
                        image_count INTEGER DEFAULT 0,
                        created_at TEXT,
                        sync_status TEXT DEFAULT 'pending',
                        last_sync_at TEXT,
                        is_deleted INTEGER DEFAULT 0
                    );
                `);

                // Images table
                await txn.execAsync(`
                    CREATE TABLE IF NOT EXISTS images (
                        local_id TEXT PRIMARY KEY,
                        server_id INTEGER,
                        folder_local_id TEXT,
                        folder_server_id INTEGER,
                        original_filename TEXT NOT NULL,
                        local_uri TEXT,
                        file_size INTEGER,
                        mime_type TEXT,
                        has_analysis INTEGER DEFAULT 0,
                        uploaded_at TEXT,
                        sync_status TEXT DEFAULT 'pending',
                        last_sync_at TEXT,
                        is_deleted INTEGER DEFAULT 0,
                        FOREIGN KEY (folder_local_id) REFERENCES folders(local_id)
                    );
                `);

                // Sync queue table
                await txn.execAsync(`
                    CREATE TABLE IF NOT EXISTS sync_queue (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        operation TEXT NOT NULL,
                        entity_type TEXT NOT NULL,
                        local_id TEXT NOT NULL,
                        payload TEXT,
                        status TEXT DEFAULT 'pending',
                        retry_count INTEGER DEFAULT 0,
                        created_at TEXT,
                        error_message TEXT
                    );
                `);

                // Create indexes for better query performance
                await txn.execAsync(`
                    CREATE INDEX IF NOT EXISTS idx_folders_sync_status ON folders(sync_status);
                    CREATE INDEX IF NOT EXISTS idx_images_folder_local_id ON images(folder_local_id);
                    CREATE INDEX IF NOT EXISTS idx_images_sync_status ON images(sync_status);
                    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
                `);
            }

            // Migration for version 2: Offline caching support
            if (currentVersion < 2) {
                // Add cached_file_path to images table
                await txn.execAsync(`
                    ALTER TABLE images ADD COLUMN cached_file_path TEXT;
                `);

                // Analysis results table for offline viewing
                await txn.execAsync(`
                    CREATE TABLE IF NOT EXISTS analysis_results (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        image_server_id INTEGER NOT NULL UNIQUE,
                        job_id INTEGER,
                        counts_viable INTEGER DEFAULT 0,
                        counts_apoptosis INTEGER DEFAULT 0,
                        counts_other INTEGER DEFAULT 0,
                        total_cells INTEGER DEFAULT 0,
                        avg_confidence REAL DEFAULT 0,
                        percentages_viable REAL DEFAULT 0,
                        percentages_apoptosis REAL DEFAULT 0,
                        percentages_other REAL DEFAULT 0,
                        bounding_boxes_json TEXT,
                        analyzed_at TEXT,
                        cached_at TEXT
                    );
                `);

                // Create index for analysis_results
                await txn.execAsync(`
                    CREATE INDEX IF NOT EXISTS idx_analysis_results_image_id ON analysis_results(image_server_id);
                `);
            }

            // Update version
            await txn.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
        });
    }
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
    if (dbInstance) {
        await dbInstance.closeAsync();
        dbInstance = null;
    }
}

/**
 * Sync status types
 */
export type SyncStatus = 'synced' | 'pending' | 'failed';

/**
 * Local folder interface
 */
export interface LocalFolder {
    local_id: string;
    server_id: number | null;
    folder_name: string;
    image_count: number;
    created_at: string;
    sync_status: SyncStatus;
    last_sync_at: string | null;
    is_deleted: number;
}

/**
 * Local image interface
 */
export interface LocalImage {
    local_id: string;
    server_id: number | null;
    folder_local_id: string;
    folder_server_id: number | null;
    original_filename: string;
    local_uri: string | null;
    cached_file_path: string | null;
    file_size: number;
    mime_type: string;
    has_analysis: number;
    uploaded_at: string;
    sync_status: SyncStatus;
    last_sync_at: string | null;
    is_deleted: number;
}

/**
 * Sync queue item interface
 */
export interface SyncQueueItem {
    id: number;
    operation: 'create_folder' | 'rename_folder' | 'delete_folder' | 'upload_image' | 'rename_image' | 'delete_image';
    entity_type: 'folder' | 'image';
    local_id: string;
    payload: string | null;
    status: 'pending' | 'processing' | 'failed';
    retry_count: number;
    created_at: string;
    error_message: string | null;
}

/**
 * Local analysis result interface for offline viewing
 */
export interface LocalAnalysisResult {
    id: number;
    image_server_id: number;
    job_id: number;
    counts_viable: number;
    counts_apoptosis: number;
    counts_other: number;
    total_cells: number;
    avg_confidence: number;
    percentages_viable: number;
    percentages_apoptosis: number;
    percentages_other: number;
    bounding_boxes_json: string | null;
    analyzed_at: string;
    cached_at: string;
}
