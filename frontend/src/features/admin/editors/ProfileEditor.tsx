import type { Profile } from '@/api/types/Profile'
import { EditorForm } from '../EditorForm'
import { OptionalTextField, TextField } from '../fields'
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
      <OptionalTextField
        label="Headshot"
        hint="The image's path, e.g. /headshot.jpg. Leave empty for none."
        value={draft.headshot}
        onChange={set('headshot')}
      />
    </EditorForm>
  )
}
