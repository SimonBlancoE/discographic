import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

const apiPort = process.env.VITE_API_PORT || 3800;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, '.worktrees/**'],
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
