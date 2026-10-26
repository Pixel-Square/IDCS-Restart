import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load .env, .env.local, .env.[mode], .env.[mode].local into env
  // so proxy target and other config-level vars can be set from .env.local
  const env = loadEnv(mode, process.cwd(), '')

  const apiProxyTarget = env.VITE_DEV_API_PROXY_TARGET || 'http://127.0.0.1:8000'

  return {
    plugins: [react()],
    build: {
      outDir: 'build',
      // Debug aid: enable sourcemaps only when explicitly requested.
      // Usage: VITE_SOURCEMAP=true npm run build
      sourcemap: env.VITE_SOURCEMAP === 'true',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('mermaid') || id.includes('react-mermaid2')) {
                return 'vendor-mermaid';
              }
              if (id.includes('tesseract.js')) {
                return 'vendor-tesseract';
              }
              if (id.includes('xlsx') || id.includes('xlsx-js-style')) {
                return 'vendor-xlsx';
              }
              if (id.includes('jspdf') || id.includes('jspdf-autotable') || id.includes('html2canvas')) {
                return 'vendor-pdf';
              }
              if (id.includes('mathlive') || id.includes('react-math-view') || id.includes('katex') || id.includes('react-katex')) {
                return 'vendor-math';
              }
              if (id.includes('cytoscape') || id.includes('cose-bilkent')) {
                return 'vendor-cytoscape';
              }
              if (id.includes('recharts')) {
                return 'vendor-charts';
              }
              if (id.includes('@canva')) {
                return 'vendor-canva';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
            }
          },
        },
      },
    },
    server: {
      host: true,
      allowedHosts: ['idcs.krgi.co.in'],
      port: 80,
      // Dev convenience: when the frontend is served by Vite (often :80) and the
      // Django API is on a different port (often :8000), proxy `/api/...` so
      // same-origin API calls don't 404 with HTML.
      proxy: {
        '/api': {
          target: apiProxyTarget,
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
          '**/media/**',
        ],
        // fallback to polling when native watchers fail (safer, higher CPU)
        usePolling: env.CHOKIDAR_USEPOLLING === 'true' || false,
        interval: Number(env.CHOKIDAR_POLL_INTERVAL || 1000),
      },
    },
  }
})

