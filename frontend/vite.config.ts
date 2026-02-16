import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: ['db.zynix.us', "idcs.zynix.us"],
     port: 80,
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
