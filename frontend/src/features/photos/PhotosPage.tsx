import { usePhotos, useSite } from '@/api/queries'
import type { Gallery } from '@/api/types/Gallery'
import { PhotoTimeMachine } from '@/components/amicro/PhotoTimeMachine'
import { AdminEdit } from '@/components/AdminEdit'
import { NotFound } from '@/components/NotFound'
import { PageMeta } from '@/components/PageMeta'
import { QueryState } from '@/components/QueryState'
import { Reveal } from '@/components/Reveal'
import { Section } from '@/components/Section'
import { useAdminMode } from '@/lib/adminMode'

export function PhotosPage() {
  const site = useSite()
  const photos = usePhotos()
  const adminMode = useAdminMode()
  const name = site.data?.profile.name

  return (
    <QueryState query={photos}>
      {(data) => {
        // Galleries whose media folder is still empty stay hidden, except in admin mode, where
        // they're where photos get added.
        const galleries = adminMode
          ? data.galleries
          : data.galleries.filter((gallery) => gallery.photos.length > 0)
        if (galleries.length === 0 && !adminMode) return <NotFound />
        return (
          <>
            <PageMeta
              title="Photos"
              description={name && `Photos from ${name}'s internships and beyond.`}
            />
            <header className="py-16 md:py-20">
              <p className="eyebrow">Photos</p>
              <div className="mt-2 flex items-center gap-3">
                <h1 className="text-5xl">Behind the scenes</h1>
                <AdminEdit section="galleries" />
              </div>
              <p className="mt-4 max-w-2xl text-lg text-prose">
                Hover over or tap the timeline beside each stack to travel back through the photos.
              </p>
            </header>
            {galleries.map((gallery, index) => (
              <GallerySection key={gallery.folder} gallery={gallery} index={index} />
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
      action={<AdminEdit section="gallery" target={gallery.folder} label={gallery.title} />}
    >
      {gallery.description && <p className="-mt-4 mb-8 max-w-2xl text-prose">{gallery.description}</p>}
      {count > 0 ? (
        <Reveal>
          <PhotoTimeMachine photos={gallery.photos} />
        </Reveal>
      ) : (
        <p className="text-muted-foreground">No photos yet. Add some with the edit button.</p>
      )}
    </Section>
  )
}
