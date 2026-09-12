import { request } from '@/api/client'
import type { AdminContent } from '@/api/types/AdminContent'
import type { SiteFile } from '@/api/types/SiteFile'

const json = (method: string, body: unknown, headers: Record<string, string> = {}) => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

/** The admin API (backend/src/routes/admin.rs). Anyone but the owner gets 404s. */
export const adminApi = {
  content: () => request<AdminContent>('/admin/content'),
  /** Saves the whole site.toml; refused (409) if `version` is no longer the latest. */
  saveSite: (site: SiteFile, version: string) =>
    request<AdminContent>('/admin/site', json('PUT', site, { 'If-Match': version })),
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
