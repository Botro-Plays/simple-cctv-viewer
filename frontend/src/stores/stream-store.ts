import { create } from 'zustand';
import { StreamStatus } from '../../../electron/shared/types';

interface StreamStore {
  streams: Map<string, StreamStatus>;
  setStreamStatus: (cameraId: string, status: StreamStatus) => void;
  removeStream: (cameraId: string) => void;
  clearAllStreams: () => void;
}

export const useStreamStore = create<StreamStore>((set) => ({
  streams: new Map(),
  setStreamStatus: (cameraId, status) =>
    set((state) => {
      const newStreams = new Map(state.streams);
      newStreams.set(cameraId, status);
      return { streams: newStreams };
    }),
  removeStream: (cameraId) =>
    set((state) => {
      const newStreams = new Map(state.streams);
      newStreams.delete(cameraId);
      return { streams: newStreams };
    }),
  clearAllStreams: () => set({ streams: new Map() }),
}));
