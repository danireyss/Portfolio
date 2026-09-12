import { useQueryClient } from '@tanstack/react-query'
import { lazy, useEffect, type ComponentType } from 'react'
import { Route, Routes } from 'react-router'
import { prefetchPageData } from '@/api/queries'
import { NotFound } from '@/components/NotFound'
import { HomePage } from '@/features/home/HomePage'
import { Layout } from './layout/Layout'
import { pageModules, preloadPages } from './pages'

/** Code-splits a page: its JavaScript is fetched on first visit, or earlier by preloadPages. */
function lazyPage<M extends Record<K, ComponentType>, K extends string>(
  load: () => Promise<M>,
  name: K,
) {
  return lazy(async () => ({ default: (await load())[name] }))
}

// The landing page ships in the main bundle; everything else loads separately.
const ProjectsPage = lazyPage(pageModules.projects, 'ProjectsPage')
const ProjectDetailPage = lazyPage(pageModules.project, 'ProjectDetailPage')
const PhotosPage = lazyPage(pageModules.photos, 'PhotosPage')
const ResumePage = lazyPage(pageModules.resume, 'ResumePage')
const ContactPage = lazyPage(pageModules.contact, 'ContactPage')
// Not preloaded: only the owner ever opens it.
const AdminPage = lazyPage(() => import('@/features/admin/AdminPage'), 'AdminPage')

/**
 * Once the first page has loaded and the browser is idle, fetches every other page's code and
 * the resume's data (the home page already has the rest), so switching pages never waits.
 */
function usePreloadWhenIdle() {
  const queryClient = useQueryClient()
  useEffect(() => {
    const preload = () => {
      preloadPages()
      prefetchPageData(queryClient, '/resume')
    }
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(preload, { timeout: 3000 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(preload, 1500)
    return () => clearTimeout(id)
  }, [queryClient])
}

export function App() {
  usePreloadWhenIdle()
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:slug" element={<ProjectDetailPage />} />
        <Route path="photos" element={<PhotosPage />} />
        <Route path="resume" element={<ResumePage />} />
        <Route path="contact" element={<ContactPage />} />
        {/* Linked from nowhere; see features/admin. */}
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
