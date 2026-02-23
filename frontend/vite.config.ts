import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Use a user-writable outDir; `dist/` is owned by www-data in some deployments.
    outDir: 'build_dist',
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
      // Use polling to avoid EMFILE (too many open files) with native watchers
      usePolling: true,
      interval: 1000
    }
  }
})
