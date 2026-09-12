import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { EditorForm } from '../EditorForm'
import { useReorderProjects } from '../queries'
import type { EditorProps } from '../types'
import { ProjectForm } from './ProjectEditor'

/** The projects page: the order projects are listed in, and adding one. */
export function ProjectsEditor({ content, onDone }: EditorProps) {
  const [adding, setAdding] = useState(false)
  const [projects, setProjects] = useState(() => content.projects)
  const reorder = useReorderProjects()

  if (adding) return <ProjectForm content={content} onDone={onDone} />

  const move = (from: number, to: number) => {
    const next = [...projects]
    const [project] = next.splice(from, 1)
    next.splice(to, 0, project)
    setProjects(next)
  }

  return (
    <EditorForm
      save={() => reorder.mutateAsync({ projects, version: content.version })}
      pending={reorder.isPending}
      onDone={onDone}
      extra={
        <Button type="button" variant="outline" onClick={() => setAdding(true)}>
          <Plus data-icon="inline-start" />
          New project
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">
        The order projects are listed in. To change or delete one, use the edit button on its page.
      </p>
      <ol className="grid gap-2">
        {projects.map((project, index) => (
          <li key={project.slug} className="flex items-center gap-2 rounded-lg border border-border py-1 pr-1 pl-3">
            <span className="w-5 font-mono text-xs text-muted-foreground">{index + 1}</span>
            <span className="flex-1 truncate">{project.front.title}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${project.front.title} up`}
              disabled={index === 0}
              onClick={() => move(index, index - 1)}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${project.front.title} down`}
              disabled={index === projects.length - 1}
              onClick={() => move(index, index + 1)}
            >
              <ArrowDown />
            </Button>
          </li>
        ))}
      </ol>
    </EditorForm>
  )
}
