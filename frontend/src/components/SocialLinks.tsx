import type { Social } from '@/api/types/Social'
import { SocialIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { externalLinkProps } from '@/lib/format'
import { cn } from '@/lib/utils'

export function SocialLinks({ socials, className }: { socials: Social[]; className?: string }) {
  return (
    <ul className={cn('flex items-center gap-1', className)}>
      {socials.map((social) => (
        <li key={social.url}>
          <Button asChild variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
            <a href={social.url} aria-label={social.label} {...externalLinkProps(social.url)}>
              <SocialIcon kind={social.kind} className="size-4" />
            </a>
          </Button>
        </li>
      ))}
    </ul>
  )
}
