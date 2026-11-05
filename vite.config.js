import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: UI on :5173 proxies /api to the Spring Boot server (or the mock server) on :8080.
// Build: output goes to dist/ (copy it into the backend's src/main/resources/static to ship one jar).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.API_TARGET || 'http://localhost:8080', changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
