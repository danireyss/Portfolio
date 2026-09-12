import type { Education } from '@/api/types/Education'
import { EditorForm } from '../EditorForm'
import { LinesField, ListField, OptionalTextField, TextField } from '../fields'
import type { EditorProps } from '../types'
import { useSiteDraft } from '../useSiteDraft'

const blank = (): Education => ({ school: '', degree: '', location: '', start: '', end: null, details: [] })

export function EducationEditor({ content, onDone }: EditorProps) {
  const { draft, setDraft, save, pending } = useSiteDraft(content, 'education')

  return (
    <EditorForm save={save} pending={pending} onDone={onDone}>
      <ListField
        label="Schools"
        items={draft}
        onChange={setDraft}
        newItem={blank}
        itemLabel={(school, index) => school.school || `School ${index + 1}`}
        render={(school, update) => (
          <>
            <TextField label="School" value={school.school} onChange={(name) => update({ ...school, school: name })} />
            <TextField label="Degree" value={school.degree} onChange={(degree) => update({ ...school, degree })} />
            <TextField label="Location" value={school.location} onChange={(location) => update({ ...school, location })} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Start" value={school.start} onChange={(start) => update({ ...school, start })} />
              <OptionalTextField
                label="End"
                hint="Empty while you're still there."
                value={school.end}
                onChange={(end) => update({ ...school, end })}
              />
            </div>
            <LinesField label="Details" values={school.details} onChange={(details) => update({ ...school, details })} />
          </>
        )}
      />
    </EditorForm>
  )
}
