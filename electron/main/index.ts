import { app, BrowserWindow, ipcMain, Menu, powerSaveBlocker } from 'electron';
import path from 'path';
import fs from 'fs';
import { isDev } from './utils/env';
import { databaseService } from '../services/database';
import { backendService } from '../services/backend';
import { API_BASE } from '../shared/config';

let mainWindow: BrowserWindow | null = null;
let logsWindow: BrowserWindow | null = null;
let powerSaveBlockId: number | null = null;

// ── Log collector ────────────────────────────────────────────────────────────
interface LogEntry { id: number; ts: string; level: string; msg: string; }
const logBuffer: LogEntry[] = [];
let logSeq = 0;

function pushLog(level: string, args: any[]) {
  const entry: LogEntry = {
    id: ++logSeq,
    ts: new Date().toISOString(),
    level,
    msg: args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
  };
  logBuffer.push(entry);
  if (logBuffer.length > 500) logBuffer.shift();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('logs:entry', entry);
  }
  if (logsWindow && !logsWindow.isDestroyed()) {
    logsWindow.webContents.send('logs:entry', entry);
  }
}

const _log = console.log.bind(console);
const _warn = console.warn.bind(console);
const _error = console.error.bind(console);
console.log   = (...a) => { _log(...a);   pushLog('info',  a); };
console.warn  = (...a) => { _warn(...a);  pushLog('warn',  a); };
console.error = (...a) => { _error(...a); pushLog('error', a); };
// ─────────────────────────────────────────────────────────────────────────────

// Detect portable build data directory.
// electron-builder sets PORTABLE_EXECUTABLE_DIR to the folder containing the
// actual .exe file. Only fall back to process.execPath if it was NOT set by
// electron-builder (i.e. this is an installed build running in-place).
if (app.isPackaged) {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    console.log('Portable build detected, data directory:', process.env.PORTABLE_EXECUTABLE_DIR);
  }
  // Do NOT overwrite PORTABLE_EXECUTABLE_DIR — electron-builder already set it
  // to the correct location (next to the .exe). Overwriting it with
  // process.execPath would point to the temp extraction folder instead.
}

async function initializeServices() {
  console.log('Initializing services...');

  // Initialize database
  await databaseService.initialize();
  console.log('Database initialized');

  // Initialize and start backend
  await backendService.initialize();
  await backendService.start();
  console.log('Backend server started');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../../resources/icons/icon.png'),
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Forward renderer console logs into the log buffer (always, not just dev)
  mainWindow.webContents.on('console-message', (_ev, level, message) => {
    const labels = ['debug', 'info', 'warn', 'error'];
    const label = labels[level] || 'info';
    pushLog(label, [`[Renderer] ${message}`]);
    if (isDev) _log(`[Renderer:${label}] ${message}`);
  });

  // Remove default menu
  Menu.setApplicationMenu(null);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('minimize', (event: any) => {
    // TODO: Implement minimize to tray
  });
}

app.whenReady().then(async () => {
  try {
    await initializeServices();
    createWindow();

    // Prevent system from sleeping while app is running
    powerSaveBlockId = powerSaveBlocker.start('prevent-app-suspension');
    console.log('Power save blocker started');

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error('Failed to initialize services:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', (e) => {
  e.preventDefault();
  console.log('Cleaning up before quit...');

  if (powerSaveBlockId !== null) {
    powerSaveBlocker.stop(powerSaveBlockId);
  }

  backendService.stop()
    .catch((err) => console.error('Error stopping backend:', err))
    .finally(() => {
      databaseService.close();
      app.exit(0);
    });
});

// IPC handlers
ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('logs:get', () => [...logBuffer]);

ipcMain.on('logs:clear', () => { logBuffer.length = 0; });

ipcMain.handle('logs:openWindow', () => {
  if (logsWindow && !logsWindow.isDestroyed()) {
    logsWindow.focus();
    return;
  }

  logsWindow = new BrowserWindow({
    width: 960,
    height: 600,
    minWidth: 600,
    minHeight: 300,
    title: 'CCTV Viewer – Logs',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../../resources/icons/icon.png'),
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    logsWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?view=logs`);
  } else {
    logsWindow.loadFile(path.join(__dirname, '../renderer/index.html'), { query: { view: 'logs' } });
  }

  logsWindow.on('closed', () => { logsWindow = null; });
});

// Templates IPC handler
ipcMain.handle('templates:get', async () => {
  const response = await fetch(`${API_BASE}/api/templates`);
  if (!response.ok) throw new Error(`Failed to get templates: HTTP ${response.status}`);
  return response.json();
});

// Camera IPC handlers - proxy to backend
ipcMain.handle('cameras:getAll', async () => {
  const response = await fetch(`${API_BASE}/api/cameras`);
  if (!response.ok) throw new Error(`Failed to get cameras: HTTP ${response.status}`);
  return response.json();
});

ipcMain.handle('cameras:add', async (event, camera) => {
  const response = await fetch(`${API_BASE}/api/cameras`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(camera),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
});

ipcMain.handle('cameras:update', async (event, id, camera) => {
  const response = await fetch(`${API_BASE}/api/cameras/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(camera),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
});

ipcMain.handle('cameras:delete', async (event, id) => {
  const response = await fetch(`${API_BASE}/api/cameras/${id}`, {
    method: 'DELETE',
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
});

// Settings IPC handlers
ipcMain.handle('settings:get', async () => {
  const response = await fetch(`${API_BASE}/api/settings`);
  if (!response.ok) throw new Error(`Failed to get settings: HTTP ${response.status}`);
  return response.json();
});

ipcMain.handle('settings:update', async (event, settings) => {
  const response = await fetch(`${API_BASE}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
});

// Stream IPC handlers
ipcMain.handle('streams:start', async (event, cameraId, quality) => {
  // TODO: Implement stream start logic
  return { success: true };
});

ipcMain.handle('streams:stop', async (event, cameraId) => {
  // TODO: Implement stream stop logic
  return { success: true };
});

ipcMain.handle('streams:diagnostics', async (event, cameraId) => {
  // TODO: Implement stream diagnostics
  return { status: 'not_implemented' };
});
