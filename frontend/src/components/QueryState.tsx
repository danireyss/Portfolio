import type { UseQueryResult } from '@tanstack/react-query'
import { RotateCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { isNotFound } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type QueryStateProps<T> = {
  query: UseQueryResult<T>
  /** Rendered instead of the generic error when the API answers 404. */
  notFound?: ReactNode
  children: (data: T) => ReactNode
}

/** A page's loading skeleton, error with retry, or 404, then `children(data)` once it has loaded. */
export function QueryState<T>({ query, notFound, children }: QueryStateProps<T>) {
  if (query.isPending) return <PageSkeleton />
  if (query.isError) {
    if (notFound && isNotFound(query.error)) return notFound
    return <ErrorState onRetry={() => query.refetch()} />
  }
  return children(query.data)
}

export function PageSkeleton() {
  // At least a screen tall, so the footer stays below the fold while the page loads instead of
  // jumping away when it arrives (a layout shift).
  return (
    <div className="min-h-svh space-y-6 py-16" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-5 w-full max-w-xl" />
      <Skeleton className="h-5 w-4/5 max-w-lg" />
      <div className="grid gap-5 pt-6 sm:grid-cols-2">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    </div>
  )
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-4 py-24">
      <p className="eyebrow">Error</p>
      <h1 className="text-3xl">Something went wrong loading this page.</h1>
      <p className="text-prose">Check your connection and try again.</p>
      <Button variant="outline" onClick={onRetry}>
        <RotateCw data-icon="inline-start" />
        Try again
      </Button>
    </div>
  )
}
