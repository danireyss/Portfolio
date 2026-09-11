import { ArrowUpRight } from 'lucide-react'
import { Fragment } from 'react'
import { RESUME_PDF_URL } from '@/api/client'
import { useResume } from '@/api/queries'
import type { ResumeResponse } from '@/api/types/ResumeResponse'
import { PageMeta } from '@/components/PageMeta'
import { QueryState } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { formatDates } from '@/lib/format'
import { DownloadButton } from './DownloadButton'
import { ResumeEntry, ResumeSection } from './ResumeSection'

export function ResumePage() {
  const resume = useResume()
  return <QueryState query={resume}>{(data) => <Resume resume={data} />}</QueryState>
}

function Resume({ resume }: { resume: ResumeResponse }) {
  const { profile, experience, education, skill_groups, awards, has_pdf } = resume

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
            <DownloadButton href={`${RESUME_PDF_URL}?download=1`}>Download PDF</DownloadButton>
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

        {awards.length > 0 && (
          <ResumeSection title="Awards">
            {awards.map((award) => (
              <ResumeEntry
                key={`${award.title}-${award.date}`}
                title={award.title}
                org={award.issuer}
                meta={award.date}
                bullets={award.details}
              />
            ))}
          </ResumeSection>
        )}
      </div>
    </>
  )
}
