import type { About } from '@/api/types/About'
import { Reveal } from '@/components/Reveal'
import { Section } from '@/components/Section'

export function AboutSection({ about }: { about: About }) {
  return (
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
  )
}
