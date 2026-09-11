import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { PageMeta } from '@/components/PageMeta'
import { Button } from '@/components/ui/button'

type NotFoundProps = {
  title?: string
  message?: string
  backTo?: { to: string; label: string }
}

export function NotFound({
  title = 'Page not found',
  message = "The page you're looking for doesn't exist or has moved.",
  backTo = { to: '/', label: 'Back home' },
}: NotFoundProps) {
  return (
    <section className="flex min-h-[60svh] flex-col items-start justify-center gap-4 py-24">
      <PageMeta title="Not found" />
      <p className="eyebrow">404</p>
      <h1 className="text-4xl md:text-5xl">{title}</h1>
      <p className="text-prose">{message}</p>
      <Button asChild variant="outline">
        <Link to={backTo.to}>
          <ArrowLeft data-icon="inline-start" />
          {backTo.label}
        </Link>
      </Button>
    </section>
  )
}
