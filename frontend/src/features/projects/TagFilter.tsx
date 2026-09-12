import type { Tag } from '@/api/types/Tag'
import { TechIcon } from '@/components/TechIcon'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const ALL = '__all__'

type TagFilterProps = {
  tags: Tag[]
  /** The selected tag name, or `null` for all projects. */
  selected: string | null
  onChange: (tag: string | null) => void
}

export function TagFilter({ tags, selected, onChange }: TagFilterProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={selected ?? ALL}
      // Radix reports "" when the active item is clicked again; treat that as "All".
      onValueChange={(value) => onChange(!value || value === ALL ? null : value)}
      aria-label="Filter projects by tag"
      className="flex flex-wrap justify-start gap-1.5"
    >
      <ToggleGroupItem value={ALL}>All</ToggleGroupItem>
      {tags.map((tag) => (
        <ToggleGroupItem key={tag.name} value={tag.name} aria-label={`${tag.name} (${tag.projects.length})`}>
          <TechIcon name={tag.name} data-icon="inline-start" className="size-3.5" />
          {tag.name}
          <span className="font-mono text-xs text-muted-foreground">{tag.projects.length}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
