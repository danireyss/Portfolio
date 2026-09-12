import type { AdminContent } from '@/api/types/AdminContent'

/** What every editor gets: the latest admin content, and a way to close its panel. */
export type EditorProps = {
  content: AdminContent
  onDone: () => void
  /** Which one, for editors of one of several: a project's slug, a gallery's folder. */
  target?: string
}
