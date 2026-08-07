import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const proxyTarget = (process.env.VITE_CODER_PROXY_TARGET || 'https://db.zynix.us').replace(/\/$/, '')

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        secure: true,
      },
      '/media': {
        target: proxyTarget,
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
