import { usePhotos, useSite } from '@/api/queries'
import type { Gallery } from '@/api/types/Gallery'
import { PhotoTimeMachine } from '@/components/amicro/PhotoTimeMachine'
import { NotFound } from '@/components/NotFound'
import { PageMeta } from '@/components/PageMeta'
import { QueryState } from '@/components/QueryState'
import { Reveal } from '@/components/Reveal'
import { Section } from '@/components/Section'

export function PhotosPage() {
  const site = useSite()
  const photos = usePhotos()
  const name = site.data?.profile.name

  return (
    <QueryState query={photos}>
      {(data) => {
        // Galleries whose media folder is still empty stay hidden.
        const galleries = data.galleries.filter((gallery) => gallery.photos.length > 0)
        if (galleries.length === 0) return <NotFound />
        return (
          <>
            <PageMeta
              title="Photos"
              description={name && `Photos from ${name}'s internships and beyond.`}
            />
            <header className="py-16 md:py-20">
              <p className="eyebrow">Photos</p>
              <h1 className="mt-2 text-5xl">Behind the scenes</h1>
              <p className="mt-4 max-w-2xl text-lg text-prose">
                Hover over or tap the timeline beside each stack to travel back through the photos.
              </p>
            </header>
            {galleries.map((gallery, index) => (
              <GallerySection key={gallery.title} gallery={gallery} index={index} />
            ))}
          </>
        )
      }}
    </QueryState>
  )
}

function GallerySection({ gallery, index }: { gallery: Gallery; index: number }) {
  const count = gallery.photos.length
  return (
    <Section
      id={`gallery-${index}`}
      eyebrow={`${count} ${count === 1 ? 'photo' : 'photos'}`}
      title={gallery.title}
      className="pt-0"
    >
      {gallery.description && <p className="-mt-4 mb-8 max-w-2xl text-prose">{gallery.description}</p>}
      <Reveal>
        <PhotoTimeMachine photos={gallery.photos} />
      </Reveal>
    </Section>
  )
}
