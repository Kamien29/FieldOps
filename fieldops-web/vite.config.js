import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const apiTarget = process.env.VITE_API_PROXY || 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
