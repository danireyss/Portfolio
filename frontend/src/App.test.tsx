import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { alphaDetail, projects, site } from '@/test/fixtures'
import { jsonResponse, mockApi, renderApp } from '@/test/utils'

describe('home', () => {
  it('shows the profile and only featured projects', async () => {
    mockApi({ '/api/site': site, '/api/projects': projects })
    renderApp('/')

    expect(await screen.findByRole('heading', { level: 1, name: /Test Person/ })).toBeInTheDocument()
    expect(screen.getByText('Builds the platform.')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/projects/alpha')
    expect(screen.queryByRole('link', { name: 'Beta' })).not.toBeInTheDocument()
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

describe('contact form', () => {
  async function fillAndSubmit() {
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Name'), 'Visitor')
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

    await userEvent.setup().click(screen.getByRole('button', { name: /send message/i }))
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
