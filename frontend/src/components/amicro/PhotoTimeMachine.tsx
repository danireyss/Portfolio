/*
 * Adapted from Amicro's CardTimeMachine (MIT License, Copyright (c) 2026 Syed Subhan Uddin):
 * https://github.com/Subhan-code/Amicro--Micro-transitions-/blob/main/src/components/cards/CardTimeMachine.tsx
 *
 * Changes from the original: takes photos as props and is sized for a page section instead of a
 * thumbnail; clicking the stack or pressing the arrow keys steps through it; a caption under the
 * stack; screen-reader labels; a unique SVG filter id per instance; the site's theme tokens
 * instead of hard-coded blue/white; and no surrounding panel, with each card taking its photo's
 * own shape (portrait or landscape) instead of a fixed frame.
 */
import { AnimatePresence, motion } from 'motion/react'
import { useId, useState, type KeyboardEvent } from 'react'
import type { Photo } from '@/api/types/Photo'
import { STACK_DEPTH } from '@/lib/photos'
import { cn } from '@/lib/utils'

// The original's springs and 3D offsets; vertical steps are a percentage of the photo height.
const STACK_SPRING = { type: 'spring', stiffness: 250, damping: 25, mass: 0.8 } as const
const TICK_SPRING = { type: 'spring', stiffness: 400, damping: 25 } as const
/** Minor ticks drawn between each pair of photos on the scrubber. */
const SUB_TICKS = 2

type Tick = { kind: 'main' | 'sub'; index: number }

type PhotoTimeMachineProps = {
  photos: Photo[]
  className?: string
}

