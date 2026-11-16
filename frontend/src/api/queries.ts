import {
  QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback } from 'react'
import { preloadStackPhotos } from '@/lib/photos'
import { api, isNotFound } from './client'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Content only changes on deploy, so fetch each resource once per visit.
        staleTime: Infinity,
        retry: (failureCount, error) => !isNotFound(error) && failureCount < 2,
      },
    },
  })
}

/** How each resource is cached and fetched; shared by the hooks below and by prefetching. */
export const queries = {
  site: () => queryOptions({ queryKey: ['site'], queryFn: api.site }),
  projects: () => queryOptions({ queryKey: ['projects'], queryFn: api.projects }),
  project: (slug: string) =>
    queryOptions({ queryKey: ['project', slug], queryFn: () => api.project(slug) }),
  resume: () => queryOptions({ queryKey: ['resume'], queryFn: api.resume }),
  photos: () => queryOptions({ queryKey: ['photos'], queryFn: api.photos }),
}

export const useSite = () => useQuery(queries.site())

export const useProjects = () => useQuery(queries.projects())

export const useProject = (slug: string) => useQuery(queries.project(slug))

export const useResume = () => useQuery(queries.resume())

export const usePhotos = () => useQuery(queries.photos())

export const useSendContact = () => useMutation({ mutationFn: api.contact })

/**
 * Starts fetching what the page at `path` shows, besides the site and photos the layout needs on
 * every page; each promise settles when its request has.
 */
function prefetchPageQueries(queryClient: QueryClient, path: string): Promise<void>[] {
  if (path === '/' || path === '/projects') return [queryClient.prefetchQuery(queries.projects())]
  if (path.startsWith('/projects/')) {
    const slug = decodeURIComponent(path.slice('/projects/'.length))
    return [queryClient.prefetchQuery(queries.project(slug))]
  }
  if (path === '/resume') return [queryClient.prefetchQuery(queries.resume())]
  return []
}

/** Starts fetching what the page at `path` shows. Data that's already cached isn't refetched. */
export function prefetchPageData(queryClient: QueryClient, path: string) {
  if (path === '/photos') {
    // Its data is usually cached already; the photos themselves are what the page waits on.
    void queryClient.fetchQuery(queries.photos()).then(preloadStackPhotos, () => {})
    return
  }
  prefetchPageQueries(queryClient, path)
}

/**
 * For the server renderer: fetches everything the page at `path` renders, the layout's site and
 * photos included. Resolves once every request has settled; failures stay in the cache as errors.
 */
export async function loadPageData(queryClient: QueryClient, path: string) {
  await Promise.all([
    queryClient.prefetchQuery(queries.site()),
    queryClient.prefetchQuery(queries.photos()),
    ...prefetchPageQueries(queryClient, path),
  ])
}

/**
 * For links: call it on hover or focus, so the page opens with its data already there.
 * (Every page's code is preloaded once the site is idle; see app/pages.ts.)
 */
export function usePrefetchPage() {
  const queryClient = useQueryClient()
  return useCallback((path: string) => prefetchPageData(queryClient, path), [queryClient])
}
