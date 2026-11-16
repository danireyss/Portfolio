/// <reference types="vitest/config" />
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'

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

/** What src/entry-server.tsx's renderPage answers with. */
type PageResponse = { status: number; headers: Record<string, string>; body: string }

/**
 * Renders pages on the server in `vite` (dev) and `vite preview`, as src/lambda.ts does in
 * production. A request Vite has no file for is a page when the last segment of its path has no
 * file extension, close to the rule CloudFront follows (infra/lib/constructs/website.ts).
 */
function serverRender(): Plugin {
  // Where the renderer fetches page data; the browser goes through `server.proxy` instead.
  const apiOrigin = `http://localhost:${process.env.API_PORT ?? 3000}`
  const pages =
    (render: (url: string) => Promise<PageResponse>): Connect.NextHandleFunction =>
    (req, res, next) => {
      const url = req.originalUrl ?? req.url ?? '/'
      const lastSegment = url.split('?')[0].split('/').pop() ?? ''
      if ((req.method !== 'GET' && req.method !== 'HEAD') || lastSegment.includes('.')) {
        return next()
      }
      render(url).then(({ status, headers, body }) => {
        res.writeHead(status, headers)
        res.end(req.method === 'HEAD' ? undefined : body)
      }, next)
    }

  return {
    name: 'server-render',
    // Returning a function adds the middleware after Vite's own, so files are served first.
    configureServer(server) {
      return () => {
        server.middlewares.use(
          pages(async (url) => {
            const html = await readFile(join(server.config.root, 'index.html'), 'utf8')
            const template = await server.transformIndexHtml(url, withDevStyles(html))
            const { renderPage } = await server.ssrLoadModule('/src/entry-server.tsx')
            return renderPage(url, template, { apiOrigin })
          }),
        )
      }
    },
    configurePreviewServer(server) {
      return () => {
        server.middlewares.use(
          pages(async (url) => {
            const { root } = server.config
            const template = await readFile(join(root, 'dist/client/index.html'), 'utf8')
            const { renderPage } = await import(pathToFileURL(join(root, 'dist/server/entry-server.mjs')).href)
            return renderPage(url, template, { apiOrigin })
          }),
        )
      }
    },
  }
}

/**
 * In dev, a page's CSS arrives with its JavaScript, so a rendered page would sit unstyled until
 * then. Linking the stylesheet up front avoids that; src/main.tsx removes the link once the
 * imported copy (which hot-reloads) is in.
 */
const withDevStyles = (html: string) =>
  html.replace('</head>', '<link rel="stylesheet" href="/src/index.css" data-dev-styles /></head>')

// https://vite.dev/config/
export default defineConfig(({ isSsrBuild }) => ({
  // Pages come from serverRender rather than Vite's own index.html fallback.
  appType: 'custom',
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
    serverRender(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: isSsrBuild
    ? {
        // `vite build --ssr`: the server renderer, for Lambda (src/lambda.ts) and `vite preview`.
        // .mjs because there's no package.json beside it to say these are ES modules.
        outDir: 'dist/server',
        copyPublicDir: false,
        rolldownOptions: {
          input: ['src/entry-server.tsx', 'src/lambda.ts'],
          output: { entryFileNames: '[name].mjs', chunkFileNames: '[name]-[hash].mjs' },
        },
      }
    : { outDir: 'dist/client' },
  // Lambda gets no node_modules, so the server build bundles every dependency in, with React's
  // production build picked at build time rather than by NODE_ENV when it runs.
  ssr: isSsrBuild ? { noExternal: true } : undefined,
  define: isSsrBuild ? { 'process.env.NODE_ENV': JSON.stringify('production') } : undefined,
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
}))
