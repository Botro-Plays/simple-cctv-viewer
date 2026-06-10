import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Camera } from '../../../electron/shared/types';
import { useCameraStore } from '../stores/camera-store';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Video, Plus, X, Eye, EyeOff } from 'lucide-react';
import { electronAPI } from '../lib/api';
import { VideoPlayer } from '../components/VideoPlayer';
import { useStreamStore } from '../stores/stream-store';

interface DashboardProps {
  onAddCamera: () => void;
}

export default function Dashboard({ onAddCamera }: DashboardProps) {
  const { cameras, setCameras, isLoading, setLoading, setError } = useCameraStore();
  const [gridSize, setGridSize] = useState<'1x1' | '2x2' | '3x3' | '4x4'>('2x2');
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedCamera, setExpandedCamera] = useState<Camera | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { streams } = useStreamStore();
  const onlineCount = useMemo(() => {
    let count = 0;
    for (const s of streams.values()) {
      if (s.status === 'ONLINE') count++;
    }
    return count;
  }, [streams]);

  const handleCameraClick = (camera: Camera) => {
    setExpandedCamera(camera);
  };

  const handleCloseModal = () => {
    setExpandedCamera(null);
  };

  useEffect(() => {
    setCurrentPage(0);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [gridSize]);

  useEffect(() => {
    loadCameras();
  }, []);

  const loadCameras = async () => {
    try {
      setLoading(true);
      const data = await electronAPI.getCameras();
      setCameras(data);
    } catch (error) {
      console.error('Failed to load cameras:', error);
      setError('Failed to load cameras');
    } finally {
      setLoading(false);
    }
  };

  const getGridConfig = () => {
    switch (gridSize) {
      case '1x1':
        return {
          cols: 1,
          rows: 1,
          perPage: 1,
        };
      case '2x2':
        return {
          cols: 2,
          rows: 2,
          perPage: 4,
        };
      case '3x3':
        return {
          cols: 3,
          rows: 3,
          perPage: 9,
        };
      case '4x4':
        return {
          cols: 4,
          rows: 4,
          perPage: 16,
        };
      default:
        return {
          cols: 2,
          rows: 2,
          perPage: 4,
        };
    }
  };


  // Chunk cameras into pages for CCTV-style paging
  const chunkCamerasIntoPages = () => {
    const { perPage } = getGridConfig();

    const pages = [];

    for (let i = 0; i < enabledCameras.length; i += perPage) {
      pages.push(enabledCameras.slice(i, i + perPage));
    }

    return pages;
  };

  const enabledCameras = cameras.filter((c) => c.enabled);
  const cameraPages = chunkCamerasIntoPages();
  const totalPages = cameraPages.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading cameras...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden relative">
      {/* Header */}
      <header className="border-b px-4 md:px-6 py-3 md:py-4 flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold truncate">Randiris Home CCTV-Viewer</h1>
          <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">
            {enabledCameras.length} camera{enabledCameras.length !== 1 ? 's' : ''}
            {' '}&mdash;{' '}
            <span className={onlineCount > 0 ? 'text-green-500' : 'text-muted-foreground'}>
              {onlineCount} online
            </span>
            {' '}&mdash; Page {totalPages > 0 ? currentPage + 1 : 0} / {totalPages}
          </p>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs md:text-sm text-muted-foreground hidden sm:inline">Grid:</span>
            <select
              value={gridSize}
              onChange={(e) => {
                setGridSize(e.target.value as any);
                setCurrentPage(0);
              }}
              className="px-2 md:px-3 py-1.5 rounded-md border border-input bg-background text-xs md:text-sm"
            >
              <option value="1x1">1x1</option>
              <option value="2x2">2x2</option>
              <option value="3x3">3x3</option>
              <option value="4x4">4x4</option>
            </select>
          </div>
        </div>
      </header>

      {/* Camera Grid */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto snap-y snap-mandatory overscroll-y-contain"
        onScroll={(e) => {
          const el = e.currentTarget;
          const newPage = Math.round(el.scrollTop / el.clientHeight);
          if (newPage !== currentPage && newPage >= 0 && newPage < totalPages) {
            setCurrentPage(newPage);
          }
        }}
      >
        {enabledCameras.length === 0 ? (
          <div className="h-full flex items-center justify-center p-4">
            <Card className="max-w-md w-full">
              <CardHeader>
                <CardTitle className="text-lg md:text-xl">No Cameras Configured</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm md:text-base text-muted-foreground mb-4">
                  Add your first camera to start viewing live streams.
                </p>
                <Button onClick={onAddCamera} className="w-full sm:w-auto">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Camera
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          cameraPages.map((pageCameras, pageIndex) => {
            const config = getGridConfig();
            return (
              <section
                key={pageIndex}
                data-page={pageIndex}
                className="snap-start w-full"
                style={{ height: '100%' }}
              >
                <div
                  className="w-full h-full p-1 md:p-2"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${config.rows}, minmax(0, 1fr))`,
                    gap: '4px',
                    boxSizing: 'border-box',
                  }}
                >
                  {pageCameras.map((camera, idx) => (
                    <CameraCard
                      key={camera.id}
                      camera={camera}
                      connectionDelay={idx * 600}
                      onClick={() => handleCameraClick(camera)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      {/* Page Navigation Dots */}
      {totalPages > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setCurrentPage(i);
                if (scrollContainerRef.current) {
                  scrollContainerRef.current.scrollTo({
                    top: i * scrollContainerRef.current.clientHeight,
                    behavior: 'smooth',
                  });
                }
              }}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                i === currentPage ? 'bg-primary' : 'bg-primary/30 hover:bg-primary/50'
              }`}
              aria-label={`Go to page ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* Expanded Camera Modal */}
      {expandedCamera && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50" onClick={handleCloseModal}>
          <div className="w-full max-w-5xl bg-gray-900 rounded-xl border border-gray-800 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-white">{expandedCamera.name}</span>
              </div>
              <button onClick={handleCloseModal} className="p-1 hover:bg-gray-800 rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <VideoPlayer
              cameraId={expandedCamera.id}
              streamType="mjpeg"
              className="w-full"
              style={{ height: '70vh' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CameraCard({
  camera,
  connectionDelay,
  onClick,
}: {
  camera: Camera;
  connectionDelay?: number;
  onClick: () => void;
}) {
  const [isPrivate, setIsPrivate] = useState(false);

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-black rounded-md cursor-pointer ring-1 ring-white/10 hover:ring-2 hover:ring-primary transition-all"
      onClick={onClick}
    >
      {/* Video always runs so stream stays alive */}
      <VideoPlayer
        cameraId={camera.id}
        streamType="mjpeg"
        className="w-full h-full"
        connectionDelay={connectionDelay}
      />

      {/* Privacy overlay — covers video but keeps stream running */}
      {isPrivate && (
        <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center gap-2 z-20">
          <EyeOff className="w-8 h-8 text-gray-600" />
          <p className="text-[10px] text-gray-500 font-medium">Privacy Mode</p>
        </div>
      )}

      {/* Overlay Header */}
      <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/75 to-transparent px-2 py-1.5">
        <div className="flex items-center justify-between gap-1">
          <h3 className="text-white text-[10px] md:text-xs font-medium truncate leading-tight pointer-events-none">
            {camera.name}
          </h3>
          <div className="flex items-center gap-1">
            <Badge
              variant="outline"
              className="bg-black/40 text-white border-white/20 text-[9px] md:text-[10px] shrink-0 px-1 py-0 leading-tight pointer-events-none"
            >
              {camera.brand}
            </Badge>
            <button
              onClick={(e) => { e.stopPropagation(); setIsPrivate(p => !p); }}
              title={isPrivate ? 'Disable privacy mode' : 'Enable privacy mode'}
              className="p-0.5 rounded text-white/60 hover:text-white hover:bg-black/40 transition-colors"
            >
              {isPrivate
                ? <EyeOff className="w-3 h-3 md:w-3.5 md:h-3.5" />
                : <Eye className="w-3 h-3 md:w-3.5 md:h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
