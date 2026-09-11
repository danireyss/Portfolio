import type { Experience } from '@/api/types/Experience'
import { Reveal } from '@/components/Reveal'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { externalLinkProps } from '@/lib/format'

export function CurrentRole({ role }: { role: Experience }) {
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
