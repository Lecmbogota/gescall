import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'lucide-react',
      'recharts',
      'framer-motion',
      'sonner',
      'socket.io-client',
    ],
  },
  build: {
    outDir: '/var/www/gescall',
    emptyOutDir: true,
  },
  server: {
    allowedHosts: [
      'gescall.luiscaraballo.pro'
    ],
    port: 5173,
    host: true,
  },
});
