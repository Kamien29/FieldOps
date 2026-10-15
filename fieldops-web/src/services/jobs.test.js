import { describe, expect, it } from 'vitest'
import { mapJob, statusLabel, statusTone } from './jobs.js'

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
})
