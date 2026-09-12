import { useQueryClient } from '@tanstack/react-query'
import { LogOut, X } from 'lucide-react'
import { toast } from 'sonner'
import { setContentVersion } from '@/api/client'
import { Button } from '@/components/ui/button'
import { setAdminMode } from '@/lib/adminMode'
import { signOut } from './api'
import { useAdminContent } from './queries'

/** Floats at the bottom in admin mode: whether the session checked out, and ways out. */
export function AdminBar() {
  const queryClient = useQueryClient()
  const { data } = useAdminContent()

  const exit = () => {
    setAdminMode(false)
    setContentVersion(undefined)
    queryClient.removeQueries({ queryKey: ['admin'] })
  }
  const signOutAndExit = async () => {
    await signOut().catch(() => undefined)
    exit()
    toast.success('Signed out.')
  }

  return (
    <div
      role="region"
      aria-label="Admin mode"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card/95 py-1 pr-1 pl-4 text-sm shadow-lg backdrop-blur"
    >
      <span className="mr-2 font-medium whitespace-nowrap text-primary">
        {data ? 'Admin mode' : 'Checking your session…'}
      </span>
      <Button size="sm" variant="ghost" className="rounded-full" onClick={exit}>
        <X data-icon="inline-start" />
        Exit
      </Button>
      <Button size="sm" variant="ghost" className="rounded-full" onClick={signOutAndExit}>
        <LogOut data-icon="inline-start" />
        Sign out
      </Button>
    </div>
  )
}
