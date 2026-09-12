import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Reveal } from './Reveal'

type SectionProps = {
  id: string
  /** Small mono label above the title, e.g. "About". */
  eyebrow: string
  title: ReactNode
  children: ReactNode
  className?: string
  /** Shown beside the title, e.g. admin's edit button. */
  action?: ReactNode
}

export function Section({ id, eyebrow, title, children, className, action }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('scroll-mt-24 py-12 md:py-16', className)}
    >
      <Reveal>
        <p className="eyebrow">{eyebrow}</p>
        <div className="mt-2 flex items-center gap-3">
          <h2 id={`${id}-title`} className="font-heading text-3xl text-heading md:text-4xl">
            {title}
          </h2>
          {action}
        </div>
      </Reveal>
      <div className="mt-8">{children}</div>
    </section>
  )
}
