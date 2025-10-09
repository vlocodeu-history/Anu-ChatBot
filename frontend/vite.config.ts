import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // 👈 enables "@/services/..."
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://anu-chatbot.onrender.com',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'https://anu-chatbot.onrender.com',  // ← Changed from ws:// to http://
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
