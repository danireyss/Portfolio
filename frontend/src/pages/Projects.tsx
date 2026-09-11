import { AnimatePresence, motion } from 'motion/react'
import { useSearchParams } from 'react-router'
import { useProjects } from '@/api/queries'
import { PageMeta } from '@/components/PageMeta'
import { ErrorState, PageSkeleton } from '@/components/PageState'
import { ProjectCard } from '@/components/ProjectCard'
import { TagFilter } from '@/components/TagFilter'
import { EASE_OUT } from '@/lib/motion'

export function Projects() {
  const { data, error, isPending, refetch } = useProjects()
  const [searchParams, setSearchParams] = useSearchParams()

  if (isPending) return <PageSkeleton />
  if (error) return <ErrorState onRetry={() => refetch()} />

  // `?tag=` is case-insensitive so /projects?tag=rust matches "Rust".
  const tagParam = searchParams.get('tag')?.toLowerCase()
  const selected = data.tags.find((tag) => tag.name.toLowerCase() === tagParam)?.name ?? null
  const visible = selected
    ? data.projects.filter((project) => project.tags.includes(selected))
    : data.projects
  const selectTag = (tag: string | null) =>
    setSearchParams(tag ? { tag } : {}, { replace: true, preventScrollReset: true })

  return (
    <>
      <PageMeta title="Projects" description="Things I've designed and built." />
      <header className="py-16 md:py-20">
        <p className="eyebrow">Work</p>
        <h1 className="mt-2 text-5xl">Projects</h1>
        <p className="mt-4 max-w-2xl text-lg text-prose">
          Things I've designed and built. Filter by technology to see where I've used it.
        </p>
      </header>

      <TagFilter tags={data.tags} selected={selected} onChange={selectTag} />

      <p aria-live="polite" className="sr-only">
        {visible.length} {visible.length === 1 ? 'project' : 'projects'} shown
      </p>
      <motion.ul layout className="mt-10 grid gap-5 sm:grid-cols-2">
        {/* Cards stagger in on load, then fade in and out as the filter changes. */}
        <AnimatePresence mode="popLayout">
          {visible.map((project, index) => (
            <motion.li
              key={project.slug}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT, delay: index * 0.06 } }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.2 } }}
            >
              <ProjectCard project={project} />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    </>
  )
}
