import type { PhotosResponse } from '@/api/types/PhotosResponse'

/**
 * How many photos of a stack show before any scrubbing: the one on top and the two behind it.
 * PhotoTimeMachine loads these eagerly and the rest lazily.
 */
export const STACK_DEPTH = 3

const requested = new Set<string>()

/**
 * Starts downloading the photos each gallery's stack shows first, so they're usually in the
 * browser's cache by the time the photos page opens. Each is requested at most once per visit.
 */
export function preloadStackPhotos({ galleries }: PhotosResponse) {
  for (const gallery of galleries) {
    for (const { src } of gallery.photos.slice(0, STACK_DEPTH)) {
      if (requested.has(src)) continue
      requested.add(src)
      new Image().src = src
    }
  }
}
