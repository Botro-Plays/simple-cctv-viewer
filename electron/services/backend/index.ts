import Fastify from 'fastify';
import { app } from 'electron';
import { databaseService } from '../database';
import { Camera } from '../../shared/types';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

interface ActiveStream {
  ffmpeg: any;
  clients: Map<string, any>;
  cameraId: string;
  rtspUrl: string;
  lastClientAt: number;
  lastFrameAt: number;
}

export class BackendService {
  private server: any;
  private port: number = 3000;
  private activeStreams = new Map<string, ActiveStream>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private ffmpegPathCache: string | null = null;

  constructor() {
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    this.server = Fastify({
      logger: isDev ? true : false,
    });

    // Cleanup interval: purge dead clients and kill idle FFmpeg processes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [cameraId, stream] of this.activeStreams.entries()) {
        const deadClients: string[] = [];
        for (const [clientId, client] of stream.clients) {
          if (client.writableEnded || client.destroyed) {
            deadClients.push(clientId);
          }
        }
        for (const id of deadClients) {
          stream.clients.delete(id);
        }
        if (deadClients.length > 0) {
          console.log(`[Stream] Cleanup removed ${deadClients.length} dead clients from camera ${cameraId} (remaining: ${stream.clients.size})`);
        }

        if (stream.clients.size === 0 && (now - stream.lastClientAt) > 30000) {
          console.log(`[Stream] No clients for camera ${cameraId} for 30s, killing FFmpeg`);
          this.killFfmpeg(stream.ffmpeg);
          this.activeStreams.delete(cameraId);
        }
      }
    }, 5000);
  }

  async stop(): Promise<void> {
    for (const stream of this.activeStreams.values()) {
      this.killFfmpeg(stream.ffmpeg);
    }
    this.activeStreams.clear();
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    await this.server.close();
  }

  async initialize(): Promise<void> {
    for (const stream of this.activeStreams.values()) {
      this.killFfmpeg(stream.ffmpeg);
    }
    this.activeStreams.clear();

    await this.setupRoutes();
    await this.setupErrorHandling();
  }

  private async setupRoutes(): Promise<void> {
    // Health check
    this.server.get('/health', async () => {
      return { status: 'ok' };
    });

    // Camera routes
    this.server.get('/api/cameras', async () => {
      return await databaseService.getCameras();
    });

    this.server.get('/api/cameras/:id', async (request: any) => {
      const camera = await databaseService.getCamera(request.params.id);
      if (!camera) {
        throw this.server.httpErrors.notFound('Camera not found');
      }
      return camera;
    });

    this.server.post('/api/cameras', async (request: any) => {
      const existingCameras = await databaseService.getCameras();

      if (existingCameras.length >= 32) {
        throw this.server.httpErrors.badRequest('Camera limit reached (maximum 32 cameras)');
      }

      // Check for duplicate RTSP URL
      const isDuplicate = existingCameras.some((cam: any) => 
        cam.rtspUrl === request.body.rtspUrl && 
        Number(cam.port) === Number(request.body.port) &&
        cam.mainStreamPath === request.body.mainStreamPath
      );
      
      if (isDuplicate) {
        throw this.server.httpErrors.badRequest('A camera with this RTSP URL already exists');
      }
      
      const result = await databaseService.addCamera(request.body);
      return result;
    });

    this.server.put('/api/cameras/:id', async (request: any) => {
      // Check for duplicate RTSP URL (excluding current camera)
      const existingCameras = await databaseService.getCameras();
      const isDuplicate = existingCameras.some((cam: any) => 
        cam.id !== request.params.id &&
        cam.rtspUrl === request.body.rtspUrl && 
        Number(cam.port) === Number(request.body.port) &&
        cam.mainStreamPath === request.body.mainStreamPath
      );
      
      if (isDuplicate) {
        throw this.server.httpErrors.badRequest('A camera with this RTSP URL already exists');
      }
      
      await databaseService.updateCamera(request.params.id, request.body);
      return { success: true };
    });

    this.server.delete('/api/cameras/:id', async (request: any) => {
      await databaseService.deleteCamera(request.params.id);
      return { success: true };
    });

    // Settings routes
    this.server.get('/api/settings', async () => {
      return await databaseService.getSettings();
    });

    this.server.put('/api/settings', async (request: any) => {
      for (const [key, value] of Object.entries(request.body)) {
        await databaseService.updateSetting(key as any, value);
      }
      return { success: true };
    });

    // Camera templates
    this.server.get('/api/templates', async () => {
      return this.getCameraTemplates();
    });

    // Stream routes - MJPEG direct streaming via FFmpeg (shared across clients)
    this.server.get('/api/streams/:cameraId/mjpeg', (request: any, reply: any) => {
      const cameraId = request.params.cameraId;
      console.log(`GET /api/streams/${cameraId}/mjpeg`);

      // IMPORTANT: return the Promise so Fastify waits and does NOT send a
      // premature empty 200 response that races against writeHead().
      return new Promise<void>((resolveHandler) => {
      databaseService.getCamera(cameraId).then((camera: any) => {
        if (!camera) {
          console.log(`Camera not found: ${cameraId}`);
          reply.status(404).send({ error: 'Camera not found' });
          resolveHandler();
          return;
        }

        const encodedUsername = encodeURIComponent(camera.username || '');
        const encodedPassword = encodeURIComponent(camera.password || '');
        const rtspUrl = `rtsp://${encodedUsername}:${encodedPassword}@${camera.rtspUrl}:${camera.port}${camera.mainStreamPath}`;

        reply.raw.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        });

        let stream = this.activeStreams.get(cameraId);
        const now = Date.now();
        const isStale = stream && (now - stream.lastFrameAt) > 10000;

        if (stream && stream.rtspUrl === rtspUrl && !isStale) {
          // Reuse existing FFmpeg
          const clientId = Math.random().toString(36).slice(2, 10);
          stream.clients.set(clientId, reply.raw);
          stream.lastClientAt = now;
          console.log(`[Stream] Reusing FFmpeg for camera ${cameraId}, client ${clientId} added (total: ${stream.clients.size})`);

          const removeClient = () => {
            const s = this.activeStreams.get(cameraId);
            if (s && s.clients.has(clientId)) {
              s.clients.delete(clientId);
              s.lastClientAt = Date.now();
              console.log(`[Stream] Client ${clientId} disconnected from camera ${cameraId} (remaining: ${s.clients.size})`);
            }
          };

          let handlerResolved = false;
          const resolveOnce = () => { if (!handlerResolved) { handlerResolved = true; resolveHandler(); } };

          request.raw.on('close', () => { removeClient(); resolveOnce(); });
          reply.raw.on('close', () => { removeClient(); resolveOnce(); });
          reply.raw.on('error', () => { removeClient(); resolveOnce(); });
        } else {
          // Start new FFmpeg
          if (stream) {
            if (isStale) {
              console.log(`[Stream] FFmpeg stale for camera ${cameraId}, respawning`);
              for (const [, client] of stream.clients) {
                try { if (!client.writableEnded && !client.destroyed) client.end(); } catch {}
              }
            }
            this.killFfmpeg(stream.ffmpeg);
            this.activeStreams.delete(cameraId);
          }

          const sanitizedUrl = rtspUrl.replace(/\/\/[^:]+:[^@]+@/, '//**:**@');
          console.log(`[Stream] Starting new FFmpeg for camera ${camera.name}: ${sanitizedUrl}`);

          const ffmpegPath = this.resolveFfmpegPath();

          const ffmpeg = spawn(ffmpegPath, [
            '-rtsp_transport', 'tcp',
            '-i', rtspUrl,
            '-f', 'mjpeg',
            '-q:v', '5',
            '-r', '10',
            '-vf', 'scale=1280:-2,format=yuvj420p',
            '-an',
            'pipe:1'
          ], {
            stdio: ['ignore', 'pipe', 'pipe']
          });

          console.log(`[FFmpeg] Spawned PID ${ffmpeg.pid} for camera ${cameraId}`);

          let buffer = Buffer.alloc(0);
          const SOI = Buffer.from([0xFF, 0xD8]);
          const EOI = Buffer.from([0xFF, 0xD9]);

          const currentFfmpeg = ffmpeg;
          ffmpeg.stdout.on('data', (chunk: Buffer) => {
            buffer = Buffer.concat([buffer, chunk]);

            let startIdx = buffer.indexOf(SOI);
            while (startIdx !== -1) {
              const endIdx = buffer.indexOf(EOI, startIdx + 2);
              if (endIdx === -1) break;

              const frame = buffer.subarray(startIdx, endIdx + 2);
              const data = frame;

              const activeStream = this.activeStreams.get(cameraId);
              if (activeStream && activeStream.ffmpeg === currentFfmpeg) {
                activeStream.lastFrameAt = Date.now();
                const deadClients: string[] = [];
                for (const [clientId, client] of activeStream.clients) {
                  if (client.writableEnded || client.destroyed) {
                    deadClients.push(clientId);
                    continue;
                  }
                  try {
                    client.write(data);
                  } catch (err) {
                    deadClients.push(clientId);
                  }
                }
                if (deadClients.length > 0) {
                  console.log(`[Stream] Removing ${deadClients.length} dead clients from camera ${cameraId} (remaining: ${activeStream.clients.size - deadClients.length})`);
                  for (const id of deadClients) {
                    activeStream.clients.delete(id);
                  }
                }
              }

              buffer = buffer.subarray(endIdx + 2);
              startIdx = buffer.indexOf(SOI);
            }

            if (buffer.length > 5 * 1024 * 1024) {
              buffer = Buffer.alloc(0);
            }
          });

          let ffmpegStreamOpened = false;
          ffmpeg.stderr.on('data', (data: Buffer) => {
            const msg = data.toString().trim();
            if (!msg) return;
            for (const line of msg.split('\n')) {
              const l = line.trim();
              if (!l) continue;
              if (!ffmpegStreamOpened && l.includes('Stream #')) {
                ffmpegStreamOpened = true;
                console.log(`[FFmpeg:${camera.name}] stream opened:`, l);
              } else if (
                l.includes('error') || l.includes('Error') ||
                l.includes('Invalid') || l.includes('refused') ||
                l.includes('Unauthori') || l.includes('Bad Request') ||
                l.includes('timeout') || l.includes('CSeq') ||
                l.includes('Connection')
              ) {
                console.log(`[FFmpeg:${camera.name}] warn:`, l);
              }
            }
          });

          ffmpeg.on('close', (code: number) => {
            console.log(`[FFmpeg:${camera.name}] closed (code: ${code})`);
            const s = this.activeStreams.get(cameraId);
            if (s && s.ffmpeg === ffmpeg) this.activeStreams.delete(cameraId);
          });

          ffmpeg.on('error', (err: Error) => {
            console.error(`[FFmpeg:${camera.name}] spawn error:`, err.message);
            const s = this.activeStreams.get(cameraId);
            if (s && s.ffmpeg === ffmpeg) this.activeStreams.delete(cameraId);
          });

          stream = {
            ffmpeg,
            clients: new Map(),
            cameraId,
            rtspUrl,
            lastClientAt: Date.now(),
            lastFrameAt: Date.now(),
          };

          this.activeStreams.set(cameraId, stream);

          const clientId = Math.random().toString(36).slice(2, 10);
          stream.clients.set(clientId, reply.raw);
          console.log(`[Stream] Client ${clientId} added to new stream for camera ${cameraId}`);

          const removeClient = () => {
            const s = this.activeStreams.get(cameraId);
            if (s && s.clients.has(clientId)) {
              s.clients.delete(clientId);
              s.lastClientAt = Date.now();
              console.log(`[Stream] Client ${clientId} disconnected from camera ${cameraId} (remaining: ${s.clients.size})`);
            }
          };

          let handlerResolved = false;
          const resolveOnce = () => { if (!handlerResolved) { handlerResolved = true; resolveHandler(); } };

          request.raw.on('close', () => { removeClient(); resolveOnce(); });
          reply.raw.on('close', () => { removeClient(); resolveOnce(); });
          reply.raw.on('error', () => { removeClient(); resolveOnce(); });
        }

      }).catch((error: any) => {
        console.error('[MJPEG Stream] error:', error);
        if (!reply.raw.headersSent) {
          reply.status(500).send({ error: 'Failed to start stream' });
        }
        resolveHandler();
      });
      }); // end returned Promise
    });

    // Stream info endpoint (like alert system's /api/cctv/info)
    this.server.get('/api/streams/:cameraId/info', async (request: any) => {
      const cameraId = request.params.cameraId;
      const camera = await databaseService.getCamera(cameraId);
      if (!camera) {
        throw this.server.httpErrors.notFound('Camera not found');
      }
      return {
        cameraId: camera.id,
        hasLocalRtsp: !!camera.rtspUrl,
        mjpegUrl: `/api/streams/${camera.id}/mjpeg`,
      };
    });
  }

  private getCameraTemplates() {
    return [
      {
        brand: 'Hikvision',
        models: ['DS-2CD2xxx', 'DS-2CD3xxx', 'DS-2CD4xxx'],
        defaultPort: 554,
        mainStreamPath: '/Streaming/Channels/101',
        subStreamPath: '/Streaming/Channels/102',
        authType: 'digest',
        notes: 'Most Hikvision cameras use digest auth',
      },
      {
        brand: 'Dahua',
        models: ['IPC-HFW', 'IPC-HDB', 'SD4xxx'],
        defaultPort: 554,
        mainStreamPath: '/cam/realmonitor?channel=1&subtype=0',
        subStreamPath: '/cam/realmonitor?channel=1&subtype=1',
        authType: 'digest',
        notes: 'Subtype 0=main, 1=sub',
      },
      {
        brand: 'TP-Link Tapo',
        models: ['C100', 'C200', 'C210', 'C310', 'C320WS', 'C520WS', 'C420'],
        defaultPort: 554,
        mainStreamPath: '/stream1',
        subStreamPath: '/stream2',
        authType: 'basic',
        notes: 'Requires RTSP enabled in Tapo app. C520WS/C420/C320WS use H.265 main stream — use /stream2 for H.264 sub stream if main stream fails.',
      },
      {
        brand: 'Xiaomi',
        models: ['Mi Home Security', 'Yi Home'],
        defaultPort: 554,
        mainStreamPath: '/ch0_0.h264',
        subStreamPath: '/ch0_1.h264',
        authType: 'digest',
        notes: 'Some models require custom firmware for RTSP',
      },
      {
        brand: 'Reolink',
        models: ['RLC', 'E1', 'Argus'],
        defaultPort: 554,
        mainStreamPath: '/h264Preview_01_main',
        subStreamPath: '/h264Preview_01_sub',
        authType: 'basic',
        notes: 'Preview URL format',
      },
      {
        brand: 'Ezviz',
        models: ['C3N', 'C6N', 'C3W'],
        defaultPort: 554,
        mainStreamPath: '/h264/ch1/main/av_stream',
        subStreamPath: '/h264/ch1/sub/av_stream',
        authType: 'digest',
        notes: 'Requires Ezviz account for some models',
      },
      {
        brand: 'IMOU',
        models: ['Falcon', 'Ranger', 'Bullet'],
        defaultPort: 554,
        mainStreamPath: '/h264/ch1/main/av_stream',
        subStreamPath: '/h264/ch1/sub/av_stream',
        authType: 'digest',
        notes: 'Dahua OEM, similar URL structure',
      },
    ];
  }

  private setupErrorHandling(): void {
    this.server.setErrorHandler((error: any, request: any, reply: any) => {
      this.server.log.error(error);
      reply.status(error.statusCode || 500).send({
        error: error.message,
      });
    });
  }

  private killFfmpeg(ffmpeg: any): void {
    try {
      ffmpeg.kill('SIGTERM');
      setTimeout(() => {
        if (ffmpeg && !ffmpeg.killed) {
          try { ffmpeg.kill('SIGKILL'); } catch {}
        }
      }, 5000);
    } catch {}
  }

  private resolveFfmpegPath(): string {
    if (this.ffmpegPathCache) {
      return this.ffmpegPathCache;
    }

    const candidates: string[] = [];

    if (app.isPackaged) {
      candidates.push(path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe'));
      candidates.push(path.join(path.dirname(process.execPath), 'resources', 'ffmpeg', 'ffmpeg.exe'));
    }
    candidates.push(path.join(process.cwd(), 'resources', 'ffmpeg', 'ffmpeg.exe'));

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        this.ffmpegPathCache = p;
        console.log(`[FFmpeg] Using: ${p}`);
        return p;
      }
    }

    console.error(`[FFmpeg] WARNING: No FFmpeg binary found in any candidate path!`);
    return candidates[0];
  }

  async start(): Promise<void> {
    await this.server.listen({ port: this.port, host: '127.0.0.1' });
    console.log(`Backend server listening on http://127.0.0.1:${this.port}`);
  }
}

export const backendService = new BackendService();
