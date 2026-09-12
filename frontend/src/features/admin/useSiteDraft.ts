import { useState } from 'react'
import type { AdminContent } from '@/api/types/AdminContent'
import type { SiteFile } from '@/api/types/SiteFile'
import { useSaveSite } from './queries'

/**
 * A draft of one part of site.toml, starting as a copy of what's live. Saving sends the whole
 * file with that part replaced, marked with the version the draft started from.
 */
export function useSiteDraft<K extends keyof SiteFile>(content: AdminContent, key: K) {
  const [draft, setDraft] = useState<SiteFile[K]>(() => structuredClone(content.site[key]))
  const mutation = useSaveSite()
  const save = () =>
    mutation.mutateAsync({ site: { ...content.site, [key]: draft }, version: content.version })
  return { draft, setDraft, save, pending: mutation.isPending }
}
