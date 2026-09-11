import { lazy, type ComponentType } from 'react'
import { Route, Routes } from 'react-router'
import { NotFound } from '@/components/NotFound'
import { HomePage } from '@/features/home/HomePage'
import { Layout } from './layout/Layout'

/** Code-splits a page: its JavaScript is fetched the first time its route is visited. */
function lazyPage<M extends Record<K, ComponentType>, K extends string>(
  load: () => Promise<M>,
  name: K,
) {
  return lazy(async () => ({ default: (await load())[name] }))
}

// The landing page ships in the main bundle; everything else loads on first visit.
const ProjectsPage = lazyPage(() => import('@/features/projects/ProjectsPage'), 'ProjectsPage')
const ProjectDetailPage = lazyPage(
  () => import('@/features/projects/ProjectDetailPage'),
  'ProjectDetailPage',
)
const PhotosPage = lazyPage(() => import('@/features/photos/PhotosPage'), 'PhotosPage')
const ResumePage = lazyPage(() => import('@/features/resume/ResumePage'), 'ResumePage')
const ContactPage = lazyPage(() => import('@/features/contact/ContactPage'), 'ContactPage')

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:slug" element={<ProjectDetailPage />} />
        <Route path="photos" element={<PhotosPage />} />
        <Route path="resume" element={<ResumePage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
