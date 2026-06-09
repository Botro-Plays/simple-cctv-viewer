import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  
  // Cameras
  getCameras: () => ipcRenderer.invoke('cameras:getAll'),
  addCamera: (camera: any) => ipcRenderer.invoke('cameras:add', camera),
  updateCamera: (id: string, camera: any) => ipcRenderer.invoke('cameras:update', id, camera),
  deleteCamera: (id: string) => ipcRenderer.invoke('cameras:delete', id),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings: any) => ipcRenderer.invoke('settings:update', settings),

  // Streams
  startStream: (cameraId: string, quality: 'LOW' | 'MEDIUM' | 'HIGH') => 
    ipcRenderer.invoke('streams:start', cameraId, quality),
  stopStream: (cameraId: string) => ipcRenderer.invoke('streams:stop', cameraId),
  getStreamDiagnostics: (cameraId: string) => ipcRenderer.invoke('streams:diagnostics', cameraId),
  
  // Logs
  getLogs: () => ipcRenderer.invoke('logs:get'),
  clearLogs: () => ipcRenderer.send('logs:clear'),
  onLog: (callback: (entry: any) => void) => {
    ipcRenderer.on('logs:entry', (_event, entry) => callback(entry));
  },
  removeLogListener: () => ipcRenderer.removeAllListeners('logs:entry'),

  // Events
  onStreamStatus: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('streams:status', callback);
  },
  removeStreamStatusListener: () => {
    ipcRenderer.removeAllListeners('streams:status');
  },
  
  onRecordingStatus: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('recording:status', callback);
  },
  removeRecordingStatusListener: () => {
    ipcRenderer.removeAllListeners('recording:status');
  },
});
