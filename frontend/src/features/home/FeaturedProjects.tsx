import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import type { ProjectSummary } from '@/api/types/ProjectSummary'
import { ProjectCoverFlow } from '@/components/amicro/ProjectCoverFlow'
import { Reveal } from '@/components/Reveal'
import { ProjectCard } from '@/features/projects/ProjectCard'

/** Amicro's cover flow whenever there's more than one project; a lone project gets a plain card. */
export function FeaturedProjects({ projects }: { projects: ProjectSummary[] }) {
  return (
    <>
      {projects.length > 1 ? (
        <Reveal>
          <ProjectCoverFlow projects={projects} />
        </Reveal>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2">
          {projects.map((project, index) => (
            <li key={project.slug} className="h-full">
              <Reveal delay={index * 0.08} className="h-full">
                <ProjectCard project={project} />
              </Reveal>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/projects"
        className="mt-8 inline-flex items-center gap-1 text-primary transition-colors hover:text-heading"
      >
        See all projects
        <ArrowRight className="size-4" />
      </Link>
    </>
  )
}
