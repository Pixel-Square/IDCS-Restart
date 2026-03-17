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
    // Avoid privileged ports (<1024) which require root on Linux.
    // Keep this aligned with backend CANVA_REDIRECT_URI dev config.
    // NOTE: Do NOT read process.env.PORT here. Some environments export PORT=80
    // (or similar) which makes Vite attempt to bind a privileged port and fail.
    // For local dev, we run Vite on 3001 and put Nginx on :80 in front.
    port: Number(process.env.VITE_DEV_PORT || 3001),
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
