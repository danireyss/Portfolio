import { Link } from 'react-router'
import { useSite } from '@/api/queries'
import { SocialLinks } from '@/components/SocialLinks'
import { Button } from '@/components/ui/button'

export function Footer() {
  const { data } = useSite()

  return (
    <footer className="mt-16 border-t border-border">
      <div className="page flex flex-col gap-8 py-12">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <p className="font-heading text-2xl text-heading">Let's build something together.</p>
          <div className="flex gap-3">
            <Button asChild variant="outline">
              <Link to="/resume">Resume</Link>
            </Button>
            <Button asChild>
              <Link to="/contact">Contact</Link>
            </Button>
          </div>
        </div>
        <div className="flex flex-col-reverse justify-between gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <p>
            © {new Date().getFullYear()} {data?.profile.name}. Built with React, Rust &amp; Axum on AWS.
          </p>
          <SocialLinks socials={data?.socials ?? []} className="-mr-2" />
        </div>
      </div>
    </footer>
  )
}
