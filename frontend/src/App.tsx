import { Route, Routes } from 'react-router'
import { Layout } from '@/components/layout/Layout'
import { Contact } from '@/pages/Contact'
import { Home } from '@/pages/Home'
import { NotFound } from '@/pages/NotFound'
import { Photos } from '@/pages/Photos'
import { ProjectDetail } from '@/pages/ProjectDetail'
import { Projects } from '@/pages/Projects'
import { Resume } from '@/pages/Resume'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:slug" element={<ProjectDetail />} />
        <Route path="photos" element={<Photos />} />
        <Route path="resume" element={<Resume />} />
        <Route path="contact" element={<Contact />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
