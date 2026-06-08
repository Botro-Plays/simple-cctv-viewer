import { app, BrowserWindow, ipcMain, Menu, powerSaveBlocker } from 'electron';
import path from 'path';
import fs from 'fs';
import { isDev } from './utils/env';
import { databaseService } from '../services/database';
import { backendService } from '../services/backend';
import { API_BASE } from '../shared/config';

let mainWindow: BrowserWindow | null = null;
let powerSaveBlockId: number | null = null;

// Detect portable build and set environment variable
if (app.isPackaged) {
  const execPath = path.dirname(process.execPath);
  // Check if this is a portable build (no installation registry)
  // Portable builds typically have the executable in a folder with resources
  const isPortable = fs.existsSync(path.join(execPath, 'resources')) ||
                     fs.existsSync(path.join(execPath, '..', 'resources'));
  if (isPortable) {
    process.env.PORTABLE_EXECUTABLE_DIR = execPath;
    console.log('Portable build detected, data directory:', execPath);
  }
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

  // Forward renderer console logs to main process terminal (dev only)
  if (isDev) {
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      const labels = ['debug', 'log', 'warn', 'error'];
      const label = labels[level] || 'log';
      console.log(`[Renderer:${label}] ${message}`);
    });
  }

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
ipcMain.handle('app:getVersion', () => {
  return app.getVersion();
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
