import { marked } from 'marked'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import type { AdminContent } from '@/api/types/AdminContent'
import type { FrontMatter } from '@/api/types/FrontMatter'
import type { ProjectSource } from '@/api/types/ProjectSource'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EditorForm } from '../EditorForm'
import { FormError } from '../errors'
import { CheckboxField, ListField, OptionalTextField, TagsField, TextField } from '../fields'
import { useDeleteProject, useSaveProject } from '../queries'
import type { EditorProps } from '../types'

const SLUG = /^[a-z0-9-]+$/

/** "My Cool App!" -> "my-cool-app" */
const slugify = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const blankProject = (order: number): ProjectSource => ({
  slug: '',
  front: {
    title: '',
    category: '',
    summary: '',
    tags: [],
    featured: false,
    order,
    date: null,
    image: null,
    links: [],
  },
  markdown: '## Overview\n\n',
})

/** One project, from its page's edit button. */
export function ProjectEditor({ content, onDone, target }: EditorProps) {
  const source = content.projects.find((project) => project.slug === target)
  if (!source) {
    return <p className="px-4 text-sm text-muted-foreground">This project no longer exists.</p>
  }
  return <ProjectForm content={content} source={source} onDone={onDone} />
}

/** Edits `source`, or creates a project without one. */
export function ProjectForm({
  content,
  source,
  onDone,
}: {
  content: AdminContent
  source?: ProjectSource
  onDone: () => void
}) {
  const isNew = !source
  const navigate = useNavigate()
  const [draft, setDraft] = useState<ProjectSource>(() =>
    structuredClone(source ?? blankProject(content.projects.length)),
  )
  const [slugEdited, setSlugEdited] = useState(false)
  const [preview, setPreview] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const saveProject = useSaveProject()
  const deleteProject = useDeleteProject()
  const front = draft.front
  const setFront = (next: Partial<FrontMatter>) => setDraft({ ...draft, front: { ...front, ...next } })

  const save = async () => {
    if (!SLUG.test(draft.slug)) {
      throw new FormError('The URL name may only use lowercase letters, digits, and dashes.')
    }
    if (isNew && content.projects.some((project) => project.slug === draft.slug)) {
      throw new FormError(`There's already a project at /projects/${draft.slug}.`)
    }
    await saveProject.mutateAsync({
      slug: draft.slug,
      input: { front, markdown: draft.markdown },
      version: content.version,
    })
    if (isNew) navigate(`/projects/${draft.slug}`)
  }

  const remove = async () => {
    try {
      await deleteProject.mutateAsync({ slug: draft.slug, version: content.version })
      toast.success(`Deleted ${front.title || draft.slug}.`)
      onDone()
      navigate('/projects')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't delete it. Please try again.")
    }
  }

  const deleteButtons = isNew ? null : confirmingDelete ? (
    <div className="flex items-center gap-1">
      <Button type="button" variant="destructive" onClick={remove} disabled={deleteProject.isPending}>
        Delete for good
      </Button>
      <Button type="button" variant="ghost" onClick={() => setConfirmingDelete(false)}>
        Keep
      </Button>
    </div>
  ) : (
    <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmingDelete(true)}>
      Delete
    </Button>
  )

  return (
    <EditorForm save={save} pending={saveProject.isPending} onDone={onDone} extra={deleteButtons}>
      <TextField
        label="Title"
        value={front.title}
        onChange={(title) => {
          setFront({ title })
          if (isNew && !slugEdited) setDraft((current) => ({ ...current, slug: slugify(title), front: { ...current.front, title } }))
        }}
      />
      {isNew && (
        <TextField
          label="URL name"
          hint={`Lowercase letters, digits, and dashes: /projects/${draft.slug || 'my-project'}. It can't be changed later.`}
          value={draft.slug}
          onChange={(slug) => {
            setSlugEdited(true)
            setDraft({ ...draft, slug })
          }}
        />
      )}
      <TextField
        label="Category"
        hint={'The small label above the title, e.g. "Full-stack".'}
        value={front.category}
        onChange={(category) => setFront({ category })}
      />
      <TextField label="Summary" rows={2} value={front.summary} onChange={(summary) => setFront({ summary })} />
      <TagsField
        label="Tags"
        hint="The technologies used, separated by commas. They become the home page's skills."
        values={front.tags}
        onChange={(tags) => setFront({ tags })}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <OptionalTextField label="Date" hint={'e.g. "Sep 2026"'} value={front.date} onChange={(date) => setFront({ date })} />
        <OptionalTextField label="Image" hint="An image path, shown above the write-up." value={front.image} onChange={(image) => setFront({ image })} />
      </div>
      <CheckboxField
        label="Featured"
        hint="Featured projects come first in the home page's showcase."
        checked={front.featured}
        onChange={(featured) => setFront({ featured })}
      />
      <ListField
        label="Links"
        items={front.links}
        onChange={(links) => setFront({ links })}
        newItem={() => ({ label: 'Source', url: '' })}
        itemLabel={(link, index) => link.label || `Link ${index + 1}`}
        render={(link, update) => (
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <TextField label="Label" value={link.label} onChange={(label) => update({ ...link, label })} />
            <TextField label="URL" type="url" value={link.url} onChange={(url) => update({ ...link, url })} />
          </div>
        )}
      />
      <MarkdownField
        value={draft.markdown}
        onChange={(markdown) => setDraft({ ...draft, markdown })}
        preview={preview}
        onPreviewChange={setPreview}
      />
    </EditorForm>
  )
}

/** The write-up, in Markdown, with a preview close to how the page renders it. */
function MarkdownField({
  value,
  onChange,
  preview,
  onPreviewChange,
}: {
  value: string
  onChange: (value: string) => void
  preview: boolean
  onPreviewChange: (preview: boolean) => void
}) {
  // Your own Markdown, shown only to you.
  const html = useMemo(() => (preview ? (marked.parse(value, { async: false }) as string) : ''), [preview, value])
  const tab = (active: boolean) =>
    cn('rounded-md px-2.5 py-1 text-sm transition-colors', active ? 'bg-muted text-heading' : 'text-muted-foreground hover:text-heading')

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{preview ? 'Preview' : ''}</span>
        <div className="flex gap-1" role="group" aria-label="Write-up view">
          <button type="button" className={tab(!preview)} aria-pressed={!preview} onClick={() => onPreviewChange(false)}>
            Write
          </button>
          <button type="button" className={tab(preview)} aria-pressed={preview} onClick={() => onPreviewChange(true)}>
            Preview
          </button>
        </div>
      </div>
      {preview ? (
        <div
          className="prose prose-portfolio max-w-none rounded-md border border-border p-4"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <TextField
          label="Write-up"
          rows={16}
          className="font-mono text-sm"
          hint="Markdown: ## for headings, - for bullets, **bold**, [links](https://…)."
          value={value}
          onChange={onChange}
        />
      )}
    </div>
  )
}
