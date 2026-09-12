/** Each page's code, split out of the main bundle; App.tsx lazy-loads them from here. */
export const pageModules = {
  projects: () => import('@/features/projects/ProjectsPage'),
  project: () => import('@/features/projects/ProjectDetailPage'),
  photos: () => import('@/features/photos/PhotosPage'),
  resume: () => import('@/features/resume/ResumePage'),
  contact: () => import('@/features/contact/ContactPage'),
}

/** Fetches every page's code ahead of time, so opening one never waits on the network. */
export function preloadPages() {
  for (const load of Object.values(pageModules)) {
    void load()
  }
}
