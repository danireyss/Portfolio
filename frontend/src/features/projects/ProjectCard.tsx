import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import type { ProjectSummary } from '@/api/types/ProjectSummary'
import { TechIcon } from '@/components/TechIcon'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Card className="group relative h-full transition-colors hover:border-gold-dim has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring">
      <CardHeader>
        <p className="eyebrow">{project.category}</p>
        <CardTitle className="font-heading text-2xl text-heading">
          {/* Stretched link: the whole card is clickable, but only the title is announced. */}
          <Link to={`/projects/${project.slug}`} className="outline-none after:absolute after:inset-0">
            {project.title}
          </Link>
        </CardTitle>
        <CardDescription className="text-prose">{project.summary}</CardDescription>
      </CardHeader>
      {project.tags.length > 0 && (
        <CardContent>
          <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
            {project.tags.map((tag) => (
              <li key={tag}>
                <Badge variant="secondary">
                  <TechIcon name={tag} data-icon="inline-start" />
                  {tag}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
      <CardFooter className="mt-auto">
        <span className="inline-flex items-center gap-1 text-sm text-primary" aria-hidden="true">
          Details
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </span>
      </CardFooter>
    </Card>
  )
}
