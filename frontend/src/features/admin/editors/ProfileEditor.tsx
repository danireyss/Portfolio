import type { Profile } from '@/api/types/Profile'
import { uploadFile } from '../api'
import { EditorForm } from '../EditorForm'
import { OptionalTextField, TextField, UploadField } from '../fields'
import type { EditorProps } from '../types'
import { useSiteDraft } from '../useSiteDraft'

/** The hero: name, headline, location, tagline, email, and headshot. */
export function ProfileEditor({ content, onDone }: EditorProps) {
  const { draft, setDraft, save, pending } = useSiteDraft(content, 'profile')
  const set =
    <F extends keyof Profile>(field: F) =>
    (value: Profile[F]) =>
      setDraft({ ...draft, [field]: value })

  return (
    <EditorForm save={save} pending={pending} onDone={onDone}>
      <TextField label="Name" value={draft.name} onChange={set('name')} />
      <TextField
        label="Headline"
        hint={'The role shown above your name, e.g. "Software Engineer".'}
        value={draft.headline}
        onChange={set('headline')}
      />
      <TextField label="Location" value={draft.location} onChange={set('location')} />
      <TextField label="Tagline" rows={3} value={draft.tagline} onChange={set('tagline')} />
      <TextField label="Email" type="email" value={draft.email} onChange={set('email')} />

      <div className="flex items-center gap-4">
        {draft.headshot && (
          <img src={draft.headshot} alt="" className="size-16 shrink-0 rounded-full object-cover ring-1 ring-border" />
        )}
        <div className="flex-1">
          <UploadField
            label="Upload a new headshot"
            accept="image/jpeg,image/png,image/webp,image/avif"
            hint="It goes live when you save."
            onUpload={async ([file]) => set('headshot')(await uploadFile('headshot', file))}
          />
        </div>
      </div>
      <OptionalTextField
        label="Headshot"
        hint="The image's path. Leave empty for none."
        value={draft.headshot}
        onChange={set('headshot')}
      />
    </EditorForm>
  )
}
