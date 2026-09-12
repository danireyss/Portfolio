import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setContentVersion } from '@/api/client'
import type { AdminContent } from '@/api/types/AdminContent'
import { goTo } from '@/lib/navigation'
import { projects, site } from '@/test/fixtures'
import { jsonResponse, mockApi, renderApp } from '@/test/utils'

vi.mock('@/lib/navigation', () => ({ goTo: vi.fn() }))

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

    expect(await screen.findByText("Saved. It's live.")).toBeInTheDocument()
    const [[, init]] = calls(fetchMock, '/api/admin/site')
    expect(init?.method).toBe('PUT')
    expect(new Headers(init?.headers).get('If-Match')).toBe('v1')
    expect(JSON.parse(String(init?.body)).about.background).toEqual(['Edited from admin.'])
    // The page's data is refetched at the new version, skipping cached copies.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/site?v=v2')).toBe(true),
    )
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
