import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  // Monorepo/workspace setups can accidentally pull in two copies of React
  // (e.g. root node_modules + frontend node_modules). That triggers runtime
  // "Invalid hook call" errors even when hooks are used correctly.
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  build: {
    // Use a user-writable outDir; `dist/` is owned by www-data in some deployments.
    outDir: 'build_dist',
    rollupOptions: {
      // Multi-page app: main frontend + Canva panel (served as canva.html)
      input: {
        main:  resolve(__dirname, 'index.html'),
        canva: resolve(__dirname, 'canva.html'),
      },
    },
  },
  server: {
    host: true,
    allowedHosts: ['idcs.krgi.co.in', "idcs.zynix.us"],
    port: Number(process.env.PORT || process.env.VITE_DEV_PORT || 80),
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
