import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, Loader } from 'lucide-react';
import { useStreamStore } from '../stores/stream-store';

const API_BASE = 'http://127.0.0.1:3000';

interface VideoPlayerProps {
  cameraId: string;
  streamType?: 'mjpeg';
  className?: string;
  style?: React.CSSProperties;
  connectTimeoutMs?: number;
  enabled?: boolean;
}

export function VideoPlayer({
  cameraId,
  streamType = 'mjpeg',
  className = '',
  style,
  connectTimeoutMs = 8000,
  enabled = true,
}: VideoPlayerProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retryKey, setRetryKey] = useState(0);
  const [autoRetryCount, setAutoRetryCount] = useState(0);
  // Unique per-mount token prevents Chrome from reusing zombie HTTP connections
  const [mountToken] = useState(() => Math.random().toString(36).slice(2, 8));

  const { setStreamStatus, removeStream } = useStreamStore();

  const streamSrc = `${API_BASE}/api/streams/${cameraId}/mjpeg?m=${mountToken}&k=${retryKey}`;

  // use refs for async callbacks to avoid stale closures
  const statusRef = useRef(status);
  statusRef.current = status;
  const autoRetryCountRef = useRef(autoRetryCount);
  autoRetryCountRef.current = autoRetryCount;

  // Main stream handler: fetch() + manual JPEG frame extraction.
  // Chrome/Electron's <img> MJPEG parser freezes in production when the
  // page is loaded from file://. We bypass it by reading the raw stream,
  // finding JPEG SOI/EOI markers, and feeding each frame as a Blob URL.
  useEffect(() => {
    if (!enabled) {
      setStatus('loading');
      return;
    }

    setStatus('loading');
    const abortController = new AbortController();
    let isActive = true;
    let latestFrame = 0;

    const img = imgRef.current;

    fetch(streamSrc, { signal: abortController.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!response.body) throw new Error('No response body');

        const reader = response.body.getReader();
        let buffer = new Uint8Array(0);
        let totalBytes = 0;
        let framesFound = 0;

        while (isActive) {
          const { done, value } = await reader.read();
          if (done) break;

          totalBytes += value.length;

          // Append new bytes
          const next = new Uint8Array(buffer.length + value.length);
          next.set(buffer);
          next.set(value, buffer.length);
          buffer = next;

          // Extract JPEG frames: SOI = 0xFF 0xD8, EOI = 0xFF 0xD9
          let i = 0;
          while (i < buffer.length - 1) {
            if (buffer[i] === 0xFF && buffer[i + 1] === 0xD8) {
              let foundEoi = false;
              for (let j = i + 2; j < buffer.length - 1; j++) {
                if (buffer[j] === 0xFF && buffer[j + 1] === 0xD9) {
                  const frame = buffer.slice(i, j + 2);
                  buffer = buffer.slice(j + 2);
                  i = 0;
                  framesFound++;

                  if (isActive) {
                    const myFrame = ++latestFrame;
                    const blob = new Blob([frame], { type: 'image/jpeg' });
                    const url = URL.createObjectURL(blob);

                    // Decode offscreen first, then assign to visible img
                    const tempImg = new Image();
                    tempImg.onload = () => {
                      if (!isActive) {
                        URL.revokeObjectURL(url);
                        return;
                      }
                      if (myFrame !== latestFrame) {
                        URL.revokeObjectURL(url); // Skipped (older frame)
                        return;
                      }
                      if (img) {
                        const oldSrc = img.src;
                        img.src = url;
                        blobUrlRef.current = url;
                        if (oldSrc && oldSrc.startsWith('blob:')) {
                          URL.revokeObjectURL(oldSrc);
                        }
                        if (statusRef.current !== 'loaded') {
                          setStatus('loaded');
                          setAutoRetryCount(0);
                          setStreamStatus(cameraId, { cameraId, status: 'ONLINE', quality: 'MEDIUM', reconnectCount: autoRetryCountRef.current });
                        }
                      }
                    };
                    tempImg.onerror = () => URL.revokeObjectURL(url);
                    tempImg.src = url;
                  }
                  foundEoi = true;
                  break;
                }
              }
              if (!foundEoi) break;
            } else {
              i++;
            }
          }

          // Prevent buffer from growing too large
          if (buffer.length > 5 * 1024 * 1024) {
            buffer = buffer.slice(buffer.length - 1024 * 1024);
          }
        }

      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.error(`Stream error (${cameraId.slice(0, 8)}):`, err);
          if (isActive) {
            if (autoRetryCountRef.current < 5) {
              setAutoRetryCount(c => c + 1);
              setRetryKey(k => k + 1);
              setStreamStatus(cameraId, { cameraId, status: 'CONNECTING', quality: 'MEDIUM', reconnectCount: autoRetryCountRef.current });
            } else {
              setStatus('error');
              setStreamStatus(cameraId, { cameraId, status: 'ERROR', quality: 'MEDIUM', reconnectCount: autoRetryCountRef.current });
            }
          }
        }
      });

    // Fallback: show error if no frame arrives within connectTimeoutMs
    const timeout = setTimeout(() => {
      if (isActive && statusRef.current === 'loading') {
        if (autoRetryCountRef.current < 5) {
          setAutoRetryCount(c => c + 1);
          setRetryKey(k => k + 1);
        } else {
          setStatus('error');
        }
      }
    }, connectTimeoutMs);

    return () => {
      isActive = false;
      clearTimeout(timeout);
      abortController.abort();
      if (imgRef.current) {
        imgRef.current.src = '';
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      removeStream(cameraId);
    };
  }, [streamSrc, enabled, cameraId]);

  const handleManualRetry = () => {
    setAutoRetryCount(0);
    setRetryKey(k => k + 1);
    setStatus('loading');
  };

  if (!enabled) {
    return (
      <div className={`flex items-center justify-center bg-black ${className}`} style={style}>
        <div className="text-center space-y-2">
          <Camera className="w-12 h-12 text-gray-600 mx-auto" />
          <p className="text-sm text-gray-500">Offline</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative bg-black w-full h-full ${className}`} style={style}>
      <img
        ref={imgRef}
        alt={`Camera ${cameraId}`}
        className="w-full h-full object-contain transition-opacity duration-300"
        style={{ opacity: status === 'loaded' ? 1 : 0 }}
      />

      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3">
          <Loader className="w-8 h-8 text-gray-400 animate-spin" />
          <p className="text-sm text-gray-400">Connecting...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3">
          <Camera className="w-12 h-12 text-gray-600" />
          <p className="text-sm text-gray-500">Stream disconnected</p>
          <button
            onClick={handleManualRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Retry now
          </button>
        </div>
      )}

      {status === 'loaded' && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 text-xs text-green-500 bg-black/60 px-2 py-1 rounded">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> LIVE
        </div>
      )}
    </div>
  );
}
