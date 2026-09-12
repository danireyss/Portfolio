/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Preloads fonts from index.html, so they download alongside the app's code. Otherwise the
 * browser only asks for them once the first render draws text, and swapping them in a moment
 * later makes that text visibly jump. `names` are Fontsource file names without the hash.
 */
function preloadFonts(names: string[]): Plugin {
  return {
    name: 'preload-fonts',
    apply: 'build',
    transformIndexHtml(_html, { bundle }) {
      return Object.values(bundle ?? {})
        // Fontsource also ships .woff copies for old browsers; every browser in use takes .woff2.
        .filter(
          ({ fileName }) =>
            fileName.endsWith('.woff2') && names.some((name) => fileName.startsWith(`assets/${name}-`)),
        )
        .map((file) => ({
          tag: 'link',
          attrs: { rel: 'preload', href: `/${file.fileName}`, as: 'font', type: 'font/woff2', crossorigin: true },
          injectTo: 'head',
        }))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // What the first screen draws with (latin only): body text, nav and buttons, eyebrow labels,
    // and the headings with the italic name. Other weights load when a page uses them.
    preloadFonts([
      'ibm-plex-sans-latin-400-normal',
      'ibm-plex-sans-latin-500-normal',
      'ibm-plex-mono-latin-400-normal',
      'playfair-display-latin-500-normal',
      'playfair-display-latin-500-italic',
    ]),
  ],
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
