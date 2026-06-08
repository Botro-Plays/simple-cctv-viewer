import { create } from 'zustand';
import { Camera } from '../../../electron/shared/types';

interface CameraStore {
  cameras: Camera[];
  selectedCameraId: string | null;
  isLoading: boolean;
  error: string | null;
  setCameras: (cameras: Camera[]) => void;
  addCamera: (camera: Camera) => void;
  updateCamera: (id: string, camera: Partial<Camera>) => void;
  deleteCamera: (id: string) => void;
  selectCamera: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useCameraStore = create<CameraStore>((set) => ({
  cameras: [],
  selectedCameraId: null,
  isLoading: false,
  error: null,
  setCameras: (cameras) => set({ cameras }),
  addCamera: (camera) => set((state) => ({ cameras: [...state.cameras, camera] })),
  updateCamera: (id, camera) =>
    set((state) => ({
      cameras: state.cameras.map((c) => (c.id === id ? { ...c, ...camera } : c)),
    })),
  deleteCamera: (id) =>
    set((state) => ({
      cameras: state.cameras.filter((c) => c.id !== id),
      selectedCameraId: state.selectedCameraId === id ? null : state.selectedCameraId,
    })),
  selectCamera: (id) => set({ selectedCameraId: id }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
