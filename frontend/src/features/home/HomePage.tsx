import { useProjects, useSite } from '@/api/queries'
import type { ProjectSummary } from '@/api/types/ProjectSummary'
import { PageMeta } from '@/components/PageMeta'
import { QueryState } from '@/components/QueryState'
import { Reveal } from '@/components/Reveal'
import { Section } from '@/components/Section'
import { AboutSection } from './AboutSection'
import { CurrentRole } from './CurrentRole'
import { FeaturedProjects } from './FeaturedProjects'
import { Hero } from './Hero'
import { SkillList } from './SkillList'

/** How many projects the home page shows when fewer than this are marked featured. */
const SHOWCASE_SIZE = 3

export function HomePage() {
  const site = useSite()
  const projects = useProjects()

  return (
    <QueryState query={site}>
      {({ profile, about, current_role, skills }) => {
        const showcase = pickShowcase(projects.data?.projects ?? [])
        return (
          <>
            <PageMeta description={`${profile.name}, ${profile.headline}. ${profile.tagline}`} />
            <Hero profile={profile} />
            <AboutSection about={about} />

            {skills.length > 0 && (
              <Section id="skills" eyebrow="Skills" title="What I work with">
                <Reveal>
                  <SkillList skills={skills} />
                </Reveal>
              </Section>
            )}

            {current_role && (
              <Section id="current-role" eyebrow="Now" title="Current role">
                <CurrentRole role={current_role} />
              </Section>
            )}

            {showcase.length > 0 && (
              <Section id="featured" eyebrow="Selected work" title="Featured projects">
                <FeaturedProjects projects={showcase} />
              </Section>
            )}
          </>
        )
      }}
    </QueryState>
  )
}

/** Featured projects first; with fewer than SHOWCASE_SIZE featured, fill in with the rest. */
function pickShowcase(projects: ProjectSummary[]) {
  const featured = projects.filter((project) => project.featured)
  if (featured.length >= SHOWCASE_SIZE) return featured
  const others = projects.filter((project) => !project.featured)
  return [...featured, ...others].slice(0, SHOWCASE_SIZE)
}
