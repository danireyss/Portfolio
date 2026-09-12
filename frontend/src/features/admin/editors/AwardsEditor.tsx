import { EditorForm } from '../EditorForm'
import { LinesField, ListField, TextField } from '../fields'
import type { EditorProps } from '../types'
import { useSiteDraft } from '../useSiteDraft'

export function AwardsEditor({ content, onDone }: EditorProps) {
  const { draft, setDraft, save, pending } = useSiteDraft(content, 'awards')

  return (
    <EditorForm save={save} pending={pending} onDone={onDone}>
      <ListField
        label="Awards"
        items={draft}
        onChange={setDraft}
        newItem={() => ({ title: '', issuer: '', date: '', details: [] })}
        itemLabel={(award, index) => award.title || `Award ${index + 1}`}
        render={(award, update) => (
          <>
            <TextField label="Title" value={award.title} onChange={(title) => update({ ...award, title })} />
            <TextField label="Issuer" value={award.issuer} onChange={(issuer) => update({ ...award, issuer })} />
            <TextField label="Date" hint={'e.g. "Oct 2025"'} value={award.date} onChange={(date) => update({ ...award, date })} />
            <LinesField label="Details" values={award.details} onChange={(details) => update({ ...award, details })} />
          </>
        )}
      />
    </EditorForm>
  )
}
