import { useSite } from '@/api/queries'
import { ContactForm } from '@/components/ContactForm'
import { SocialIcon } from '@/components/icons'
import { PageMeta } from '@/components/PageMeta'
import { Reveal } from '@/components/Reveal'
import { displayUrl, externalLinkProps } from '@/lib/format'

export function Contact() {
  const { data } = useSite()

  return (
    <>
      <PageMeta title="Contact" description="Get in touch about roles, collaborations, or anything else." />
      <header className="py-16 md:py-20">
        <p className="eyebrow">Contact</p>
        <h1 className="mt-2 text-5xl md:text-6xl">
          Let's <em className="text-primary">Talk</em>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-prose">
          Whether you're hiring, want to collaborate, or just want to say hello, my inbox is open.
        </p>
      </header>

      <div className="grid gap-12 md:grid-cols-[3fr_2fr]">
        <Reveal>
          <ContactForm />
        </Reveal>
        {data && data.socials.length > 0 && (
          <Reveal delay={0.1}>
            <aside aria-labelledby="direct-contact">
              <h2 id="direct-contact" className="text-xl">
                Or reach me directly
              </h2>
              <ul className="mt-4 space-y-3">
                {data.socials.map((social) => (
                  <li key={social.url}>
                    <a
                      href={social.url}
                      className="group flex items-center gap-3 text-prose transition-colors hover:text-primary"
                      {...externalLinkProps(social.url)}
                    >
                      <span className="flex size-9 items-center justify-center rounded-md border border-border bg-card transition-colors group-hover:border-gold-dim">
                        <SocialIcon kind={social.kind} className="size-4" />
                      </span>
                      <span>
                        <span className="sr-only">{social.label}: </span>
                        {displayUrl(social.url)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </aside>
          </Reveal>
        )}
      </div>
    </>
  )
}
