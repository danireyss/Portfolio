import { usePhotos, useSite } from '@/api/queries'
import { PhotoTimeMachine } from '@/components/amicro/PhotoTimeMachine'
import { PageMeta } from '@/components/PageMeta'
import { ErrorState, PageSkeleton } from '@/components/PageState'
import { Reveal } from '@/components/Reveal'
import { Section } from '@/components/Section'
import { NotFound } from './NotFound'

export function Photos() {
  const site = useSite()
  const { data, error, isPending, refetch } = usePhotos()

  if (isPending) return <PageSkeleton />
  if (error) return <ErrorState onRetry={() => refetch()} />

  // Galleries whose media folder is still empty stay hidden.
  const galleries = data.galleries.filter((gallery) => gallery.photos.length > 0)
  if (galleries.length === 0) return <NotFound />
  const name = site.data?.profile.name

  return (
    <>
      <PageMeta title="Photos" description={name && `Photos from ${name}'s internships and beyond.`} />
      <header className="py-16 md:py-20">
        <p className="eyebrow">Photos</p>
        <h1 className="mt-2 text-5xl">Behind the scenes</h1>
        <p className="mt-4 max-w-2xl text-lg text-prose">
          Hover over or tap the timeline beside each stack to travel back through the photos.
        </p>
      </header>

      {galleries.map((gallery, index) => (
        <Section
          key={gallery.title}
          id={`gallery-${index}`}
          eyebrow={`${gallery.photos.length} ${gallery.photos.length === 1 ? 'photo' : 'photos'}`}
          title={gallery.title}
          className="pt-0"
        >
          {gallery.description && <p className="-mt-4 mb-8 max-w-2xl text-prose">{gallery.description}</p>}
          <Reveal>
            <PhotoTimeMachine photos={gallery.photos} />
          </Reveal>
        </Section>
      ))}
    </>
  )
}
