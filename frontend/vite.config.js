import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `host: true` exposes the dev server on your LAN so you can test from a phone:
// http://<your-pc-ip>:5173
// API_URL points /api somewhere other than the local backend (default http://localhost:3000).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: { '/api': process.env.API_URL || 'http://localhost:3000' },
  },
});
