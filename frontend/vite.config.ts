import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The API and uploaded images are proxied so the app is same-origin in dev.
export default defineConfig({
  plugins: [react()],
  // Inline (empty) PostCSS config so Vite doesn't walk up and find an
  // unrelated postcss.config.mjs in a parent directory.
  css: { postcss: {} },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true, ws: true },
      '/uploads': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
