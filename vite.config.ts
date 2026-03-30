import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
    tailwindcss(),
  ],
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