export function PhotoTimeMachine({ photos, className }: PhotoTimeMachineProps) {
  const [active, setActive] = useState(0)
  const [hovered, setHovered] = useState<number | null>(null)
  // useId contains characters that aren't valid in url(#...), so keep only the safe ones.
  const filterId = `time-machine-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`

  const go = (index: number) => setActive(Math.min(photos.length - 1, Math.max(0, index)))
  const scrubTo = (index: number) => {
    setHovered(index)
    setActive(Math.round(index))
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.key]
    if (step) {
      event.preventDefault()
      go(active + step)
    }
  }

  const ticks: Tick[] = photos.flatMap((_, i) => [
    { kind: 'main' as const, index: i },
    ...(i < photos.length - 1
      ? Array.from({ length: SUB_TICKS }, (_, j) => ({
          kind: 'sub' as const,
          index: i + (j + 1) / (SUB_TICKS + 1),
        }))
      : []),
  ])
  // Photos without a date in site.toml fall back to their position.
  const tickLabel = (photo: Photo, index: number) => photo.date ?? `#${index + 1}`
  const label = (photo: Photo, index: number) =>
    `${photo.date ?? `Photo ${index + 1}`}: ${photo.caption ?? photo.alt}`
  const current = photos[active]!

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Photo stack"
      onKeyDown={onKeyDown}
      className={cn('flex flex-col gap-5', className)}
    >
      {/* Blur + alpha threshold gives each photo softly "squircled" corners, as in the original. */}
      <svg aria-hidden="true" className="absolute size-0">
        <defs>
          <filter id={filterId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -6"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      {/* overflow-hidden clips photos as they fly out of the stack. */}
      <div className="relative flex items-center gap-3 overflow-hidden py-4 sm:gap-6">

        {/* The stack. Clicking steps forward, wrapping to the first photo. */}
        <div
          className="relative flex h-[26rem] min-w-0 flex-1 cursor-pointer items-center justify-center [perspective:800px] sm:h-[34rem]"
          onClick={() => setActive(active === photos.length - 1 ? 0 : active + 1)}
        >
          {photos.map((photo, i) => {
            const offset = i - active
            const isPast = offset < 0
            const loading = Math.abs(offset) < STACK_DEPTH ? 'eager' : 'lazy'
            return (
              <motion.div
                key={photo.src}
                aria-hidden={i !== active}
                className="absolute max-w-[92%] origin-center overflow-hidden rounded-2xl shadow-2xl shadow-black/25 dark:shadow-black/60"
                initial={false}
                animate={{
                  z: isPast ? 200 : -offset * 60,
                  y: isPast ? '160%' : `${-offset * 9}%`,
                  rotateX: isPast ? -20 : offset * 2,
                  opacity: isPast ? 0 : Math.max(0, 1 - offset * 0.2),
                  scale: isPast ? 1.3 : 1,
                }}
                transition={STACK_SPRING}
                style={{ zIndex: photos.length - i, filter: `url(#${filterId})` }}
              >
                {/* The card shrink-wraps the photo, so portrait and landscape both show whole. */}
                <img
                  src={photo.src}
                  alt={photo.alt}
                  loading={loading}
                  decoding="async"
                  draggable={false}
                  className="block h-auto max-h-[22rem] w-auto max-w-full sm:max-h-[30rem]"
                />
                <div className="pointer-events-none absolute inset-0 bg-black/10" />
              </motion.div>
            )
          })}
        </div>

        {/* Timeline scrubber: hover to travel through the stack, click or Tab + Enter to pick. */}
        <div
          className="relative z-10 flex flex-col items-end py-2"
          onMouseLeave={() => setHovered(null)}
        >
          {ticks.map((tick) => {
            if (tick.kind === 'sub') {
              const isNear = hovered !== null && Math.abs(tick.index - hovered) <= 0.5
              return (
                <div
                  key={`sub-${tick.index}`}
                  aria-hidden="true"
                  className="flex w-20 cursor-pointer justify-end py-[3px]"
                  onMouseEnter={() => scrubTo(tick.index)}
                  onClick={() => go(Math.round(tick.index))}
                >
                  <motion.span
                    className="block h-[3px] w-6 origin-right rounded-full bg-foreground/20"
                    animate={{ scaleX: isNear ? 1.15 : 1, opacity: isNear ? 0.5 : 0.3 }}
                    transition={TICK_SPRING}
                  />
                </div>
              )
            }

            const photo = photos[tick.index]!
            const isSelected = active === tick.index
            const isNear = hovered !== null && Math.abs(tick.index - hovered) < 0.5
            return (
              <button
                key={`main-${tick.index}`}
                type="button"
                aria-label={label(photo, tick.index)}
                aria-current={isSelected ? 'true' : undefined}
                className="group relative inline-flex w-20 items-center justify-end py-[3px]"
                onMouseEnter={() => scrubTo(tick.index)}
                onFocus={() => setHovered(tick.index)}
                onBlur={() => setHovered(null)}
                onClick={() => go(tick.index)}
              >
                {hovered === tick.index && (
                  <motion.span
                    aria-hidden="true"
                    className={cn(
                      'absolute top-1/2 right-9 -translate-y-1/2 font-mono text-[10px] whitespace-nowrap',
                      isSelected ? 'text-primary' : 'text-foreground/90',
                    )}
                    initial={{ opacity: 0, filter: 'blur(2px)', scale: 0.8 }}
                    animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
                    transition={{ duration: 0.15 }}
                  >
                    {tickLabel(photo, tick.index)}
                  </motion.span>
                )}
                <motion.span
                  className={cn(
                    'block h-[3px] w-6 origin-right rounded-full transition-colors',
                    isSelected ? 'bg-primary' : 'bg-foreground/50 group-hover:bg-foreground/80',
                  )}
                  animate={{ scaleX: hovered === null ? 1 : isSelected ? 1.4 : isNear ? 1.25 : 1 }}
                  transition={TICK_SPRING}
                />
              </button>
            )
          })}
        </div>
      </div>

      <div aria-live="polite" className="min-h-12">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            <p className="font-mono text-xs text-muted-foreground">
              {current.date && <span className="text-primary">{current.date} · </span>}
              {active + 1} / {photos.length}
            </p>
            {current.caption && <p className="mt-1 text-prose">{current.caption}</p>}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
