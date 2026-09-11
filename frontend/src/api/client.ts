import type { ContactRequest } from './types/ContactRequest'
import type { ErrorBody } from './types/ErrorBody'
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
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
  contact: (body: ContactRequest) =>
    request<void>('/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
}
