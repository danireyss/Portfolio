import { request } from '@/api/client'
import type { AdminContent } from '@/api/types/AdminContent'
import type { ProjectInput } from '@/api/types/ProjectInput'
import type { SiteFile } from '@/api/types/SiteFile'
import type { UploadKind } from '@/api/types/UploadKind'
import type { UploadRequest } from '@/api/types/UploadRequest'
import type { UploadTicket } from '@/api/types/UploadTicket'
import { HEADSHOT_SIDE, optimizeImage, PHOTO_SIDE } from './images'

const json = (method: string, body: unknown, headers: Record<string, string> = {}) => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

const projectPath = (slug: string) => `/admin/projects/${encodeURIComponent(slug)}`

/**
 * The admin API (backend/src/routes/admin.rs); anyone but the owner gets 404s. Saves that take a
 * `version` are refused (409) if it's no longer the latest.
 */
export const adminApi = {
  content: () => request<AdminContent>('/admin/content'),
  saveSite: (site: SiteFile, version: string) =>
    request<AdminContent>('/admin/site', json('PUT', site, { 'If-Match': version })),
  /** Creates or replaces a project. */
  saveProject: (slug: string, input: ProjectInput, version: string) =>
    request<AdminContent>(projectPath(slug), json('PUT', input, { 'If-Match': version })),
  deleteProject: (slug: string, version: string) =>
    request<AdminContent>(projectPath(slug), { method: 'DELETE', headers: { 'If-Match': version } }),
  uploadTicket: (upload: UploadRequest) =>
    request<UploadTicket>('/admin/uploads', json('POST', upload)),
  /** After uploading photos or a resume, or deleting photos: serves what's in storage now. */
  reload: () => request<AdminContent>('/admin/reload', { method: 'POST' }),
  /** Has the resume page's experience, education, skills, and awards match the resume PDF. */
  importResume: () => request<AdminContent>('/admin/resume/import', { method: 'POST' }),
  deletePhoto: (folder: string, file: string) =>
    request<void>(`/admin/photos/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`, {
      method: 'DELETE',
    }),
}

/**
 * Uploads a file where the API says: straight to the media bucket in production, or to the API
 * locally. Photos and headshots are shrunk first. Resolves to the path it's served from.
 */
export async function uploadFile(kind: UploadKind, original: File, folder: string | null = null) {
  const file =
    kind === 'resume'
      ? original
      : await optimizeImage(original, kind === 'headshot' ? HEADSHOT_SIDE : PHOTO_SIDE)
  const ticket = await adminApi.uploadTicket({ kind, folder, filename: file.name })
  const response = await fetch(ticket.url, { method: 'PUT', headers: ticket.headers, body: file })
  if (!response.ok) {
    throw new Error(`Uploading ${original.name} failed (${response.status}).`)
  }
  return ticket.path
}

/** Starts Google sign-in (Better Auth, in auth/); resolves to the URL to send the browser to. */
export async function startGoogleSignIn(): Promise<string> {
  const { url } = await request<{ url: string }>(
    '/auth/sign-in/social',
    json('POST', {
      provider: 'google',
      callbackURL: '/admin',
      errorCallbackURL: '/admin',
    }),
  )
  return url
}

export function signOut() {
  return request<unknown>('/auth/sign-out', json('POST', {}))
}
