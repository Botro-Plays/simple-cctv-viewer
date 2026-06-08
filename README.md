# Randiris Home CCTV-Viewer

A lightweight, self-hosted CCTV viewer application designed for home use.

**Developer:** Botro

## Features

- Multi-camera support (up to 32 cameras)
- Grid layouts (1x1, 2x2, 3x3, 4x4)
- Quality modes (Low, Medium, High)
- Camera templates for popular PH brands
- Low latency streaming via MJPEG over HTTP
- Snapshot capture
- Basic recording with retention management
- Desktop-first architecture (Electron)
- Single executable deployment

## Supported Camera Brands

- Hikvision
- Dahua
- TP-Link Tapo
- Xiaomi
- Reolink
- Ezviz
- IMOU

## Architecture

### Tech Stack

- **Frontend:** React + Vite + TypeScript + TailwindCSS + shadcn/ui
- **Backend:** Fastify (Node.js) embedded in Electron
- **Desktop Shell:** Electron
- **Database:** SQLite (via sql.js)
- **Streaming:** FFmpeg (RTSP → MJPEG, shared per camera)

### Streaming Architecture (Key Decision)

The application uses **shared FFmpeg processes** to convert RTSP to MJPEG. This approach was chosen because:

1. **Single RTSP connection limitation:** Many IP cameras (e.g., TP-Link Tapo) only support one active RTSP connection at a time.
2. **Multiple viewers per camera:** Grid view and modal view must share the same RTSP stream without duplicating connections.
3. **Client tracking:** Each HTTP client is tracked in a `Map<string, ServerResponse>` within an `ActiveStream` per camera. Frames from FFmpeg stdout are broadcast to all connected clients.
4. **Proper cleanup:** Frontend uses `useLayoutEffect` to set `img.src = ''` on unmount, forcing Chrome to abort the underlying TCP connection. Backend listens for `request.raw.on('close')`, `reply.raw.on('close')`, and `reply.raw.on('error')` to remove dead clients.
5. **FFmpeg lifecycle:** FFmpeg is spawned on first client and killed after 30 seconds of no clients. A 5-second cleanup interval purges dead sockets and idle streams.

### Project Structure

```
simple-cctv-viewer/
├── electron/
│   ├── main/              # Electron main process
│   ├── preload/           # Preload script (IPC bridge)
│   ├── services/          # Backend services
│   │   ├── backend/       # Fastify API (MJPEG streaming, camera CRUD)
│   │   ├── database/      # SQLite database
│   │   └── go2rtc/        # Stream relay management (unused - kept for future)
│   └── shared/            # Shared TypeScript types
├── frontend/
│   ├── src/
│   │   ├── components/    # React components (VideoPlayer, etc.)
│   │   ├── pages/         # Page components (Dashboard, etc.)
│   │   ├── stores/        # Zustand state management
│   │   └── lib/           # Utilities
│   └── package.json
├── resources/
│   ├── go2rtc/            # go2rtc binary (unused - kept for future HLS/WebRTC)
│   └── ffmpeg/            # FFmpeg binary (active: RTSP → MJPEG)
└── package.json
```

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Running in Development

```bash
# Start both Electron and Vite dev server
npm run dev
```

### Building

```bash
# Build for production
npm run build

# Build for Windows
npm run dist:win

# Build for Linux
npm run dist:linux
```

## Usage

1. **Add Cameras:** Navigate to the Cameras page and add your RTSP cameras
2. **Configure Settings:** Adjust quality, recording, and security preferences
3. **View Live Streams:** Use the Dashboard to view multiple cameras in grid layout

## Camera Configuration

### RTSP URL Format

```
rtsp://username:password@IP:PORT/stream_path
```

### Common RTSP Paths

- **Hikvision:** `/Streaming/Channels/101` (main), `/Streaming/Channels/102` (sub)
- **Dahua:** `/cam/realmonitor?channel=1&subtype=0` (main), `/cam/realmonitor?channel=1&subtype=1` (sub)
- **TP-Link Tapo:** `/stream1` (main), `/stream2` (sub)
- **Reolink:** `/h264Preview_01_main` (main), `/h264Preview_01_sub` (sub)

## Data Storage

- **Database:** `%APPDATA%/randiris-cctv-viewer/sqlite/cctv-viewer.db` (Windows)
- **Recordings:** `%APPDATA%/randiris-cctv-viewer/recordings/`
- **Snapshots:** `%APPDATA%/randiris-cctv-viewer/snapshots/`
- **go2rtc Config:** `%APPDATA%/randiris-cctv-viewer/go2rtc/config.yaml`

## Performance

### Target Hardware

- Intel N100
- Old Intel i5 systems
- Mini PCs
- Small home servers

### Resource Usage

- **CPU:** ~2-5% per camera (no transcoding if H.264)
- **Memory:** ~500-700MB for 16 cameras
- **Network:** ~2-4 Mbps per 1080p camera

## Security

- RTSP credentials encrypted at rest
- IPC communication via context bridge
- Local API binds to localhost only
- SSRF protection for RTSP URLs
- Optional PIN lock

## Known Issues & Learnings

### MJPEG Streaming

- **Chrome connection reuse bug:** Chrome aggressively reuses HTTP connections for identical URLs. MJPEG `<img>` streams with `multipart/x-mixed-replace` will appear broken if Chrome hands an old socket to a new request. Fixed by appending a unique `mountToken` per component mount.
- **Chrome does not close TCP on `<img>` unmount:** Simply removing an `<img>` from the DOM does not terminate the HTTP connection. The frontend must explicitly set `img.src = ''` in a `useLayoutEffect` cleanup to force Chrome to RST the socket.
- **Fastify v4 raw response handling:** Do NOT use `reply.hijack()` in Fastify v4. Instead, use `reply.raw.writeHead()` directly. Using `hijack()` causes the response to never finish properly, confusing Chrome and causing `ERR_INCOMPLETE_CHUNKED_ENCODING`.
- **Backpressure trap:** Do NOT remove clients on `client.write()` returning `false`. Node.js backpressure is temporary. Premature client removal caused all grid cameras to stop rendering simultaneously.

### Camera Compatibility

- TP-Link Tapo cameras support only **1 concurrent RTSP connection**. Any attempt to spawn a second FFmpeg for the same camera results in `406 Not Acceptable`. The shared-FFmpeg architecture is mandatory for these cameras.
- FFmpeg RTSP negotiation can take 2-4 seconds. The frontend `VideoPlayer` has a 4-second grace period showing "Connecting..." before declaring an error, and auto-retries up to 2 times.

## Roadmap

### Phase 1 (Current - In Progress)
- [x] Basic camera CRUD
- [x] MJPEG streaming with shared FFmpeg
- [x] Grid layouts (1x1, 2x2, 3x3, 4x4)
- [x] Modal/expanded view for individual cameras
- [x] Graceful loading states and auto-retry
- [ ] Snapshot capture from MJPEG stream
- [ ] Basic recording (segmented MP4 via FFmpeg)
- [ ] Recording playback / timeline view
- [ ] Recording retention policy

### Phase 2 (Future)
- [ ] HLS streaming via go2rtc (for browsers/devices that prefer HLS)
- [ ] ONVIF discovery and configuration
- [ ] PTZ (Pan/Tilt/Zoom) controls
- [ ] Motion detection / event alerts
- [ ] Multi-monitor support
- [ ] Mobile companion app

## License

MIT

## Version

1.0.0 (Phase 1)
