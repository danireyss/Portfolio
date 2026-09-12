import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { isNotFound, setContentVersion } from '@/api/client'
import type { AdminContent } from '@/api/types/AdminContent'
import type { SiteFile } from '@/api/types/SiteFile'
import { setAdminMode, useAdminMode } from '@/lib/adminMode'
import { adminApi } from './api'

export const ADMIN_CONTENT = ['admin', 'content'] as const

/**
 * What admin edits, while in admin mode. A 404 means there's no admin session (it expired, or
 * was never the owner's), so admin mode turns off.
 */
export function useAdminContent() {
  const adminMode = useAdminMode()
  const query = useQuery({
    queryKey: ADMIN_CONTENT,
    queryFn: adminApi.content,
    enabled: adminMode,
    retry: false,
  })
  useEffect(() => {
    if (isNotFound(query.error)) setAdminMode(false)
  }, [query.error])
  useEffect(() => {
    // Show the latest content, not a cached copy.
    if (query.data) setContentVersion(query.data.version)
  }, [query.data])
  return query
}

/** Serves a save's result, and has every page's data refetched at the new version. */
function published(queryClient: QueryClient, content: AdminContent) {
  queryClient.setQueryData(ADMIN_CONTENT, content)
  setContentVersion(content.version)
  return queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'admin' })
}

export function useSaveSite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ site, version }: { site: SiteFile; version: string }) =>
      adminApi.saveSite(site, version),
    onSuccess: (content) => published(queryClient, content),
  })
}
