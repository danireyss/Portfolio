import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Route, Routes } from 'react-router'
import { prefetchPageData } from '@/api/queries'
import { NotFound } from '@/components/NotFound'
import { HomePage } from '@/features/home/HomePage'
import { Layout } from './layout/Layout'
import { adminPage, pages, preloadPages } from './pages'

// The landing page ships in the main bundle; everything else loads separately (see pages.ts).
const ProjectsPage = pages.projects.Page
const ProjectDetailPage = pages.project.Page
const PhotosPage = pages.photos.Page
const ResumePage = pages.resume.Page
const ContactPage = pages.contact.Page
const AdminPage = adminPage.Page

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
