import type { ReactNode } from 'react'
import { Reveal } from '@/components/Reveal'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { externalLinkProps } from '@/lib/format'

export function ResumeSection({ title, children }: { title: string; children: ReactNode }) {
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

export function ResumeEntry({ title, org, orgUrl, meta, bullets }: ResumeEntryProps) {
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
