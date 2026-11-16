import { hydrate } from '@tanstack/react-query'
import { act } from '@testing-library/react'
import { StrictMode } from 'react'
import { hydrateRoot, type Root as ReactRoot } from 'react-dom/client'
import { prerender } from 'react-dom/static'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import template from '../index.html?raw'
import { createQueryClient } from '@/api/queries'
import { Root } from '@/app/Root'
import { renderPage } from '@/entry-server'
import { alphaDetail, photosResponse, projects, site } from '@/test/fixtures'
import { mockApi } from '@/test/utils'

let root: ReactRoot | undefined

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  vi.restoreAllMocks()
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

/**
 * React's server renderer leaves the last page's context values set when it finishes (expecting to
 * render again), in the same fields the browser renderer reads, so the browser render here would
 * find itself inside the server's router. On Lambda the two never share a JavaScript runtime; here
 * they do, and rendering nothing puts the values back.
 */
const resetServerContext = () => prerender(<></>)

/** React's development-only warning about the same sharing, which resetServerContext can't clear. */
const isSharedRuntimeWarning = (message: unknown) =>
  String(message).startsWith('Detected multiple renderers concurrently rendering')

// The browser's first render has to produce exactly what the server sent, or React throws the
// server's HTML away and renders the page again.
it.each(['/', '/projects', '/projects/alpha', '/photos', '/contact', '/admin', '/nowhere'])(
  'hydrates the server-rendered %s as it is',
  async (path) => {
    mockApi({
      '/api/site': site,
      '/api/photos': photosResponse,
      '/api/projects': projects,
      '/api/projects/alpha': alphaDetail,
    })
    const { body } = await renderPage(path, template, { apiOrigin: 'http://api.test' })
    await resetServerContext()
    const page = new DOMParser().parseFromString(body, 'text/html')
    document.head.innerHTML = page.head.innerHTML
    document.body.innerHTML = page.body.innerHTML

    const queryClient = createQueryClient()
    hydrate(queryClient, JSON.parse(document.getElementById('query-state')!.textContent!))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const recoverableErrors: unknown[] = []
    await act(async () => {
      root = hydrateRoot(
        document.getElementById('root')!,
        <StrictMode>
          <MemoryRouter initialEntries={[path]}>
            <Root queryClient={queryClient} />
          </MemoryRouter>
        </StrictMode>,
        { onRecoverableError: (error) => recoverableErrors.push(error) },
      )
    })

    expect(recoverableErrors).toEqual([])
    // React reports attribute mismatches here rather than as recoverable errors.
    expect(consoleError.mock.calls.filter(([message]) => !isSharedRuntimeWarning(message))).toEqual([])
    // React took over the head tags the server wrote rather than adding its own.
    expect(document.querySelectorAll('title')).toHaveLength(1)
    expect(document.querySelectorAll('meta[name="description"]').length).toBeLessThanOrEqual(1)
  },
)
