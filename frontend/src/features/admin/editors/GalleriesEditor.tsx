import type { GalleryConfig } from '@/api/types/GalleryConfig'
import { EditorForm } from '../EditorForm'
import { ListField, OptionalTextField, TextField } from '../fields'
import type { EditorProps } from '../types'
import { useSiteDraft } from '../useSiteDraft'

const blank = (): GalleryConfig => ({ folder: '', title: '', description: null, photos: {} })

/** The photos page's galleries: which there are, in what order. */
export function GalleriesEditor({ content, onDone }: EditorProps) {
  const { draft, setDraft, save, pending } = useSiteDraft(content, 'galleries')

  return (
    <EditorForm save={save} pending={pending} onDone={onDone}>
      <p className="text-sm text-muted-foreground">
        Each gallery shows the photos in its folder. Add photos with a gallery's own edit button.
      </p>
      <ListField
        label="Galleries"
        items={draft}
        onChange={setDraft}
        newItem={blank}
        itemLabel={(gallery, index) => gallery.title || `Gallery ${index + 1}`}
        render={(gallery, update) => (
          <>
            <TextField label="Title" value={gallery.title} onChange={(title) => update({ ...gallery, title })} />
            <OptionalTextField
              label="Description"
              rows={2}
              value={gallery.description}
              onChange={(description) => update({ ...gallery, description })}
            />
            <TextField
              label="Folder"
              hint="Lowercase letters, digits, and dashes. Renaming it doesn't move photos already uploaded."
              value={gallery.folder}
              onChange={(folder) => update({ ...gallery, folder })}
            />
          </>
        )}
      />
    </EditorForm>
  )
}
