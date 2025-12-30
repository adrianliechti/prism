import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/data': {
        target: 'http://localhost:9999',
        changeOrigin: true,
      },
      '/proxy': {
        target: 'http://localhost:9999',
        changeOrigin: true,
      },
      '/openai': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openai/, '')
      }
    },
  },
})