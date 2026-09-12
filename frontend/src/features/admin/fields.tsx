import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useId, useState, type ChangeEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type TextFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  /** A textarea with this many rows, for longer text. */
  rows?: number
  hint?: string
  type?: 'text' | 'email' | 'url'
  className?: string
}

export function TextField({ label, value, onChange, rows, hint, type = 'text', className }: TextFieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {rows ? (
        <Textarea
          id={id}
          rows={rows}
          value={value}
          className={className}
          aria-describedby={hintId}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          className={className}
          aria-describedby={hintId}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

/** Text that may be left empty, which saves it as unset (`null`). */
export function OptionalTextField({
  value,
  onChange,
  ...props
}: Omit<TextFieldProps, 'value' | 'onChange'> & {
  value: string | null
  onChange: (value: string | null) => void
}) {
  return (
    <TextField {...props} value={value ?? ''} onChange={(text) => onChange(text.trim() ? text : null)} />
  )
}

/**
 * A list of strings typed as text: `separator` "," for short ones ("Rust, TypeScript"), or
 * "\n" for one per line (bullets). It keeps its own text, so a separator survives while typing.
 */
function SplitTextField({
  values,
  onChange,
  separator,
  ...props
}: Omit<TextFieldProps, 'value' | 'onChange'> & {
  values: string[]
  onChange: (values: string[]) => void
  separator: ',' | '\n'
}) {
  const [text, setText] = useState(() => values.join(separator === ',' ? ', ' : '\n'))
  return (
    <TextField
      {...props}
      value={text}
      onChange={(next) => {
        setText(next)
        onChange(next.split(separator).map((value) => value.trim()).filter(Boolean))
      }}
    />
  )
}

/** Short strings with commas between them, e.g. tags. */
export function TagsField(props: { label: string; values: string[]; onChange: (values: string[]) => void; hint?: string }) {
  return <SplitTextField {...props} separator="," hint={props.hint ?? 'Separate them with commas.'} />
}

/** One string per line, e.g. a job's bullet points. */
export function LinesField(props: { label: string; values: string[]; onChange: (values: string[]) => void; hint?: string }) {
  return <SplitTextField {...props} separator={'\n'} rows={4} hint={props.hint ?? 'One per line.'} />
}

export function CheckboxField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-primary"
      />
      <div className="grid gap-1">
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

type SelectFieldProps<T extends string> = {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}

export function SelectField<T extends string>({ label, value, options, onChange }: SelectFieldProps<T>) {
  const id = useId()
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Picks files and hands them to `onUpload`, reporting progress and failures. */
export function UploadField({
  label,
  accept,
  multiple,
  hint,
  onUpload,
}: {
  label: string
  accept: string
  multiple?: boolean
  hint?: string
  onUpload: (files: File[]) => Promise<unknown>
}) {
  const id = useId()
  const [busy, setBusy] = useState(false)

  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const files = [...(input.files ?? [])]
    if (files.length === 0) return
    setBusy(true)
    try {
      await onUpload(files)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Uploading failed. Please try again.')
    } finally {
      setBusy(false)
      // Picking the same file again should upload it again.
      input.value = ''
    }
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="file" accept={accept} multiple={multiple} disabled={busy} onChange={onChange} />
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {busy ? 'Uploading…' : hint}
      </p>
    </div>
  )
}

type ListFieldProps<T> = {
  label: string
  items: T[]
  onChange: (items: T[]) => void
  /** A blank item for the Add button. */
  newItem: () => T
  /** A short name for an item, for its header and its buttons' labels. */
  itemLabel: (item: T, index: number) => string
  /** The fields for one item; `update` replaces it. */
  render: (item: T, update: (item: T) => void, index: number) => ReactNode
}

/** A list that can be added to, reordered, and trimmed, each item with its own fields. */
export function ListField<T>({ label, items, onChange, newItem, itemLabel, render }: ListFieldProps<T>) {
  const update = (index: number, item: T) =>
    onChange(items.map((existing, i) => (i === index ? item : existing)))
  const move = (from: number, to: number) => {
    const next = [...items]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-3 text-sm font-medium">{label}</legend>
      {items.map((item, index) => {
        const name = itemLabel(item, index)
        return (
          // Items have no ids of their own; the fields are controlled, so their values follow
          // the item when it moves.
          // oxlint-disable-next-line react/no-array-index-key
          <div key={index} className="grid gap-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm text-muted-foreground">{name}</p>
              <div className="flex shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${name} up`}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${name} down`}
                  disabled={index === items.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${name}`}
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            {render(item, (next) => update(index, next), index)}
          </div>
        )
      })}
      <Button type="button" variant="outline" onClick={() => onChange([...items, newItem()])}>
        <Plus data-icon="inline-start" />
        Add
      </Button>
    </fieldset>
  )
}
