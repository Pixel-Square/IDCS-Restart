import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_PROXY_TARGET || 'https://db.zynix.us',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    outDir: 'build',
    emptyOutDir: false,
  },
})