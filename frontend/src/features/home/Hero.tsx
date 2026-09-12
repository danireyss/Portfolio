import { ArrowRight } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import type { Profile } from '@/api/types/Profile'
import { AdminEdit } from '@/components/AdminEdit'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
          <Avatar className="size-48 ring-1 ring-border md:size-64 lg:size-72">
            <AvatarImage src={profile.headshot} alt={profile.name} />
            <AvatarFallback className="font-heading text-3xl">{initials(profile.name)}</AvatarFallback>
          </Avatar>
        </motion.div>
      )}
    </section>
  )
}
