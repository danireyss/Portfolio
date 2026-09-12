import { lazy, Suspense } from 'react'
import type { EditorKey } from '@/features/admin/editors'
import { useAdminMode } from '@/lib/adminMode'

// The admin code only downloads in admin mode, so visitors never load it.
const EditButton = lazy(async () => ({
  default: (await import('@/features/admin/EditButton')).EditButton,
}))
const AdminBar = lazy(async () => ({
  default: (await import('@/features/admin/AdminBar')).AdminBar,
}))

/** In admin mode, a button that opens the editor for part of the page; otherwise nothing. */
export function AdminEdit({ section, className }: { section: EditorKey; className?: string }) {
  const adminMode = useAdminMode()
  if (!adminMode) return null
  return (
    <Suspense fallback={null}>
      <EditButton section={section} className={className} />
    </Suspense>
  )
}

/** In admin mode, the bar with admin mode's status and ways out; otherwise nothing. */
export function AdminBarSlot() {
  const adminMode = useAdminMode()
  if (!adminMode) return null
  return (
    <Suspense fallback={null}>
      <AdminBar />
    </Suspense>
  )
}
