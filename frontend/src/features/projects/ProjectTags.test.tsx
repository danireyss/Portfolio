import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { projects, site } from '@/test/fixtures'
import { mockApi, renderApp } from '@/test/utils'

describe('project tags', () => {
  it('show technology icons in the filter and on the project cards', async () => {
    mockApi({ '/api/site': site, '/api/projects': projects })
    renderApp('/projects')

    // The filter button keeps its "Name (count)" label; the icon is decorative.
    const rust = await screen.findByRole('radio', { name: 'Rust (2)' })
    expect(rust.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')

    const cardTags = screen.getAllByRole('list', { name: 'Tags' })
    expect(cardTags.length).toBeGreaterThan(0)
    for (const tag of cardTags.flatMap((list) => within(list).getAllByRole('listitem'))) {
      expect(tag.querySelector('svg')).toBeInTheDocument()
    }
  })
})
