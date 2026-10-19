import { describe, expect, it } from 'vitest'
import { mapJob, statusLabel, statusTone, toApiJob } from './jobs.js'

describe('jobs service', () => {
  it('maps the backend job model to the frontend model', () => {
    const job = mapJob({
      id: 'J-1001',
      title: 'Przegląd pieca',
      customer: 'Jan Kowalski',
      address: 'Rzeszów',
      scheduledAt: '2026-11-10T08:00:00.000Z',
      status: 'in_progress',
      version: 3,
      updatedAt: '2026-11-01T10:00:00.000Z',
      report: null,
    })
    expect(job).toMatchObject({
      id: 'J-1001',
      title: 'Przegląd pieca',
      clientName: 'Jan Kowalski',
      address: 'Rzeszów',
      dueDate: '2026-11-10T08:00:00.000Z',
      status: 'in_progress',
      version: 3,
      description: '',
      createdAt: null,
    })
  })

  it('labels backend statuses in Polish', () => {
    expect(statusLabel('new')).toBe('Do wykonania')
    expect(statusLabel('in_progress')).toBe('W realizacji')
    expect(statusLabel('done')).toBe('Wykonane')
    expect(statusTone('done')).toBe('done')
    expect(statusTone('in_progress')).toBe('progress')
    expect(statusTone('new')).toBe('new')
  })

  it('maps the form model to the backend payload (clientName → customer, dueDate → ISO scheduledAt)', () => {
    const payload = toApiJob({
      title: 'Naprawa pompy',
      description: 'Wymiana uszczelki',
      clientName: 'Anna Nowak',
      address: 'Rzeszów',
      dueDate: '2026-11-10T09:30',
    })
    expect(payload).toEqual({
      title: 'Naprawa pompy',
      description: 'Wymiana uszczelki',
      customer: 'Anna Nowak',
      address: 'Rzeszów',
      scheduledAt: new Date('2026-11-10T09:30').toISOString(),
    })
    expect(payload).not.toHaveProperty('status')
  })
})
