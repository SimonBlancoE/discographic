import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const apiPort = process.env.VITE_API_PORT || 3800;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
