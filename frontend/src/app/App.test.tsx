import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { alphaDetail, photosResponse, projects, site } from '@/test/fixtures'
import { jsonResponse, mockApi, renderApp } from '@/test/utils'

describe('home', () => {
  it('shows the profile and a cover flow of featured-first projects', async () => {
    mockApi({ '/api/site': site, '/api/projects': projects })
    renderApp('/')

    expect(await screen.findByRole('heading', { level: 1, name: /Test Person/ })).toBeInTheDocument()
    expect(screen.getByText('Builds the platform.')).toBeInTheDocument()

    // Only Alpha is featured, so Beta fills in after it.
    const showcase = await screen.findByRole('region', { name: 'Project showcase' })
    expect(within(showcase).getByRole('button', { current: true })).toHaveAccessibleName('Show Alpha')
    expect(within(showcase).getByRole('button', { name: 'Show Beta' })).toBeInTheDocument()
  })
})

describe('projects', () => {
  it('filters by the ?tag= in the URL, case-insensitively', async () => {
    mockApi({ '/api/site': site, '/api/projects': projects })
    renderApp('/projects?tag=aws')

    expect(await screen.findByRole('link', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Beta' })).not.toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('radio', { name: 'All' }))
    expect(await screen.findByRole('link', { name: 'Beta' })).toBeInTheDocument()
  })

  it('renders a project write-up', async () => {
    mockApi({ '/api/site': site, '/api/projects/alpha': alphaDetail })
    renderApp('/projects/alpha')

    expect(await screen.findByRole('heading', { level: 1, name: 'Alpha' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'How it works' })).toBeInTheDocument()
  })

  it('shows not found for an unknown project', async () => {
    mockApi({ '/api/site': site })
    renderApp('/projects/missing')

    expect(await screen.findByRole('heading', { name: 'Project not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /All projects/ })).toHaveAttribute('href', '/projects')
  })
})

describe('photos', () => {
  it('links to Photos and steps through the time machine', async () => {
    mockApi({ '/api/site': site, '/api/photos': photosResponse })
    renderApp('/photos')

    expect(await screen.findByRole('heading', { level: 2, name: 'Summer internship' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Empty' })).not.toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Photos' })).toHaveAttribute('href', '/photos')

    // Photos behind the active one are aria-hidden, so only the active image is exposed.
    const current = () => screen.getByRole('button', { current: true })
    expect(current()).toHaveAccessibleName('Jun 2026: Day one')
    expect(screen.getByRole('img', { name: 'Team standup' })).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Jul 2026: Whiteboard session' }))
    expect(current()).toHaveAccessibleName('Jul 2026: Whiteboard session')
    expect(screen.getByRole('img', { name: 'Whiteboard session' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Team standup' })).not.toBeInTheDocument()
  })

  it('hides the Photos link until a gallery has photos', async () => {
    mockApi({
      '/api/site': site,
      '/api/projects': projects,
      '/api/photos': { galleries: [{ title: 'Empty', description: null, photos: [] }] },
    })
    renderApp('/')

    expect(await screen.findByRole('link', { name: 'Projects' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Photos' })).not.toBeInTheDocument()
  })
})

describe('contact form', () => {
  async function fillAndSubmit() {
    const user = userEvent.setup()
    // The contact page is lazy-loaded, so wait for the form to appear.
    await user.type(await screen.findByLabelText('Name'), 'Visitor')
    await user.type(screen.getByLabelText('Email'), 'visitor@example.com')
    await user.type(screen.getByLabelText('Message'), 'Hello there, nice site!')
    await user.click(screen.getByRole('button', { name: /send message/i }))
  }

  it('validates before sending, then posts the message', async () => {
    const fetchMock = mockApi({
      '/api/site': site,
      '/api/contact': () => new Response(null, { status: 204 }),
    })
    renderApp('/contact')
    const contactCalls = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/contact'))

    await userEvent.setup().click(await screen.findByRole('button', { name: /send message/i }))
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(contactCalls()).toHaveLength(0)

    await fillAndSubmit()
    expect(await screen.findByText(/on its way/)).toBeInTheDocument()
    expect(contactCalls()).toHaveLength(1)
    const body = JSON.parse(contactCalls()[0]![1]!.body as string)
    expect(body).toMatchObject({
      name: 'Visitor',
      email: 'visitor@example.com',
      message: 'Hello there, nice site!',
      website: '',
    })
    expect(body.elapsed_ms).toBeGreaterThanOrEqual(0)
  })

  it('shows field errors returned by the server', async () => {
    mockApi({
      '/api/site': site,
      '/api/contact': () =>
        jsonResponse(
          { error: 'Please fix the highlighted fields.', fields: [{ field: 'email', message: 'That address bounced.' }] },
          422,
        ),
    })
    renderApp('/contact')

    await fillAndSubmit()
    expect(await screen.findByText('That address bounced.')).toBeInTheDocument()
  })
})

describe('theme toggle', () => {
  const root = document.documentElement
  afterEach(() => {
    root.classList.remove('dark')
    localStorage.clear()
  })

  it('switches between dark and light and remembers the choice', async () => {
    // index.html starts in dark mode.
    root.classList.add('dark')
    mockApi({ '/api/site': site, '/api/projects': projects })
    renderApp('/')
    const user = userEvent.setup()
    const toggle = screen.getByRole('switch', { name: 'Dark theme' })
    expect(toggle).toBeChecked()

    await user.click(toggle)
    expect(toggle).not.toBeChecked()
    expect(root).not.toHaveClass('dark')
    expect(localStorage.getItem('theme')).toBe('light')

    await user.click(toggle)
    expect(toggle).toBeChecked()
    expect(root).toHaveClass('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })
})
