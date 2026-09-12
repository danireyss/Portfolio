/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // The Axum backend runs on :3000 in dev (`cargo run` in backend/); `make dev-otel` moves it
    // to API_PORT=3001 because the telemetry stack's Grafana uses :3000. Sign-in (/api/auth) goes
    // to the Better Auth service in auth/ instead; the first matching prefix wins.
    proxy: {
      '/api/auth': `http://localhost:${process.env.AUTH_PORT ?? 3002}`,
      '/api': `http://localhost:${process.env.API_PORT ?? 3000}`,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
