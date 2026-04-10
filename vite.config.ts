import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { localNetworkPlugin } from './vite-plugin-local-network'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localNetworkPlugin()],
})
