import type { Project } from '@/api/types/Project'
import type { ProjectSummary } from '@/api/types/ProjectSummary'
import type { ProjectsResponse } from '@/api/types/ProjectsResponse'
import type { SiteResponse } from '@/api/types/SiteResponse'

export const site: SiteResponse = {
  profile: {
    name: 'Test Person',
    headline: 'Engineer',
    location: 'Somewhere',
    tagline: 'Builds reliable things.',
    email: 'test@example.com',
    headshot: null,
  },
  about: {
    background: ['A paragraph about me.'],
    focus_areas: [{ title: 'Distributed systems', description: 'Making services talk.' }],
  },
  socials: [{ kind: 'github', label: 'GitHub', url: 'https://github.com/test' }],
  current_role: {
    company: 'Now Co',
    company_url: null,
    title: 'Engineer',
    location: 'Remote',
    start: '2022',
    end: null,
    summary: 'Builds the platform.',
    bullets: [],
  },
  skills: [
    {
      name: 'Rust',
      projects: [
        { slug: 'alpha', title: 'Alpha' },
        { slug: 'beta', title: 'Beta' },
      ],
    },
    { name: 'AWS', projects: [{ slug: 'alpha', title: 'Alpha' }] },
  ],
}

const alpha: ProjectSummary = {
  slug: 'alpha',
  title: 'Alpha',
  category: 'Full-stack',
  summary: 'The first project.',
  tags: ['Rust', 'AWS'],
  featured: true,
  date: null,
  image: null,
  links: [],
}

const beta: ProjectSummary = {
  ...alpha,
  slug: 'beta',
  title: 'Beta',
  summary: 'The second project.',
  tags: ['Rust'],
  featured: false,
}

export const projects: ProjectsResponse = { projects: [alpha, beta], tags: site.skills }

export const alphaDetail: Project = { ...alpha, body_html: '<h2>How it works</h2><p>Details.</p>' }
