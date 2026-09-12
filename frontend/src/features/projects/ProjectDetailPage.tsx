import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { useProject } from '@/api/queries'
import type { Project } from '@/api/types/Project'
import { AdminEdit } from '@/components/AdminEdit'
import { NotFound } from '@/components/NotFound'
import { PageMeta } from '@/components/PageMeta'
import { QueryState } from '@/components/QueryState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { externalLinkProps } from '@/lib/format'

export function ProjectDetailPage() {
  const { slug = '' } = useParams()
  const project = useProject(slug)

  return (
    <QueryState
      query={project}
      notFound={
        <NotFound
          title="Project not found"
          message="That project doesn't exist, or it's been renamed."
          backTo={{ to: '/projects', label: 'All projects' }}
        />
      }
    >
      {(project) => <ProjectArticle project={project} />}
    </QueryState>
  )
}

function ProjectArticle({ project }: { project: Project }) {
  return (
    <article className="py-12 md:py-16">
      <PageMeta title={project.title} description={project.summary} />
      <Link
        to="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="size-4" />
        All projects
      </Link>

      <header className="mt-8">
        <p className="eyebrow">
          {project.category}
          {project.date && ` · ${project.date}`}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-4xl md:text-5xl">{project.title}</h1>
          <AdminEdit section="project" target={project.slug} label={project.title} />
        </div>
        <p className="mt-4 text-lg text-prose">{project.summary}</p>
        {project.tags.length > 0 && (
          <ul className="mt-6 flex flex-wrap gap-1.5" aria-label="Tech stack">
            {project.tags.map((tag) => (
              <li key={tag}>
                <Badge variant="secondary">{tag}</Badge>
              </li>
            ))}
          </ul>
        )}
        {project.links.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {project.links.map((link) => (
              <Button key={link.url} asChild variant="outline" size="sm">
                <a href={link.url} {...externalLinkProps(link.url)}>
                  {link.label}
                  <ArrowUpRight data-icon="inline-end" />
                </a>
              </Button>
            ))}
          </div>
        )}
      </header>

      {project.image && (
        <img src={project.image} alt="" className="mt-10 w-full rounded-lg border border-border" />
      )}

      <Separator className="my-10" />
      {/* Rendered by the backend from the repo's own Markdown (pulldown-cmark), never user input. */}
      <div
        className="prose prose-portfolio max-w-none"
        dangerouslySetInnerHTML={{ __html: project.body_html }}
      />
    </article>
  )
}
