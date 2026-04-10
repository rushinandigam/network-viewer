import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BRIDGE = process.env.VITE_BRIDGE_TARGET || 'http://127.0.0.1:4000'

// https://vite.dev/config/
const proxy = {
  '/ws/tcp': { target: BRIDGE, ws: true, changeOrigin: true },
  '/ws/stream': { target: BRIDGE, ws: true, changeOrigin: true },
  '/health': { target: BRIDGE, changeOrigin: true },
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy,
  },
  preview: {
    port: 4173,
    proxy,
  },
})
