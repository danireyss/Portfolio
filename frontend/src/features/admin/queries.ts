import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { isNotFound, setContentVersion } from '@/api/client'
import type { AdminContent } from '@/api/types/AdminContent'
import type { ProjectInput } from '@/api/types/ProjectInput'
import type { ProjectSource } from '@/api/types/ProjectSource'
import type { SiteFile } from '@/api/types/SiteFile'
import type { UploadKind } from '@/api/types/UploadKind'
import { setAdminMode, useAdminMode } from '@/lib/adminMode'
import { adminApi, uploadFile } from './api'

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

/** Serves a change's result, and has every page's data refetched at the new version. */
function published(queryClient: QueryClient, content: AdminContent) {
  queryClient.setQueryData(ADMIN_CONTENT, content)
  setContentVersion(content.version)
  return queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'admin' })
}

/** A change that resolves to the new content; once it succeeds, the site shows it. */
function useAdminChange<Variables>(change: (variables: Variables) => Promise<AdminContent>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: change,
    onSuccess: (content) => published(queryClient, content),
  })
}

export const useSaveSite = () =>
  useAdminChange(({ site, version }: { site: SiteFile; version: string }) =>
    adminApi.saveSite(site, version),
  )

export const useSaveProject = () =>
  useAdminChange(({ slug, input, version }: { slug: string; input: ProjectInput; version: string }) =>
    adminApi.saveProject(slug, input, version),
  )

export const useDeleteProject = () =>
  useAdminChange(({ slug, version }: { slug: string; version: string }) =>
    adminApi.deleteProject(slug, version),
  )

/**
 * Saves the order projects are listed in: each one's `order` becomes its position. Only the ones
 * that moved are saved, one after another, each based on the version the last one made.
 */
export const useReorderProjects = () =>
  useAdminChange(async ({ projects, version }: { projects: ProjectSource[]; version: string }) => {
    let latest: AdminContent | undefined
    for (const [position, project] of projects.entries()) {
      if (project.front.order === position) continue
      latest = await adminApi.saveProject(
        project.slug,
        { front: { ...project.front, order: position }, markdown: project.markdown },
        latest?.version ?? version,
      )
    }
    return latest ?? adminApi.content()
  })

/** Uploads photos or a resume, then has the site serve them. */
export const useUpload = () =>
  useAdminChange(
    async ({ kind, files, folder = null }: { kind: UploadKind; files: File[]; folder?: string | null }) => {
      for (const file of files) {
        await uploadFile(kind, file, folder)
      }
      return adminApi.reload()
    },
  )

export const useDeletePhoto = () =>
  useAdminChange(async ({ folder, file }: { folder: string; file: string }) => {
    await adminApi.deletePhoto(folder, file)
    return adminApi.reload()
  })
