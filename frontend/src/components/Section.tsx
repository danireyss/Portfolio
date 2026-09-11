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
}

export function Section({ id, eyebrow, title, children, className }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('scroll-mt-24 py-12 md:py-16', className)}
    >
      <Reveal>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={`${id}-title`} className="mt-2 font-heading text-3xl text-heading md:text-4xl">
          {title}
        </h2>
      </Reveal>
      <div className="mt-8">{children}</div>
    </section>
  )
}
