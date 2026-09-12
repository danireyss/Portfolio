// Longest sides, sharp on high-density screens at the sizes the site shows them.
/** Gallery photos: the photo stack is at most 30rem tall. */
export const PHOTO_SIDE = 1600
/** The headshot: at most 18rem (288px) wide on the home page. */
export const HEADSHOT_SIDE = 640
const QUALITY = 0.82

/**
 * Shrinks an image before it's uploaded: at most `maxSide` pixels on its longest side, as WebP
 * (or JPEG where the browser can't make WebP). Phone photos go from megabytes to a few hundred
 * KB, and the site loads them that much faster. Anything it can't improve (GIFs, which may be
 * animated; a browser without these APIs; a result no smaller) is uploaded as it was.
 */
export async function optimizeImage(file: File, maxSide = PHOTO_SIDE): Promise<File> {
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file
  try {
    // Applies the photo's EXIF rotation, so it's stored the right way up.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = (await encode(canvas, 'image/webp')) ?? (await encode(canvas, 'image/jpeg'))
    if (!blob || blob.size >= file.size) return file
    const extension = blob.type === 'image/webp' ? 'webp' : 'jpg'
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${extension}`, { type: blob.type })
  } catch {
    return file
  }
}

/** The canvas as `type`, or `null` if the browser made something else (it falls back to PNG). */
function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob?.type === type ? blob : null), type, QUALITY),
  )
}
