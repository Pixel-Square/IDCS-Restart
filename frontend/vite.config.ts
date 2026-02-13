import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: ['db.zynix.us', "idcs.zynix.us"],
     port: 80,
  }
})
