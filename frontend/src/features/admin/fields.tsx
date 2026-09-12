import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useId, type ReactNode } from 'react'
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
}

export function TextField({ label, value, onChange, rows, hint, type = 'text' }: TextFieldProps) {
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
          aria-describedby={hintId}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
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
