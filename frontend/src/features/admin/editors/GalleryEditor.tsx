import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { usePhotos } from '@/api/queries'
import type { GalleryConfig } from '@/api/types/GalleryConfig'
import type { PhotoDetails } from '@/api/types/PhotoDetails'
import { Button } from '@/components/ui/button'
import { EditorForm } from '../EditorForm'
import { OptionalTextField, TextField, UploadField } from '../fields'
import { useDeletePhoto, useUpload } from '../queries'
import type { EditorProps } from '../types'
import { useSiteDraft } from '../useSiteDraft'

const NO_DETAILS: PhotoDetails = { alt: null, caption: null, date: null }

/**
 * One gallery: its title and description, its photos' captions, and adding or deleting photos.
 * Uploads and deletions happen right away; the text fields wait for Save.
 */
export function GalleryEditor({ content, onDone, target: folder = '' }: EditorProps) {
  const { draft, setDraft, save, pending } = useSiteDraft(content, 'galleries')
  const photos = usePhotos()
  const upload = useUpload()
  const deletePhoto = useDeletePhoto()

  const index = draft.findIndex((gallery) => gallery.folder === folder)
  if (index < 0) {
    return <p className="px-4 text-sm text-muted-foreground">This gallery no longer exists.</p>
  }
  const gallery = draft[index]
  const update = (next: GalleryConfig) => setDraft(draft.map((g, i) => (i === index ? next : g)))
  const details = (file: string) => gallery.photos[file] ?? NO_DETAILS
  const setDetails = (file: string, next: Partial<PhotoDetails>) =>
    update({ ...gallery, photos: { ...gallery.photos, [file]: { ...details(file), ...next } } })

  // The photos actually in the folder, in the order they're shown.
  const files = (photos.data?.galleries.find((g) => g.folder === folder)?.photos ?? []).map((photo) => ({
    src: photo.src,
    file: decodeURIComponent(photo.src.split('/').pop() ?? ''),
  }))

  const remove = (file: string) =>
    deletePhoto.mutate(
      { folder, file },
      {
        onSuccess: () => toast.success(`Deleted ${file}.`),
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : `Couldn't delete ${file}.`),
      },
    )

  return (
    <EditorForm save={save} pending={pending} onDone={onDone}>
      <TextField label="Title" value={gallery.title} onChange={(title) => update({ ...gallery, title })} />
      <OptionalTextField
        label="Description"
        rows={2}
        value={gallery.description}
        onChange={(description) => update({ ...gallery, description })}
      />
      <UploadField
        label="Add photos"
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
        multiple
        hint="They go live as soon as they finish uploading, shown in file-name order."
        onUpload={async (picked) => {
          await upload.mutateAsync({ kind: 'photo', files: picked, folder })
          toast.success(picked.length === 1 ? 'Photo added.' : `${picked.length} photos added.`)
        }}
      />

      <fieldset className="grid gap-3">
        <legend className="mb-3 text-sm font-medium">Photos</legend>
        {files.length === 0 && <p className="text-sm text-muted-foreground">No photos yet.</p>}
        {files.map(({ src, file }) => (
          <div key={file} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[6rem_1fr]">
            <img src={src} alt="" className="aspect-square w-24 rounded-md object-cover" />
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-mono text-xs text-muted-foreground">{file}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${file}`}
                  disabled={deletePhoto.isPending}
                  onClick={() => remove(file)}
                >
                  <Trash2 />
                </Button>
              </div>
              <OptionalTextField
                label="Caption"
                value={details(file).caption}
                onChange={(caption) => setDetails(file, { caption })}
              />
              <OptionalTextField
                label="Date"
                hint={'Shown on the timeline, e.g. "Jun 2026".'}
                value={details(file).date}
                onChange={(date) => setDetails(file, { date })}
              />
              <OptionalTextField
                label="Description for screen readers"
                value={details(file).alt}
                onChange={(alt) => setDetails(file, { alt })}
              />
            </div>
          </div>
        ))}
      </fieldset>
    </EditorForm>
  )
}
