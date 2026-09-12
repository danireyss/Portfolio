import { createElement, lazy, type ComponentType } from 'react'

/**
 * A page split out of the main bundle: its code is fetched on first visit, or earlier by
 * `preload`. Once the code is here the page renders straight away. React.lazy alone would still
 * suspend on the page's first render, even with the code already loaded, and React then keeps
 * the loading skeleton up for about 300 ms before showing the page: a flash on every first visit.
 */
function codeSplit<M extends Record<K, ComponentType>, K extends string>(
  load: () => Promise<M>,
  name: K,
) {
  let loaded: ComponentType | undefined
  const preload = async () => {
    loaded ??= (await load())[name]
    return loaded
  }
  const Lazy = lazy(async () => ({ default: await preload() }))
  function Page() {
    return createElement(loaded ?? Lazy)
  }
  Page.displayName = name
  return { Page, preload }
}

/** The pages besides home, which ships in the main bundle. */
export const pages = {
  projects: codeSplit(() => import('@/features/projects/ProjectsPage'), 'ProjectsPage'),
  project: codeSplit(() => import('@/features/projects/ProjectDetailPage'), 'ProjectDetailPage'),
  photos: codeSplit(() => import('@/features/photos/PhotosPage'), 'PhotosPage'),
  resume: codeSplit(() => import('@/features/resume/ResumePage'), 'ResumePage'),
  contact: codeSplit(() => import('@/features/contact/ContactPage'), 'ContactPage'),
}

/** Not preloaded: only the owner ever opens it. */
export const adminPage = codeSplit(() => import('@/features/admin/AdminPage'), 'AdminPage')

/** Fetches every page's code ahead of time, so opening one never waits on the network. */
export function preloadPages() {
  for (const page of Object.values(pages)) {
    void page.preload()
  }
}
