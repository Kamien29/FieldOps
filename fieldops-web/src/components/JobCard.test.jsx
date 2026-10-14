import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import JobCard from './JobCard.jsx'

describe('JobCard', () => {
  it('renders job fields and a Polish status label', () => {
    render(
      <MemoryRouter>
        <JobCard
          job={{
            id: 12,
            title: 'Przegląd pieca',
            clientName: 'Jan Kowalski',
            address: 'Łańcut',
            status: 'IN_PROGRESS',
          }}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Przegląd pieca' })).toHaveAttribute(
      'href',
      '/jobs/12',
    )
    expect(screen.getByText('Klient: Jan Kowalski')).toBeInTheDocument()
    expect(screen.getByText('W realizacji')).toBeInTheDocument()
  })
})
