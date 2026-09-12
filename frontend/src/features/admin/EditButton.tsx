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

/** A pencil button that opens `section`'s editor in a side panel. */
export function EditButton({ section, className }: { section: EditorKey; className?: string }) {
  const [open, setOpen] = useState(false)
  const { data: content } = useAdminContent()
  const { title, Editor } = EDITORS[section]
  if (!content) return null

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          className={cn('rounded-full', className)}
          aria-label={`Edit ${title.toLowerCase()}`}
        >
          <Pencil />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit {title.toLowerCase()}</SheetTitle>
          <SheetDescription>Changes go live as soon as you save.</SheetDescription>
        </SheetHeader>
        {/* Mounted per opening, so each edit starts from the latest content. */}
        {open && <Editor content={content} onDone={() => setOpen(false)} />}
      </SheetContent>
    </Sheet>
  )
}
