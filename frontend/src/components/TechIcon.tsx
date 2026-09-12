/*
 * Logos for the technologies tagged on projects: Simple Icons brand marks (CC0), drawn in
 * currentColor so they take the surrounding text color. Simple Icons has no mark for AWS, CDK, or
 * Axum, so those, and any new tag without a logo, get a lucide icon instead.
 */
import { Cloud, Code, Layers, Server, type LucideIcon } from 'lucide-react'
import type { SVGProps } from 'react'
import {
  siCss,
  siFlask,
  siHtml5,
  siJavascript,
  siNextdotjs,
  siPostgresql,
  siPrisma,
  siPython,
  siReact,
  siRust,
  siTypescript,
  type SimpleIcon,
} from 'simple-icons'
import { cn } from '@/lib/utils'

// Keyed by the lowercased tag, as written in the projects' front matter.
const BRANDS: Record<string, SimpleIcon> = {
  css: siCss,
  flask: siFlask,
  html: siHtml5,
  javascript: siJavascript,
  'next.js': siNextdotjs,
  postgresql: siPostgresql,
  prisma: siPrisma,
  python: siPython,
  react: siReact,
  rust: siRust,
  typescript: siTypescript,
}

const FALLBACKS: Record<string, LucideIcon> = {
  aws: Cloud,
  cdk: Layers,
  axum: Server,
}

type TechIconProps = { name: string } & Omit<SVGProps<SVGSVGElement>, 'ref'>

/**
 * A small decorative icon for a technology name; any unknown name gets a generic code icon.
 * Other props reach the <svg>, e.g. `data-icon="inline-start"` for shadcn's icon padding.
 */
export function TechIcon({ name, className, ...props }: TechIconProps) {
  const key = name.toLowerCase()
  const brand = BRANDS[key]
  if (brand) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={cn('size-4 shrink-0', className)} {...props}>
        <path d={brand.path} />
      </svg>
    )
  }
  const Icon = FALLBACKS[key] ?? Code
  return <Icon aria-hidden="true" className={cn('size-4 shrink-0', className)} {...props} />
}
