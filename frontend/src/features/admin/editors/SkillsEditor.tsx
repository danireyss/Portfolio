import { EditorForm } from '../EditorForm'
import { ListField, TagsField, TextField } from '../fields'
import type { EditorProps } from '../types'
import { useSiteDraft } from '../useSiteDraft'

/** The resume's skill groups. (The home page's skills come from the projects' tags.) */
export function SkillsEditor({ content, onDone }: EditorProps) {
  const { draft, setDraft, save, pending } = useSiteDraft(content, 'skill_groups')

  return (
    <EditorForm save={save} pending={pending} onDone={onDone}>
      <ListField
        label="Skill groups"
        items={draft}
        onChange={setDraft}
        newItem={() => ({ name: '', skills: [] })}
        itemLabel={(group, index) => group.name || `Group ${index + 1}`}
        render={(group, update) => (
          <>
            <TextField
              label="Name"
              hint={'e.g. "Languages"'}
              value={group.name}
              onChange={(name) => update({ ...group, name })}
            />
            <TagsField label="Skills" values={group.skills} onChange={(skills) => update({ ...group, skills })} />
          </>
        )}
      />
    </EditorForm>
  )
}
