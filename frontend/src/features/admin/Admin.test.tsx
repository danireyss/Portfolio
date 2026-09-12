import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { setContentVersion } from '@/api/client'
import type { AdminContent } from '@/api/types/AdminContent'
import type { ProjectSource } from '@/api/types/ProjectSource'
import { goTo } from '@/lib/navigation'
import { alphaDetail, photosResponse, projects, site } from '@/test/fixtures'
import { jsonResponse, mockApi, renderApp } from '@/test/utils'

vi.mock('@/lib/navigation', () => ({ goTo: vi.fn() }))

// The admin UI is lazy-loaded; load it once up front so no test's waits include the first
// import (slow on CI runners, where it can take longer than findBy*'s one-second default).
beforeAll(async () => {
  await Promise.all([import('@/features/admin/EditButton'), import('@/features/admin/AdminBar'), import('@/features/admin/AdminPage')])
})

const content: AdminContent = {
  version: 'v1',
  site: {
    profile: site.profile,
    about: site.about,
    socials: site.socials,
    experience: [],
    education: [],
    skill_groups: [],
    awards: [],
    galleries: [],
  },
  projects: [],
  has_resume: false,
}

const turnOnAdminMode = () => localStorage.setItem('admin-mode', 'on')
const calls = (fetchMock: ReturnType<typeof mockApi>, path: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).split('?')[0] === path)

afterEach(() => {
  localStorage.clear()
  setContentVersion(undefined)
})

