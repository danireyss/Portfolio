/** Fast start, gentle settle; used for entrances across the site. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const

/** Props for a one-time fade-up entrance on mount, staggered by `delay` seconds. */
export const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: EASE_OUT, delay },
})
