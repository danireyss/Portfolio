/*
 * Adapted from Amicro's CardCoverFlow (MIT License, Copyright (c) 2026 Syed Subhan Uddin):
 * https://github.com/Subhan-code/Amicro--Micro-transitions-/blob/main/src/components/cards/CardCoverFlow.tsx
 *
 * Changes from the original: renders project cards instead of images, sized for a page section
 * rather than a thumbnail; keyboard (arrow keys) and screen-reader support; buttons for the dots;
 * and the site's theme tokens instead of hard-coded zinc/white.
 */
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { usePrefetchPage } from '@/api/queries'
import type { ProjectSummary } from '@/api/types/ProjectSummary'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// The original's spring and 3D math, with the horizontal step scaled to the larger cards.
const SPRING = { type: 'spring', stiffness: 200, damping: 25 } as const
const STEP = '45%'

type ProjectCoverFlowProps = {
  projects: ProjectSummary[]
  className?: string
}

export function ProjectCoverFlow({ projects, className }: ProjectCoverFlowProps) {
  // Start in the middle, like the original, so cards fan out on both sides.
  const [active, setActive] = useState(Math.floor((projects.length - 1) / 2))
  const prefetch = usePrefetchPage()
  const go = (index: number) => setActive(Math.min(projects.length - 1, Math.max(0, index)))

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      go(active + (event.key === 'ArrowLeft' ? -1 : 1))
    }
  }

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Project showcase"
      onKeyDown={onKeyDown}
      className={cn('relative flex flex-col items-center select-none', className)}
    >
      <div className="relative h-[30rem] w-full overflow-hidden [perspective:1000px]">
        <div className="relative flex h-full w-full items-center justify-center [transform-style:preserve-3d]">
          {projects.map((project, index) => {
            const offset = index - active
            const distance = Math.abs(offset)
            const isActive = offset === 0
            return (
              <motion.div
                key={project.slug}
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${projects.length}: ${project.title}`}
                aria-hidden={!isActive}
                className="absolute w-[min(18rem,72vw)]"
                initial={false}
                animate={{
                  x: `calc(${STEP} * ${offset})`,
                  rotateY: isActive ? 0 : offset < 0 ? 38 : -38,
                  z: isActive ? 50 : -distance * 50,
                  scale: isActive ? 1.05 : 1 - distance * 0.08,
                  opacity: distance > 2 ? 0 : 1 - distance * 0.25,
                }}
                transition={SPRING}
                style={{ zIndex: 100 - distance }}
                onClick={() => go(index)}
              >
                <article
                  className={cn(
                    'flex aspect-[4/5] flex-col rounded-xl border bg-card p-6 shadow-2xl shadow-black/15 transition-colors dark:shadow-black/50',
                    isActive ? 'border-gold-dim' : 'cursor-pointer border-border',
                  )}
                >
                  <p className="eyebrow">{project.category}</p>
                  <h3 className="mt-3 text-2xl">{project.title}</h3>
                  <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-prose">{project.summary}</p>
                  <ul className="mt-auto flex flex-wrap gap-1.5">
                    {project.tags.slice(0, 4).map((tag) => (
                      <li key={tag}>
                        <Badge variant="secondary">{tag}</Badge>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={`/projects/${project.slug}`}
                    tabIndex={isActive ? 0 : -1}
                    onMouseEnter={() => prefetch(`/projects/${project.slug}`)}
                    onFocus={() => prefetch(`/projects/${project.slug}`)}
                    onTouchStart={() => prefetch(`/projects/${project.slug}`)}
                    className="mt-5 inline-flex items-center gap-1 text-sm text-primary transition-colors hover:text-heading"
                  >
                    Details
                    <ArrowRight className="size-4" />
                  </Link>
                </article>
              </motion.div>
            )
          })}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1 rounded-full border border-border bg-card/60 px-1 py-0.5 backdrop-blur-md">
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          onClick={() => go(active - 1)}
          disabled={active === 0}
          aria-label="Previous project"
        >
          <ChevronLeft />
        </Button>
        <div className="flex items-center">
          {projects.map((project, index) => (
            <button
              key={project.slug}
              type="button"
              onClick={() => go(index)}
              aria-label={`Show ${project.title}`}
              aria-current={index === active ? 'true' : undefined}
              className="group p-1"
            >
              <span
                className={cn(
                  'block h-1.5 rounded-full transition-all duration-300',
                  index === active ? 'w-5 bg-primary' : 'w-1.5 bg-foreground/30 group-hover:bg-foreground/50',
                )}
              />
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          onClick={() => go(active + 1)}
          disabled={active === projects.length - 1}
          aria-label="Next project"
        >
          <ChevronRight />
        </Button>
      </div>
      <p aria-live="polite" className="sr-only">
        {projects[active]?.title}
      </p>
    </div>
  )
}