describe('admin mode', () => {
  it('stays out of visitors’ way: no edit buttons and no admin requests', async () => {
    const fetchMock = mockApi({ '/api/site': site, '/api/projects': projects })
    renderApp('/')

    expect(await screen.findByRole('heading', { level: 1, name: /Test Person/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit about' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/admin'))).toBe(false)
  })

  it('edits a section and shows the result at the new version', async () => {
    turnOnAdminMode()
    const fetchMock = mockApi({
      '/api/site': site,
      '/api/projects': projects,
      '/api/admin/content': content,
      '/api/admin/site': (init?: RequestInit) =>
        jsonResponse({ ...content, version: 'v2', site: JSON.parse(String(init?.body)) }),
    })
    renderApp('/')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Edit about' }))
    const panel = await screen.findByRole('dialog', { name: 'Edit about' })
    const paragraph = within(panel).getByLabelText('Paragraph 1')
    await user.clear(paragraph)
    await user.type(paragraph, 'Edited from admin.')
    await user.click(within(panel).getByRole('button', { name: 'Save' }))

    // Toasts live in one store across tests, so wait for the request itself.
    await waitFor(() => expect(calls(fetchMock, '/api/admin/site')).toHaveLength(1))
    const [[, init]] = calls(fetchMock, '/api/admin/site')
    expect(init?.method).toBe('PUT')
    expect(new Headers(init?.headers).get('If-Match')).toBe('v1')
    expect(JSON.parse(String(init?.body)).about.background).toEqual(['Edited from admin.'])
    // The page's data is refetched at the new version, skipping cached copies.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/site?v=v2')).toBe(true),
    )
  })

  it('edits a project from its page', async () => {
    turnOnAdminMode()
    const alpha: ProjectSource = {
      slug: 'alpha',
      front: {
        title: 'Alpha',
        category: 'Full-stack',
        summary: 'The first project.',
        tags: ['Rust', 'AWS'],
        featured: true,
        order: 1,
        date: null,
        image: null,
        links: [],
      },
      markdown: '## How it works\n\nDetails.\n',
    }
    const fetchMock = mockApi({
      '/api/site': site,
      '/api/projects/alpha': alphaDetail,
      '/api/admin/content': { ...content, projects: [alpha] },
      '/api/admin/projects/alpha': () => jsonResponse({ ...content, version: 'v2', projects: [alpha] }),
    })
    renderApp('/projects/alpha')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Edit Alpha' }))
    const panel = await screen.findByRole('dialog', { name: 'Edit Alpha' })
    const title = within(panel).getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Alpha, renamed')
    await user.type(within(panel).getByLabelText('Write-up'), 'More.')
    await user.click(within(panel).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(calls(fetchMock, '/api/admin/projects/alpha')).toHaveLength(1))
    const [[, init]] = calls(fetchMock, '/api/admin/projects/alpha')
    expect(init?.method).toBe('PUT')
    expect(new Headers(init?.headers).get('If-Match')).toBe('v1')
    const body = JSON.parse(String(init?.body))
    expect(body.front).toMatchObject({ title: 'Alpha, renamed', tags: ['Rust', 'AWS'], order: 1 })
    expect(body.markdown).toBe('## How it works\n\nDetails.\nMore.')
  })

  it('uploads a headshot, then saves its path', async () => {
    turnOnAdminMode()
    const fetchMock = mockApi({
      '/api/site': site,
      '/api/projects': projects,
      '/api/admin/content': content,
      '/api/admin/uploads': {
        url: '/upload-here',
        headers: [['content-type', 'image/png']],
        path: '/uploads/headshot-1.png',
      },
      '/upload-here': () => new Response(null, { status: 200 }),
      '/api/admin/site': (init?: RequestInit) =>
        jsonResponse({ ...content, version: 'v2', site: JSON.parse(String(init?.body)) }),
    })
    renderApp('/')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }))
    const panel = await screen.findByRole('dialog', { name: 'Edit profile' })
    await user.upload(
      within(panel).getByLabelText('Upload a new headshot'),
      new File(['png'], 'me.png', { type: 'image/png' }),
    )
    await waitFor(() => expect(within(panel).getByLabelText('Headshot')).toHaveValue('/uploads/headshot-1.png'))
    const [[, upload]] = calls(fetchMock, '/upload-here')
    expect(upload?.method).toBe('PUT')
    expect(JSON.parse(String(calls(fetchMock, '/api/admin/uploads')[0][1]?.body))).toMatchObject({
      kind: 'headshot',
      filename: 'me.png',
    })

    await user.click(within(panel).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls(fetchMock, '/api/admin/site')).toHaveLength(1))
    const saved = JSON.parse(String(calls(fetchMock, '/api/admin/site')[0][1]?.body))
    expect(saved.profile.headshot).toBe('/uploads/headshot-1.png')
  })

  it('deletes a photo from a gallery, then reloads', async () => {
    turnOnAdminMode()
    const withGallery: AdminContent = {
      ...content,
      site: {
        ...content.site,
        galleries: [{ folder: 'summer', title: 'Summer internship', description: null, photos: {} }],
      },
    }
    const fetchMock = mockApi({
      '/api/site': site,
      '/api/photos': photosResponse,
      '/api/admin/content': withGallery,
      '/api/admin/photos/summer/one.jpg': () => new Response(null, { status: 204 }),
      '/api/admin/reload': { ...withGallery, version: 'v2' },
    })
    renderApp('/photos')
    const user = userEvent.setup()

    const edit = await screen.findByRole('button', { name: 'Edit Summer internship' })
    // Admin mode shows empty galleries too, so photos can be added to them. (Checked before the
    // panel opens: while it's open, the page behind it is hidden from screen readers.)
    expect(screen.getByRole('heading', { name: 'Empty' })).toBeInTheDocument()
    await user.click(edit)
    const panel = await screen.findByRole('dialog', { name: 'Edit Summer internship' })
    await user.click(within(panel).getByRole('button', { name: 'Delete one.jpg' }))

    await waitFor(() => expect(calls(fetchMock, '/api/admin/reload')).toHaveLength(1))
    expect(calls(fetchMock, '/api/admin/photos/summer/one.jpg')[0][1]?.method).toBe('DELETE')
  })

  it('turns itself off when the admin API says no', async () => {
    turnOnAdminMode()
    mockApi({ '/api/site': site, '/api/projects': projects })
    renderApp('/')

    await waitFor(() => expect(localStorage.getItem('admin-mode')).toBeNull())
    expect(screen.queryByRole('button', { name: 'Edit about' })).not.toBeInTheDocument()
  })
})

describe('/admin', () => {
  it('signs in with Google', async () => {
    const fetchMock = mockApi({
      '/api/site': site,
      '/api/auth/sign-in/social': { url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1', redirect: true },
    })
    renderApp('/admin')

    await userEvent.setup().click(await screen.findByRole('button', { name: /Sign in with Google/ }))
    await waitFor(() => expect(goTo).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1'))
    const [[, init]] = calls(fetchMock, '/api/auth/sign-in/social')
    expect(JSON.parse(String(init?.body))).toMatchObject({ provider: 'google', callbackURL: '/admin' })
  })

  it('explains when a Google account isn’t allowed', async () => {
    mockApi({ '/api/site': site })
    renderApp('/admin?error=not-allowed')

    expect(await screen.findByRole('alert')).toHaveTextContent("That Google account isn't allowed in")
  })

  it('turns on admin mode once signed in', async () => {
    mockApi({ '/api/site': site, '/api/admin/content': content })
    renderApp('/admin')

    expect(await screen.findByRole('heading', { name: "You're signed in" })).toBeInTheDocument()
    expect(localStorage.getItem('admin-mode')).toBe('on')
    expect(await screen.findByRole('region', { name: 'Admin mode' })).toBeInTheDocument()
  })
})
