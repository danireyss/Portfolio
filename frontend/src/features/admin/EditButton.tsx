import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { EDITORS, type EditorKey } from './editors'
import { useAdminContent } from './queries'

type EditButtonProps = {
  section: EditorKey
  /** Which one, for editors of one of several (a project's slug, a gallery's folder). */
  target?: string
  /** What's being edited, e.g. a project's title; defaults to the editor's name. */
  label?: string
  className?: string
}

/** A pencil button that opens `section`'s editor in a side panel. */
export function EditButton({ section, target, label, className }: EditButtonProps) {
  const [open, setOpen] = useState(false)
  const { data: content } = useAdminContent()
  const { title, Editor, wide } = EDITORS[section]
  const name = label ?? title.toLowerCase()
  if (!content) return null

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          className={cn('shrink-0 rounded-full', className)}
          aria-label={`Edit ${name}`}
        >
          <Pencil />
        </Button>
      </SheetTrigger>
      <SheetContent className={cn('w-full overflow-y-auto', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <SheetHeader>
          <SheetTitle>Edit {name}</SheetTitle>
          <SheetDescription>Changes go live as soon as you save.</SheetDescription>
        </SheetHeader>
        {/* Mounted per opening, so each edit starts from the latest content. */}
        {open && <Editor content={content} target={target} onDone={() => setOpen(false)} />}
      </SheetContent>
    </Sheet>
  )
}
