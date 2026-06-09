// Type declarations for Electron API
declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>;
      getCameras: () => Promise<any[]>;
      addCamera: (camera: any) => Promise<any>;
      updateCamera: (id: string, camera: any) => Promise<any>;
      deleteCamera: (id: string) => Promise<any>;
      getSettings: () => Promise<any>;
      updateSettings: (settings: any) => Promise<any>;
      startStream: (cameraId: string, quality: 'LOW' | 'MEDIUM' | 'HIGH') => Promise<any>;
      stopStream: (cameraId: string) => Promise<any>;
      getStreamDiagnostics: (cameraId: string) => Promise<any>;
      onStreamStatus: (callback: (event: any, data: any) => void) => void;
      removeStreamStatusListener: () => void;
      onRecordingStatus: (callback: (event: any, data: any) => void) => void;
      removeRecordingStatusListener: () => void;
      getLogs: () => Promise<{ id: number; ts: string; level: string; msg: string }[]>;
      clearLogs: () => void;
      onLog: (callback: (entry: { id: number; ts: string; level: string; msg: string }) => void) => void;
      removeLogListener: () => void;
    };
  }
}

export const electronAPI = window.electronAPI;
