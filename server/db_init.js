import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

export async function initializeDatabase() {
  const dbPath = path.resolve('photos.db');
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_cache_path TEXT,
      telegram_message_id TEXT,
      telegram_file_id TEXT,
      telegram_link TEXT,
      people TEXT,
      tags TEXT,
      upload_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS faces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      descriptor TEXT NOT NULL,
      saved_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS face_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      descriptor TEXT NOT NULL,
      saved_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS processing_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      ai_caption TEXT,
      detected_faces TEXT,
      status TEXT DEFAULT 'PENDING_REVIEW'
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Insert default settings if they don't exist
  await db.exec(`
    INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_approve', 'true');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_approve_tag', '');
  `);

  return db;
}
