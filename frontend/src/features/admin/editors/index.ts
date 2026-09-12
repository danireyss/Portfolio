import type { ComponentType } from 'react'
import type { EditorProps } from '../types'
import { AboutEditor } from './AboutEditor'
import { ProfileEditor } from './ProfileEditor'
import { SocialsEditor } from './SocialsEditor'

/** Every part of the site that has an edit button, and what the button opens. */
export const EDITORS = {
  profile: { title: 'Profile', Editor: ProfileEditor },
  about: { title: 'About', Editor: AboutEditor },
  socials: { title: 'Links', Editor: SocialsEditor },
} satisfies Record<string, { title: string; Editor: ComponentType<EditorProps> }>

export type EditorKey = keyof typeof EDITORS
