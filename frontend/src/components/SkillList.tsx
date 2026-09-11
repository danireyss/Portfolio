import { Link } from 'react-router'
import type { Tag } from '@/api/types/Tag'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Each skill links to the projects filtered by it; hovering lists those projects. */
export function SkillList({ skills }: { skills: Tag[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {skills.map((skill) => (
        <li key={skill.name}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to={`/projects?tag=${encodeURIComponent(skill.name)}`}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-gold-dim hover:text-heading"
              >
                {skill.name}
                <span className="font-mono text-xs text-primary">{skill.projects.length}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent>{skill.projects.map((project) => project.title).join(', ')}</TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  )
}
