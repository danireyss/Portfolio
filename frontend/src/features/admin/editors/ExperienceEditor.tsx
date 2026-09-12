import type { Experience } from '@/api/types/Experience'
import { EditorForm } from '../EditorForm'
import { LinesField, ListField, OptionalTextField, TextField } from '../fields'
import type { EditorProps } from '../types'
import { useSiteDraft } from '../useSiteDraft'

const blank = (): Experience => ({
  company: '',
  company_url: null,
  title: '',
  location: '',
  start: '',
  end: null,
  summary: null,
  bullets: [],
})

export function ExperienceEditor({ content, onDone }: EditorProps) {
  const { draft, setDraft, save, pending } = useSiteDraft(content, 'experience')

  return (
    <EditorForm save={save} pending={pending} onDone={onDone}>
      <p className="text-sm text-muted-foreground">
        The first job without an end date is the home page's current role.
      </p>
      <ListField
        label="Jobs"
        items={draft}
        onChange={setDraft}
        newItem={blank}
        itemLabel={(job, index) => [job.title, job.company].filter(Boolean).join(' · ') || `Job ${index + 1}`}
        render={(job, update) => (
          <>
            <TextField label="Title" value={job.title} onChange={(title) => update({ ...job, title })} />
            <TextField label="Company" value={job.company} onChange={(company) => update({ ...job, company })} />
            <OptionalTextField
              label="Company website"
              type="url"
              value={job.company_url}
              onChange={(company_url) => update({ ...job, company_url })}
            />
            <TextField label="Location" value={job.location} onChange={(location) => update({ ...job, location })} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Start" hint={'e.g. "Jun 2023"'} value={job.start} onChange={(start) => update({ ...job, start })} />
              <OptionalTextField
                label="End"
                hint="Empty while it's current."
                value={job.end}
                onChange={(end) => update({ ...job, end })}
              />
            </div>
            <OptionalTextField
              label="Summary"
              rows={2}
              hint="One line for the home page's current role."
              value={job.summary}
              onChange={(summary) => update({ ...job, summary })}
            />
            <LinesField label="Bullets" values={job.bullets} onChange={(bullets) => update({ ...job, bullets })} />
          </>
        )}
      />
    </EditorForm>
  )
}
