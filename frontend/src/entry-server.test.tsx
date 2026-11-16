// @vitest-environment node
// Plain Node, as on Lambda: anything that reaches for `window` while rendering fails here.
import { describe, expect, it } from 'vitest'
import template from '../index.html?raw'
import { renderPage } from '@/entry-server'
import { alphaDetail, photosResponse, projects, site } from '@/test/fixtures'
import { jsonResponse, mockApi } from '@/test/utils'

const render = (url: string) => renderPage(url, template, { apiOrigin: 'http://api.test' })

const api = {
  '/api/site': site,
  '/api/photos': photosResponse,
  '/api/projects': projects,
  '/api/projects/alpha': alphaDetail,
}

const stateOf = (body: string) =>
  JSON.parse(body.match(/<script type="application\/json" id="query-state">(.*?)<\/script>/)![1])

describe('renderPage', () => {
  it('renders the page into index.html with its title and the data it came from', async () => {
    const fetch = mockApi(api)
    const { status, headers, body } = await render('/projects/alpha')

    expect(status).toBe(200)
    expect(headers['Cache-Control']).toBe('public, max-age=0, s-maxage=300')
    expect(body).toMatch(/<head>[\s\S]*<title>Alpha · Test Person<\/title>[\s\S]*<\/head>/)
    expect(body).not.toContain('<title>Daniel Reyes</title>')
    expect(body).toMatch(/<div id="root">.*<h1[^>]*>Alpha<\/h1>/s)
    // The page is all in place, not left for a script to fill in later.
    expect(body).not.toMatch(/<!--\$\?-->|<template/)
    expect(fetch).toHaveBeenCalledWith('http://api.test/api/projects/alpha', expect.anything())
    expect(stateOf(body).queries.map(({ queryKey }: { queryKey: unknown }) => queryKey)).toEqual(
      expect.arrayContaining([['site'], ['photos'], ['project', 'alpha']]),
    )
  })

  it("escapes the data so nothing in it can end the data's script tag", async () => {
    const tagline = '</script><script>alert(1)</script>'
    mockApi({ ...api, '/api/site': { ...site, profile: { ...site.profile, tagline } } })
    const { body } = await render('/')

    expect(body).not.toContain('<script>alert(1)')
    expect(stateOf(body).queries.find(({ queryKey }: { queryKey: string[] }) => queryKey[0] === 'site').state.data.profile.tagline).toBe(tagline)
  })

  it('sends an unknown project out unrendered, as a 404', async () => {
    mockApi(api)
    const { status, body } = await render('/projects/missing')

    expect(status).toBe(404)
    expect(body).toContain('<div id="root"></div>')
    expect(body).toContain('<title>Daniel Reyes</title>')
    expect(body).not.toContain('query-state')
  })

  it('leaves the page to the browser, uncached, when the API fails', async () => {
    mockApi({ ...api, '/api/site': () => jsonResponse({ error: 'Down.', fields: [] }, 500) })
    const { status, headers, body } = await render('/')

    expect(status).toBe(503)
    expect(headers['Cache-Control']).toBe('no-store')
    expect(body).toContain('<div id="root"></div>')
  })
})
