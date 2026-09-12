import type { ContactRequest } from './types/ContactRequest'
import type { ErrorBody } from './types/ErrorBody'
import type { PhotosResponse } from './types/PhotosResponse'
import type { Project } from './types/Project'
import type { ProjectsResponse } from './types/ProjectsResponse'
import type { ResumeResponse } from './types/ResumeResponse'
import type { SiteResponse } from './types/SiteResponse'

export const RESUME_PDF_URL = '/api/resume.pdf'

/** A non-2xx API response, carrying the backend's JSON error body when there is one. */
export class ApiError extends Error {
  readonly status: number
  readonly body: ErrorBody | null

  constructor(status: number, body: ErrorBody | null) {
    super(body?.error ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export const isNotFound = (error: unknown) =>
  error instanceof ApiError && error.status === 404

/** Set by admin mode after a save: reads then ask for at least that content version. */
let contentVersion: string | undefined

/**
 * Makes every read ask for at least `version` (`?v=`), which skips CloudFront's cached copy and
 * has the API check for newer content first; `undefined` goes back to plain reads.
 */
export function setContentVersion(version: string | undefined) {
  contentVersion = version
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isRead = (init?.method ?? 'GET') === 'GET'
  const url =
    contentVersion && isRead
      ? `/api${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(contentVersion)}`
      : `/api${path}`
  const response = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null
    throw new ApiError(response.status, body)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export const api = {
  site: () => request<SiteResponse>('/site'),
  projects: () => request<ProjectsResponse>('/projects'),
  project: (slug: string) =>
    request<Project>(`/projects/${encodeURIComponent(slug)}`),
  resume: () => request<ResumeResponse>('/resume'),
  photos: () => request<PhotosResponse>('/photos'),
  contact: (body: ContactRequest) =>
    request<void>('/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
}
