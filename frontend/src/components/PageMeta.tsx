import { useSite } from '@/api/queries'

/** Sets the document title ("Projects · Daniel Reyes") and description via React 19 metadata hoisting. */
export function PageMeta({ title, description }: { title?: string; description?: string }) {
  const { data } = useSite()
  const fullTitle = [title, data?.profile.name].filter(Boolean).join(' · ')
  return (
    <>
      {fullTitle && <title>{fullTitle}</title>}
      {description && <meta name="description" content={description} />}
    </>
  )
}
