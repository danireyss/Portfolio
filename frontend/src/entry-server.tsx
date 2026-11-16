import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { prerender } from 'react-dom/static'
import { StaticRouter } from 'react-router'
import { isNotFound, setApiOrigin } from '@/api/client'
import { loadPageData } from '@/api/queries'
import { Root } from '@/app/Root'

/** A page's HTTP response. */
export type PageResponse = { status: number; headers: Record<string, string>; body: string }

export type RenderOptions = {
  /** Where the server reaches the API (e.g. http://localhost:3000) for the page's data. */
  apiOrigin: string
}

// CloudFront keeps a rendered page as long as it keeps the API responses it's made from (five
// minutes), and a deploy clears both. Browsers check back on every visit; the page's code is
// what they cache for good.
const CACHED = 'public, max-age=0, s-maxage=300'

// React writes a page's <title>, <meta>, and <link> tags ahead of the page itself; they go in
// index.html's <head>, where React in the browser finds them again instead of adding copies.
const HOISTED = /^((?:<(?:meta|link)\b[^>]*>|<title\b[^>]*>[^<]*<\/title>)*)([\s\S]*)$/

/**
 * The page at `url` (path and query string) as a complete response: index.html (`template`) with
 * the app rendered into it, plus the data it was rendered from, which the browser takes over
 * (src/main.tsx) instead of fetching again.
 *
 * Without its data (the API failed, or has nothing at that address) or if rendering fails, the
 * page goes out empty for the browser to render as before, so a problem here can't take the site
 * down.
 */
export async function renderPage(
  url: string,
  template: string,
  { apiOrigin }: RenderOptions,
): Promise<PageResponse> {
  setApiOrigin(apiOrigin)
  // The browser retries failed requests itself; the server answers right away instead.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  try {
    await loadPageData(queryClient, new URL(url, 'http://localhost').pathname)
    const failed = queryClient
      .getQueryCache()
      .getAll()
      .find((query) => query.state.status === 'error')
    if (failed) {
      return unrendered(template, isNotFound(failed.state.error) ? 404 : 503)
    }

    // Also set by an error inside a Suspense boundary, which React would otherwise leave on its
    // fallback for the browser to finish: a page like that shouldn't be cached.
    let renderError: unknown
    const { prelude } = await prerender(
      <StrictMode>
        <StaticRouter location={url}>
          <Root queryClient={queryClient} />
        </StaticRouter>
      </StrictMode>,
      {
        onError: (error) => void (renderError ??= error),
        // React otherwise moves a large Suspense boundary's content (every page is one, under
        // Layout's) to the end of the HTML, in a hidden <div> that an inline script puts in
        // place: crawlers that don't run JavaScript would see a page with nothing in it.
        progressiveChunkSize: Infinity,
      },
    )
    if (renderError) throw renderError
    const [, head, html] = (await new Response(prelude).text()).match(HOISTED)!
    return {
      status: 200,
      headers: headers(CACHED),
      body: fill(template, { head, html, state: stateScript(dehydrate(queryClient)) }),
    }
  } catch (error) {
    console.error(`Couldn't render ${url}:`, error)
    return unrendered(template, 500)
  }
}

/** index.html with an empty #root, for the browser to render; errors aren't cached. */
function unrendered(template: string, status: number): PageResponse {
  return {
    status,
    headers: headers(status >= 500 ? 'no-store' : CACHED),
    body: fill(template, { head: '', html: '', state: '' }),
  }
}

function headers(cacheControl: string) {
  return { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cacheControl }
}

/**
 * Puts the page into index.html's placeholders. An empty `head` keeps the default title and
 * description. Replacer functions, since a string replacement would expand `$&` and the like
 * in the page's text.
 */
function fill(template: string, { head, html, state }: { head: string; html: string; state: string }) {
  return template
    .replace(/<!--app-head-->([\s\S]*?)<!--\/app-head-->/, (_, defaults: string) => head || defaults)
    .replace('<!--app-html-->', () => html)
    .replace('<!--app-state-->', () => state)
}

/** The query cache as JSON, with `<` escaped so nothing in the data can end the script tag. */
function stateScript(state: DehydratedState) {
  const json = JSON.stringify(state).replace(/</g, '\\u003c')
  return `<script type="application/json" id="query-state">${json}</script>`
}
