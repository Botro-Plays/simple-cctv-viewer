import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: path.resolve(__dirname, 'electron/main/index.ts'),
        formats: ['cjs'],
      },
      outDir: 'out/main',
      rollupOptions: {
        external: ['sql.js'],
      },
    },
  },
  preload: {
    build: {
      lib: {
        entry: path.resolve(__dirname, 'electron/preload/index.ts'),
        formats: ['cjs'],
      },
      outDir: 'out/preload',
    },
  },
  renderer: {
    root: 'frontend',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'frontend/index.html'),
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'frontend/src'),
      },
    },
  },
});
