import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { expect, it } from 'vitest'
import { projects } from '@/test/fixtures'
import { ProjectCoverFlow } from './ProjectCoverFlow'

const three = [...projects.projects, { ...projects.projects[0]!, slug: 'gamma', title: 'Gamma' }]

it('starts in the middle and moves with the buttons, dots, and arrow keys', async () => {
  // The Details link prefetches its project's data, which needs a query client.
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ProjectCoverFlow projects={three} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  const current = () => screen.getByRole('button', { current: true })
  // Off-center slides are aria-hidden, so only the active slide's link is exposed.
  const detailsLink = () => screen.getByRole('link', { name: /Details/ })

  expect(current()).toHaveAccessibleName('Show Beta')
  expect(detailsLink()).toHaveAttribute('href', '/projects/beta')

  await user.click(screen.getByRole('button', { name: 'Next project' }))
  expect(current()).toHaveAccessibleName('Show Gamma')
  expect(screen.getByRole('button', { name: 'Next project' })).toBeDisabled()

  await user.click(screen.getByRole('button', { name: 'Show Alpha' }))
  expect(detailsLink()).toHaveAttribute('href', '/projects/alpha')

  await user.keyboard('{ArrowRight}')
  expect(current()).toHaveAccessibleName('Show Beta')
})
