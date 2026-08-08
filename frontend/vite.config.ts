import react from '@vitejs/plugin-react'
import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'
import { defineConfig } from 'vite'

// The API and uploaded images are proxied so the app is same-origin in dev.
export default defineConfig({
  plugins: [react()],
  // PostCSS is configured inline rather than via postcss.config.js so Vite never
  // walks up and finds the unrelated postcss.config.mjs in a parent directory.
  css: { postcss: { plugins: [tailwindcss(), autoprefixer()] } },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true, ws: true },
      '/uploads': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
