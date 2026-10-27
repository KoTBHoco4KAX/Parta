import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Прокси на backend в dev: один origin для fetch и WebSocket, без CORS и
// ручного указания хоста в каждом запросе.
const BACKEND = 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
      },
      '/ws': {
        target: BACKEND.replace('http', 'ws'),
        ws: true,
      },
    },
  },
});
