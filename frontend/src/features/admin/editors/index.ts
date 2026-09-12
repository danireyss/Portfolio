import type { ComponentType } from 'react'
import type { EditorProps } from '../types'
import { AboutEditor } from './AboutEditor'
import { AwardsEditor } from './AwardsEditor'
import { EducationEditor } from './EducationEditor'
import { ExperienceEditor } from './ExperienceEditor'
import { GalleriesEditor } from './GalleriesEditor'
import { GalleryEditor } from './GalleryEditor'
import { ProfileEditor } from './ProfileEditor'
import { ProjectEditor } from './ProjectEditor'
import { ProjectsEditor } from './ProjectsEditor'
import { ResumeFileEditor } from './ResumeFileEditor'
import { SkillsEditor } from './SkillsEditor'
import { SocialsEditor } from './SocialsEditor'

type EditorEntry = {
  title: string
  Editor: ComponentType<EditorProps>
  /** Wants a wider panel (long forms, photos). */
  wide?: boolean
}

const editors = {
  profile: { title: 'Profile', Editor: ProfileEditor },
  about: { title: 'About', Editor: AboutEditor },
  socials: { title: 'Links', Editor: SocialsEditor },
  experience: { title: 'Experience', Editor: ExperienceEditor },
  education: { title: 'Education', Editor: EducationEditor },
  skills: { title: 'Skills', Editor: SkillsEditor },
  awards: { title: 'Awards', Editor: AwardsEditor },
  resume: { title: 'Resume PDF', Editor: ResumeFileEditor },
  projects: { title: 'Projects', Editor: ProjectsEditor },
  project: { title: 'Project', Editor: ProjectEditor, wide: true },
  galleries: { title: 'Galleries', Editor: GalleriesEditor },
  gallery: { title: 'Gallery', Editor: GalleryEditor, wide: true },
} satisfies Record<string, EditorEntry>

export type EditorKey = keyof typeof editors

/** Every part of the site that has an edit button, and what the button opens. */
export const EDITORS: Record<EditorKey, EditorEntry> = editors
