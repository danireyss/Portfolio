import { EditorForm } from '../EditorForm'
import { ListField, TextField } from '../fields'
import type { EditorProps } from '../types'
import { useSiteDraft } from '../useSiteDraft'

/** The home page's "Background & focus": background paragraphs and focus areas. */
export function AboutEditor({ content, onDone }: EditorProps) {
  const { draft, setDraft, save, pending } = useSiteDraft(content, 'about')

  return (
    <EditorForm save={save} pending={pending} onDone={onDone}>
      <ListField
        label="Background"
        items={draft.background}
        onChange={(background) => setDraft({ ...draft, background })}
        newItem={() => ''}
        itemLabel={(_, index) => `Paragraph ${index + 1}`}
        render={(paragraph, update, index) => (
          <TextField label={`Paragraph ${index + 1}`} rows={4} value={paragraph} onChange={update} />
        )}
      />
      <ListField
        label="Focus areas"
        items={draft.focus_areas}
        onChange={(focus_areas) => setDraft({ ...draft, focus_areas })}
        newItem={() => ({ title: '', description: '' })}
        itemLabel={(area, index) => area.title || `Focus area ${index + 1}`}
        render={(area, update) => (
          <>
            <TextField label="Title" value={area.title} onChange={(title) => update({ ...area, title })} />
            <TextField
              label="Description"
              rows={2}
              value={area.description}
              onChange={(description) => update({ ...area, description })}
            />
          </>
        )}
      />
    </EditorForm>
  )
}
