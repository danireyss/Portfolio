import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { App } from '@/App'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

/** Renders the whole app at `route`, with a fresh query cache and no retries. */
export function renderApp(route = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <TooltipProvider>
          <App />
          <Toaster />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type Route = unknown | ((init?: RequestInit) => Response)

/**
 * Stubs `fetch`: each key is an API path whose value is either a JSON body (served with 200) or
 * a function returning a Response. Unmatched paths get the backend's JSON 404.
 */
export function mockApi(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { pathname } = new URL(String(input), 'http://localhost')
    const route = routes[pathname]
    if (route === undefined) return jsonResponse({ error: 'Not found.', fields: [] }, 404)
    if (typeof route === 'function') return route(init)
    return jsonResponse(route)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
