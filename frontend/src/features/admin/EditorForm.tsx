import { Loader2 } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { FormError } from './errors'

type EditorFormProps = {
  /** Saves the draft; the panel closes once it succeeds. */
  save: () => Promise<unknown>
  pending: boolean
  onDone: () => void
  /** More buttons, on the left (e.g. Delete). */
  extra?: ReactNode
  children: ReactNode
}

/** An editor's fields, with Save and Cancel kept in view at the bottom of the panel. */
export function EditorForm({ save, pending, onDone, extra, children }: EditorFormProps) {
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await save()
      toast.success("Saved. It's live.")
      onDone()
    } catch (error) {
      // The API explains what's wrong: invalid content, or someone saved first (409).
      toast.error(
        error instanceof ApiError || error instanceof FormError
          ? error.message
          : "Couldn't save. Check your connection and try again.",
      )
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-5 px-4">
      {children}
      <div className="sticky bottom-0 mt-auto flex items-center justify-between gap-2 border-t border-border bg-background py-4">
        <div>{extra}</div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
            Save
          </Button>
        </div>
      </div>
    </form>
  )
}
