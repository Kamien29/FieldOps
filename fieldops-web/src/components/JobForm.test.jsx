import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { validateJob } from '../validation.js'
import JobForm from './JobForm.jsx'

describe('JobForm', () => {
  it('rejects empty job fields', () => {
    expect(
      validateJob({
        title: ' ',
        description: '',
        clientName: '',
        address: '',
        status: 'NEW',
      }),
    ).toMatchObject({
      title: expect.any(String),
      description: expect.any(String),
      clientName: expect.any(String),
      address: expect.any(String),
    })
  })

  it('shows validation messages and does not submit incomplete data', async function () {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<JobForm onSubmit={onSubmit} submitting={false} />)

    await user.click(screen.getByRole('button', { name: 'Utwórz zlecenie' }))

    expect(screen.getByText('Podaj tytuł zlecenia.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits trimmed job payload', async function () {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<JobForm onSubmit={onSubmit} submitting={false} />)

    await user.type(screen.getByLabelText('Tytuł'), '  Naprawa pompy  ')
    await user.type(screen.getByLabelText('Opis'), 'Wymiana uszczelki')
    await user.type(screen.getByLabelText('Klient'), 'Anna Nowak')
    await user.type(screen.getByLabelText('Adres'), 'Rzeszów')
    await user.click(screen.getByRole('button', { name: 'Utwórz zlecenie' }))

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Naprawa pompy',
      description: 'Wymiana uszczelki',
      clientName: 'Anna Nowak',
      address: 'Rzeszów',
      status: 'NEW',
    })
  })
})
