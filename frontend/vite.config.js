import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// During dev, proxy /api to the Spring Boot backend on :8080.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
