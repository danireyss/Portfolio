import { AnimatePresence, motion } from 'motion/react'
import { useSearchParams } from 'react-router'
import { useProjects } from '@/api/queries'
import { PageMeta } from '@/components/PageMeta'
import { ErrorState, PageSkeleton } from '@/components/PageState'
import { ProjectCard } from '@/components/ProjectCard'
import { TagFilter } from '@/components/TagFilter'

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
        <AnimatePresence mode="popLayout" initial={false}>
          {visible.map((project) => (
            <motion.li
              key={project.slug}
              layout
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.25 }}
            >
              <ProjectCard project={project} />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    </>
  )
}
