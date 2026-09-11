import { ArrowRight } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import { useProjects, useSite } from '@/api/queries'
import type { Experience } from '@/api/types/Experience'
import type { Profile } from '@/api/types/Profile'
import type { ProjectSummary } from '@/api/types/ProjectSummary'
import { PageMeta } from '@/components/PageMeta'
import { ErrorState, PageSkeleton } from '@/components/PageState'
import { ProjectCard } from '@/components/ProjectCard'
import { Reveal } from '@/components/Reveal'
import { Section } from '@/components/Section'
import { SkillList } from '@/components/SkillList'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { externalLinkProps, initials } from '@/lib/format'
import { fadeUp } from '@/lib/motion'

export function Home() {
  const site = useSite()
  const projects = useProjects()

  if (site.isPending) return <PageSkeleton />
  if (site.error) return <ErrorState onRetry={() => site.refetch()} />

  const { profile, about, current_role, skills } = site.data
  const featured = projects.data?.projects.filter((project) => project.featured) ?? []

  return (
    <>
      <PageMeta description={`${profile.name}, ${profile.headline}. ${profile.tagline}`} />
      <Hero profile={profile} />

      <Section id="about" eyebrow="About" title="Background & focus">
        <div className="grid gap-10 md:grid-cols-[3fr_2fr]">
          <Reveal className="space-y-4 leading-relaxed text-prose">
            {about.background.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </Reveal>
          {about.focus_areas.length > 0 && (
            <Reveal delay={0.1}>
              <h3 className="text-xl">Focus areas</h3>
              <ul className="mt-4 space-y-4">
                {about.focus_areas.map((area) => (
                  <li key={area.title} className="border-l-2 border-gold-dim pl-4">
                    <p className="font-medium text-heading">{area.title}</p>
                    <p className="text-sm text-muted-foreground">{area.description}</p>
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
        </div>
      </Section>

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

      {featured.length > 0 && (
        <Section id="featured" eyebrow="Selected work" title="Featured projects">
          <FeaturedProjects projects={featured} />
        </Section>
      )}
    </>
  )
}

function Hero({ profile }: { profile: Profile }) {
  return (
    <section className="flex flex-col-reverse items-start gap-10 py-16 md:flex-row md:items-center md:justify-between md:py-24">
      <div className="max-w-xl">
        <motion.p className="eyebrow" {...fadeUp(0)}>
          {profile.headline} · {profile.location}
        </motion.p>
        <motion.h1 className="mt-4 text-5xl leading-[1.05] md:text-6xl" {...fadeUp(0.08)}>
          Hi, I'm <span className="text-primary italic">{profile.name}</span>
        </motion.h1>
        <motion.p className="mt-6 text-lg leading-relaxed text-prose" {...fadeUp(0.16)}>
          {profile.tagline}
        </motion.p>
        <motion.div className="mt-8 flex flex-wrap gap-3" {...fadeUp(0.24)}>
          <Button asChild size="lg">
            <Link to="/projects">
              View projects
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/contact">Get in touch</Link>
          </Button>
        </motion.div>
      </div>
      {profile.headshot && (
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          <Avatar className="size-36 ring-1 ring-border md:size-44">
            <AvatarImage src={profile.headshot} alt={profile.name} />
            <AvatarFallback className="font-heading text-3xl">{initials(profile.name)}</AvatarFallback>
          </Avatar>
        </motion.div>
      )}
    </section>
  )
}

function CurrentRole({ role }: { role: Experience }) {
  const company = role.company_url ? (
    <a href={role.company_url} className="text-primary hover:underline" {...externalLinkProps(role.company_url)}>
      {role.company}
    </a>
  ) : (
    role.company
  )
  return (
    <Reveal>
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl text-heading">{role.title}</CardTitle>
          <CardDescription>
            {company} · {role.location} · since {role.start}
          </CardDescription>
        </CardHeader>
        {role.summary && (
          <CardContent>
            <p className="text-prose">{role.summary}</p>
          </CardContent>
        )}
      </Card>
    </Reveal>
  )
}

// Step 5 swaps this grid for an Amicro card layout.
function FeaturedProjects({ projects }: { projects: ProjectSummary[] }) {
  return (
    <>
      <ul className="grid gap-5 sm:grid-cols-2">
        {projects.map((project, index) => (
          <Reveal key={project.slug} delay={index * 0.08} className="h-full">
            <li className="h-full">
              <ProjectCard project={project} />
            </li>
          </Reveal>
        ))}
      </ul>
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
