export interface Camera {
  id: string;
  name: string;
  brand: string;
  rtspUrl: string;
  port: number;
  username?: string;
  password?: string;
  mainStreamPath: string;
  subStreamPath?: string;
  preferredQuality: 'LOW' | 'MEDIUM' | 'HIGH';
  enabled: boolean;
  onvifEndpoint?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StreamStatus {
  cameraId: string;
  status: 'CONNECTING' | 'ONLINE' | 'OFFLINE' | 'ERROR';
  quality: 'LOW' | 'MEDIUM' | 'HIGH';
  fps?: number;
  bitrate?: number;
  latency?: number;
  codec?: string;
  lastFrameTime?: string;
  reconnectCount: number;
}

export interface RecordingStatus {
  cameraId: string;
  isRecording: boolean;
  startTime?: string;
  fileSize?: number;
  segmentCount?: number;
}

export interface CameraTemplate {
  brand: string;
  models: string[];
  defaultPort: number;
  mainStreamPath: string;
  subStreamPath: string;
  authType: 'digest' | 'basic';
  notes: string;
}

export interface Settings {
  pinLockEnabled: boolean;
  pin?: string;
  autoStartEnabled: boolean;
  minimizeToTray: boolean;
  defaultQuality: 'LOW' | 'MEDIUM' | 'HIGH';
  retentionDays: number;
  maxRecordingSizeGB: number;
  gridSize?: '1x1' | '2x2' | '3x3' | '4x4';
}
