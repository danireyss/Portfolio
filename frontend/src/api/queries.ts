import {
  QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback } from 'react'
import { api, isNotFound } from './client'

declare global {
  interface Window {
    /** Requested by index.html before the app's code loaded; see adoptEarlyData. */
    __early?: {
      site: Promise<Awaited<ReturnType<typeof api.site>>>
      photos: Promise<Awaited<ReturnType<typeof api.photos>>>
    }
  }
}

/**
 * Hands index.html's early requests to their queries, so the app doesn't fetch them again and
 * usually has the data by its first render. A request that failed is fetched again normally.
 */
export function adoptEarlyData(queryClient: QueryClient) {
  const early = window.__early
  if (!early) return
  window.__early = undefined
  void queryClient.prefetchQuery({ ...queries.site(), queryFn: () => early.site.catch(() => api.site()) })
  void queryClient.prefetchQuery({
    ...queries.photos(),
    queryFn: () => early.photos.catch(() => api.photos()),
  })
}

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

/** Starts fetching what the page at `path` shows. Data that's already cached isn't refetched. */
export function prefetchPageData(queryClient: QueryClient, path: string) {
  if (path === '/') {
    void queryClient.prefetchQuery(queries.site())
    void queryClient.prefetchQuery(queries.projects())
  } else if (path === '/projects') {
    void queryClient.prefetchQuery(queries.projects())
  } else if (path.startsWith('/projects/')) {
    const slug = decodeURIComponent(path.slice('/projects/'.length))
    void queryClient.prefetchQuery(queries.project(slug))
  } else if (path === '/photos') {
    void queryClient.prefetchQuery(queries.photos())
  } else if (path === '/resume') {
    void queryClient.prefetchQuery(queries.resume())
  }
}

/**
 * For links: call it on hover or focus, so the page opens with its data already there.
 * (Every page's code is preloaded once the site is idle; see app/pages.ts.)
 */
export function usePrefetchPage() {
  const queryClient = useQueryClient()
  return useCallback((path: string) => prefetchPageData(queryClient, path), [queryClient])
}
