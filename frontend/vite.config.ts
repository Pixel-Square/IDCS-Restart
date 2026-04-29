import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
    // Debug aid: enable sourcemaps only when explicitly requested.
    // Usage: VITE_SOURCEMAP=true npm run build
    sourcemap: process.env.VITE_SOURCEMAP === 'true',
  },
  server: {
    host: true,
    allowedHosts: ['idcs.krgi.co.in', "idcs.zynix.us"],
     port: 80,
    // Dev convenience: when the frontend is served by Vite (often :80) and the
    // Django API is on a different port (often :8000), proxy `/api/...` so
    // same-origin API calls don't 404 with HTML.
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/fingerprint-bridge': {
        target: 'http://127.0.0.1:8889',
        changeOrigin: true,
      },
    },
    // Reduce watcher pressure by ignoring heavyweight folders
    watch: {
      // ignore large folders to save inotify watchers
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/backend/**',
        '**/staticfiles/**',
        '**/media/**'
      ],
      // fallback to polling when native watchers fail (safer, higher CPU)
      usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' || false,
      interval: Number(process.env.CHOKIDAR_POLL_INTERVAL || 1000)
    }
  }
})
