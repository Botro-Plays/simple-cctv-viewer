import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { app, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';
import { Camera, Settings } from '../../shared/types';

function encryptPassword(plain: string | null | undefined): string | null {
  if (!plain) return null;
  if (!safeStorage.isEncryptionAvailable()) return plain;
  return safeStorage.encryptString(plain).toString('base64');
}

function decryptPassword(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!safeStorage.isEncryptionAvailable()) return stored;
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  } catch {
    return stored;
  }
}

export class DatabaseService {
  private db: Database | null = null;
  private SQL: SqlJsStatic | null = null;
  private dbPath: string;

  constructor() {
    // For portable builds, store data in the app directory
    // For installed builds, store data in userData
    if (app.isPackaged && process.env.PORTABLE_EXECUTABLE_DIR) {
      this.dbPath = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data', 'cctv-viewer.db');
    } else {
      this.dbPath = path.join(app.getPath('userData'), 'sqlite', 'cctv-viewer.db');
    }
    this.ensureDataDirectory();
  }

  private ensureDataDirectory(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private getWasmSourcePath(): string {
    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
      return path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    }
    return path.join(process.resourcesPath, 'sql-wasm.wasm');
  }

  async initialize(): Promise<void> {
    const wasmPath = this.getWasmSourcePath();

    this.SQL = await initSqlJs({
      locateFile: () => wasmPath,
    });

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(fileBuffer);
      this.migrate();
    } else {
      this.db = new this.SQL.Database();
      this.createSchema();
      this.save();
    }
  }

  private createSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    const queries = [
      `CREATE TABLE IF NOT EXISTS cameras (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        brand TEXT NOT NULL,
        rtspUrl TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 554,
        username TEXT,
        password TEXT,
        mainStreamPath TEXT NOT NULL,
        subStreamPath TEXT,
        preferredQuality TEXT NOT NULL DEFAULT 'MEDIUM',
        enabled INTEGER NOT NULL DEFAULT 1,
        onvifEndpoint TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS recordings (
        id TEXT PRIMARY KEY,
        cameraId TEXT NOT NULL,
        filePath TEXT NOT NULL,
        startTime TEXT NOT NULL,
        endTime TEXT NOT NULL,
        fileSize INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (cameraId) REFERENCES cameras(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_recordings_camera ON recordings(cameraId)`,
      `CREATE INDEX IF NOT EXISTS idx_recordings_time ON recordings(startTime)`,
    ];

    queries.forEach(query => {
      this.db!.run(query);
    });

    this.insertDefaultSettings();
  }

  private insertDefaultSettings(): void {
    if (!this.db) throw new Error('Database not initialized');

    const defaultSettings: Partial<Settings> = {
      pinLockEnabled: false,
      autoStartEnabled: false,
      minimizeToTray: true,
      defaultQuality: 'MEDIUM',
      retentionDays: 7,
      maxRecordingSizeGB: 50,
    };

    Object.entries(defaultSettings).forEach(([key, value]) => {
      const stmt = this.db!.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
      stmt.run([key, JSON.stringify(value)]);
      stmt.free();
    });
  }

  private migrate(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Check if port column exists in cameras table
    const pragma = this.db.prepare('PRAGMA table_info(cameras)');
    const columns: any[] = [];
    while (pragma.step()) {
      columns.push(pragma.getAsObject());
    }
    pragma.free();

    const hasPortColumn = columns.some((col) => col.name === 'port');

    if (!hasPortColumn) {
      console.log('Migrating: Adding port column to cameras table');
      this.db.run('ALTER TABLE cameras ADD COLUMN port INTEGER NOT NULL DEFAULT 554');
      this.save();
    }
  }

  private save(): void {
    if (!this.db) return;
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, data);
  }

  // Camera operations
  async getCameras(): Promise<Camera[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM cameras ORDER BY name');
    const result: any[] = [];
    while (stmt.step()) {
      result.push(stmt.getAsObject());
    }
    stmt.free();

    return result.map(row => ({
      ...row,
      enabled: row.enabled === 1,
      password: decryptPassword(row.password),
    }));
  }

  async getCamera(id: string): Promise<Camera | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM cameras WHERE id = ?');
    stmt.bind([id]);
    const hasRow = stmt.step();
    if (!hasRow) {
      stmt.free();
      return null;
    }
    const result = stmt.getAsObject() as any;
    stmt.free();

    return {
      ...result,
      enabled: result.enabled === 1,
      password: decryptPassword(result.password),
    };
  }

  async addCamera(camera: Omit<Camera, 'id' | 'createdAt' | 'updatedAt'>): Promise<Camera> {
    if (!this.db) throw new Error('Database not initialized');

    // Generate UUID using a simple method
    const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    const now = new Date().toISOString();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO cameras (id, name, brand, rtspUrl, port, username, password, mainStreamPath, 
                             subStreamPath, preferredQuality, enabled, onvifEndpoint, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run([
        id,
        camera.name,
        camera.brand,
        camera.rtspUrl,
        camera.port || 554,
        camera.username || null,
        encryptPassword(camera.password),
        camera.mainStreamPath,
        camera.subStreamPath || null,
        camera.preferredQuality,
        camera.enabled ? 1 : 0,
        camera.onvifEndpoint || null,
        now,
        now,
      ]);
      stmt.free();

      this.save();
      const result = await this.getCamera(id);
      return result as Camera;
    } catch (error) {
      console.error('addCamera error:', error);
      throw error;
    }
  }

  async updateCamera(id: string, camera: Partial<Camera>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const updates: string[] = [];
    const values: any[] = [];

    Object.entries(camera).forEach(([key, value]) => {
      if (key === 'id' || key === 'createdAt') return;
      if (key === 'enabled') {
        updates.push(`${key} = ?`);
        values.push(value ? 1 : 0);
      } else if (key === 'password') {
        updates.push(`${key} = ?`);
        values.push(encryptPassword(value as string));
      } else if (value !== undefined) {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (updates.length === 0) return;

    updates.push('updatedAt = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const stmt = this.db.prepare(`UPDATE cameras SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(values);
    stmt.free();

    this.save();
  }

  async deleteCamera(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM cameras WHERE id = ?');
    stmt.run([id]);
    stmt.free();

    this.save();
  }

  // Settings operations
  async getSettings(): Promise<Settings> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM settings');
    const result: any[] = [];
    while (stmt.step()) {
      result.push(stmt.getAsObject());
    }
    stmt.free();

    const settings: Partial<Settings> = {};
    result.forEach(row => {
      settings[row.key as keyof Settings] = JSON.parse(row.value);
    });

    return settings as Settings;
  }

  async updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    stmt.run([key, JSON.stringify(value)]);
    stmt.free();

    this.save();
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const databaseService = new DatabaseService();
