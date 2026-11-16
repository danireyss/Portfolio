import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { hydrate } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/playfair-display/500.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/playfair-display/500-italic.css'
import './index.css'
import { createQueryClient } from '@/api/queries'
import { Root } from '@/app/Root'

// The dev server links the stylesheet into rendered pages (see vite.config.ts); the import above
// has put in its own copy, which hot-reloads, by now.
if (import.meta.env.DEV) {
  document.querySelector('link[data-dev-styles]')?.remove()
}

const queryClient = createQueryClient()
// The data the server rendered the page from (src/entry-server.tsx), so none of it is fetched again.
const state = document.getElementById('query-state')
if (state?.textContent) {
  hydrate(queryClient, JSON.parse(state.textContent))
}

const container = document.getElementById('root')!
const app = (
  <StrictMode>
    <BrowserRouter>
      <Root queryClient={queryClient} />
    </BrowserRouter>
  </StrictMode>
)
// The server sends #root empty when it couldn't render the page; the browser renders it then.
if (container.firstElementChild) {
  hydrateRoot(container, app)
} else {
  createRoot(container).render(app)
}
