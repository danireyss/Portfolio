import type { Social } from '@/api/types/Social'
import type { SocialKind } from '@/api/types/SocialKind'
import { EditorForm } from '../EditorForm'
import { ListField, SelectField, TextField } from '../fields'
import type { EditorProps } from '../types'
import { useSiteDraft } from '../useSiteDraft'

const KINDS = [
  { value: 'github', label: 'GitHub' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'email', label: 'Email' },
  { value: 'website', label: 'Website' },
  { value: 'x', label: 'X' },
] as const satisfies readonly { value: SocialKind; label: string }[]

/** The links in the footer and on the contact and resume pages. */
export function SocialsEditor({ content, onDone }: EditorProps) {
  const { draft, setDraft, save, pending } = useSiteDraft(content, 'socials')

  return (
    <EditorForm save={save} pending={pending} onDone={onDone}>
      <ListField
        label="Links"
        items={draft}
        onChange={setDraft}
        newItem={(): Social => ({ kind: 'website', label: '', url: '' })}
        itemLabel={(social, index) => social.label || `Link ${index + 1}`}
        render={(social, update) => (
          <>
            <SelectField
              label="Kind"
              value={social.kind}
              options={KINDS}
              onChange={(kind) => update({ ...social, kind })}
            />
            <TextField label="Label" value={social.label} onChange={(label) => update({ ...social, label })} />
            <TextField
              label="URL"
              type="url"
              hint="For email, use mailto:you@example.com."
              value={social.url}
              onChange={(url) => update({ ...social, url })}
            />
          </>
        )}
      />
    </EditorForm>
  )
}
