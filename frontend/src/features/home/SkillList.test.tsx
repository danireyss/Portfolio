import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { projects, site } from '@/test/fixtures'
import { mockApi, renderApp } from '@/test/utils'

describe('skills', () => {
  it('shows an icon beside each skill, with or without a brand logo', async () => {
    mockApi({ '/api/site': site, '/api/projects': projects })
    renderApp('/')

    // Rust has a Simple Icons logo; AWS falls back to a lucide icon. Both are decorative.
    for (const name of [/^Rust/, /^AWS/]) {
      const icon = (await screen.findByRole('link', { name })).querySelector('svg')
      expect(icon).toBeInTheDocument()
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    }
  })
})
