import { ArrowUpRight, Download } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { RESUME_PDF_URL } from '@/api/client'
import { useResume } from '@/api/queries'
import { PageMeta } from '@/components/PageMeta'
import { ErrorState, PageSkeleton } from '@/components/PageState'
import { Reveal } from '@/components/Reveal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { externalLinkProps, formatDates } from '@/lib/format'

export function Resume() {
  const { data, error, isPending, refetch } = useResume()

  if (isPending) return <PageSkeleton />
  if (error) return <ErrorState onRetry={() => refetch()} />

  const { profile, experience, education, skill_groups, has_pdf } = data

  return (
    <>
      <PageMeta title="Resume" description={`${profile.name}'s experience, education, and skills.`} />
      <header className="flex flex-col gap-6 py-16 md:flex-row md:items-end md:justify-between md:py-20">
        <div>
          <p className="eyebrow">Resume</p>
          <h1 className="mt-2 text-5xl">{profile.name}</h1>
          <p className="mt-2 text-prose">
            {profile.headline} · {profile.location}
          </p>
        </div>
        {has_pdf && (
          <div className="flex flex-wrap gap-2">
            {/* Step 5 swaps this for Amicro's download button. */}
            <Button asChild>
              <a href={`${RESUME_PDF_URL}?download=1`} download>
                <Download data-icon="inline-start" />
                Download PDF
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={RESUME_PDF_URL} target="_blank" rel="noreferrer">
                Open in new tab
                <ArrowUpRight data-icon="inline-end" />
              </a>
            </Button>
          </div>
        )}
      </header>

      <div className="space-y-6">
        {experience.length > 0 && (
          <ResumeSection title="Experience">
            {experience.map((job) => (
              <ResumeEntry
                key={`${job.company}-${job.start}`}
                title={job.title}
                org={job.company}
                orgUrl={job.company_url}
                meta={`${job.location} · ${formatDates(job.start, job.end)}`}
                bullets={job.bullets}
              />
            ))}
          </ResumeSection>
        )}

        {education.length > 0 && (
          <ResumeSection title="Education">
            {education.map((school) => (
              <ResumeEntry
                key={`${school.school}-${school.start}`}
                title={school.degree}
                org={school.school}
                meta={`${school.location} · ${formatDates(school.start, school.end)}`}
                bullets={school.details}
              />
            ))}
          </ResumeSection>
        )}

        {skill_groups.length > 0 && (
          <ResumeSection title="Skills">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[12rem_1fr]">
              {skill_groups.map((group) => (
                <Fragment key={group.name}>
                  <dt className="font-medium text-heading">{group.name}</dt>
                  <dd className="text-prose">{group.skills.join(' · ')}</dd>
                </Fragment>
              ))}
            </dl>
          </ResumeSection>
        )}
      </div>
    </>
  )
}

function ResumeSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Reveal>
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl text-heading">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">{children}</CardContent>
      </Card>
    </Reveal>
  )
}

type ResumeEntryProps = {
  title: string
  org: string
  orgUrl?: string | null
  meta: string
  bullets: string[]
}

function ResumeEntry({ title, org, orgUrl, meta, bullets }: ResumeEntryProps) {
  return (
    <div>
      <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-baseline">
        <h3 className="text-lg">
          {title}
          <span className="text-muted-foreground"> · </span>
          {orgUrl ? (
            <a href={orgUrl} className="text-primary hover:underline" {...externalLinkProps(orgUrl)}>
              {org}
            </a>
          ) : (
            <span className="text-primary">{org}</span>
          )}
        </h3>
        <p className="font-mono text-xs text-muted-foreground">{meta}</p>
      </div>
      {bullets.length > 0 && (
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-prose marker:text-gold-dim">
          {bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
