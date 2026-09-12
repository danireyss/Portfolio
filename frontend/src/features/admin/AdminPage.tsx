import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, LogIn } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { PageMeta } from '@/components/PageMeta'
import { Button } from '@/components/ui/button'
import { setAdminMode } from '@/lib/adminMode'
import { goTo } from '@/lib/navigation'
import { adminApi, signOut, startGoogleSignIn } from './api'
import { ADMIN_CONTENT } from './queries'

// Better Auth sends errors back as ?error=; not-allowed comes from auth/'s owner-only hook.
const ERRORS: Record<string, string> = {
  'not-allowed': "That Google account isn't allowed in. Sign in with the site owner's account.",
}

/** /admin, linked from nowhere: sign in with Google, which turns on admin mode in this browser. */
export function AdminPage() {
  const [params] = useSearchParams()
  const error = params.get('error')
  const queryClient = useQueryClient()
  const [starting, setStarting] = useState(false)
  // Whether you're the admin: the admin API answers the owner and 404s everyone else.
  const content = useQuery({ queryKey: ADMIN_CONTENT, queryFn: adminApi.content, retry: false })
  const signedIn = content.isSuccess

  useEffect(() => {
    if (signedIn) setAdminMode(true)
  }, [signedIn])

  const signIn = async () => {
    setStarting(true)
    try {
      goTo(await startGoogleSignIn())
    } catch {
      setStarting(false)
      toast.error("Couldn't start signing in. Please try again.")
    }
  }

  const leave = async () => {
    await signOut().catch(() => undefined)
    setAdminMode(false)
    await queryClient.resetQueries({ queryKey: ['admin'] })
    toast.success('Signed out.')
  }

  return (
    <section className="mx-auto max-w-md py-24">
      <PageMeta title="Admin" />
      <meta name="robots" content="noindex" />
      <p className="eyebrow">Admin</p>
      {content.isPending ? (
        <p className="mt-4 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Checking your session…
        </p>
      ) : signedIn ? (
        <>
          <h1 className="mt-2 text-4xl">You're signed in</h1>
          <p className="mt-4 leading-relaxed text-prose">
            Admin mode is on in this browser: the site's sections have edit buttons, and saving
            publishes right away.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/">Go to the site</Link>
            </Button>
            <Button variant="outline" onClick={leave}>
              Sign out
            </Button>
          </div>
        </>
      ) : (
        <>
          <h1 className="mt-2 text-4xl">Sign in</h1>
          <p className="mt-4 leading-relaxed text-prose">Only the site's owner can edit it.</p>
          {error && (
            <p role="alert" className="mt-6 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
              {ERRORS[error] ?? "Signing in didn't work. Please try again."}
            </p>
          )}
          <Button className="mt-8" size="lg" onClick={signIn} disabled={starting}>
            {starting ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <LogIn data-icon="inline-start" />
            )}
            Sign in with Google
          </Button>
        </>
      )}
    </section>
  )
}
