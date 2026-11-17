import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: [
      'morale-pushy-around.ngrok-free.dev',
      '.ngrok-free.dev',
      '.ngrok.io',
      '.ngrok.app',
      '.ngrok.dev',
    ],
    proxy: {
      '/api': 'http://127.0.0.1:4001',
      '/uploads': 'http://127.0.0.1:4001',
    },
  },
});
