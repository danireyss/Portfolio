/** "Jun 2023 – Present", or just "May 2026" when a role starts and ends in the same month. */
export const formatDates = (start: string, end: string | null) =>
  start === end ? start : `${start} – ${end ?? 'Present'}`

/** "Daniel Reyes" -> "DR" */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .slice(0, 2)
    .join('')

/** "https://www.github.com/me/" -> "github.com/me", "mailto:me@x.com" -> "me@x.com" */
export const displayUrl = (url: string) =>
  url.replace(/^(mailto:|https?:\/\/)(www\.)?/, '').replace(/\/$/, '')

/** Opens off-site http(s) links in a new tab; leaves mailto: and same-site links alone. */
export const externalLinkProps = (url: string) =>
  /^https?:\/\//.test(url) ? { target: '_blank', rel: 'noreferrer' } : {}
