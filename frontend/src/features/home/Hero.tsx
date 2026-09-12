import { ArrowRight } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { Profile } from '@/api/types/Profile'
import { AdminEdit } from '@/components/AdminEdit'
import { Button } from '@/components/ui/button'
import { initials } from '@/lib/format'
import { fadeUp } from '@/lib/motion'

export function Hero({ profile }: { profile: Profile }) {
  return (
    <section className="flex flex-col-reverse items-start gap-10 py-16 md:flex-row md:items-center md:justify-between md:py-24">
      <div className="max-w-xl">
        <div className="flex items-center gap-3">
          <motion.p className="eyebrow" {...fadeUp(0)}>
            {profile.headline} · {profile.location}
          </motion.p>
          <AdminEdit section="profile" />
        </div>
        <motion.h1 className="mt-4 text-5xl leading-[1.05] md:text-6xl" {...fadeUp(0.05)}>
          Hi, I'm <span className="text-primary italic">{profile.name}</span>
        </motion.h1>
        <motion.p className="mt-6 text-lg leading-relaxed text-prose" {...fadeUp(0.1)}>
          {profile.tagline}
        </motion.p>
        <motion.div className="mt-8 flex flex-wrap gap-3" {...fadeUp(0.15)}>
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
      {/* No animation of its own (the page's quick fade-in covers it): it's the largest paint, and
          its own fade held that back by the fade's length. */}
      {profile.headshot && <Headshot key={profile.headshot} src={profile.headshot} name={profile.name} />}
    </section>
  )
}

/**
 * A plain <img> fetched at high priority (index.html preloads it on /), in a fixed-size circle
 * so nothing moves when it arrives; initials if it fails to load.
 */
function Headshot({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="size-48 overflow-hidden rounded-full bg-muted ring-1 ring-border md:size-64 lg:size-72">
      {failed ? (
        <span className="flex size-full items-center justify-center font-heading text-3xl text-muted-foreground">
          {initials(name)}
        </span>
      ) : (
        <img
          src={src}
          alt={name}
          width={288}
          height={288}
          fetchPriority="high"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      )}
    </div>
  )
}
