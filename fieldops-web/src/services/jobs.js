import { request, unwrapList } from './api.js'

export const JOB_STATUSES = [
  { value: 'NEW', label: 'Do wykonania' },
  { value: 'IN_PROGRESS', label: 'W realizacji' },
  { value: 'DONE', label: 'Wykonane' },
]

const STATUS_LABELS = {
  NEW: 'Do wykonania',
  OPEN: 'Do wykonania',
  TODO: 'Do wykonania',
  IN_PROGRESS: 'W realizacji',
  INPROGRESS: 'W realizacji',
  DONE: 'Wykonane',
  COMPLETED: 'Wykonane',
  CLOSED: 'Wykonane',
  'Do wykonania': 'Do wykonania',
  'W realizacji': 'W realizacji',
  Wykonane: 'Wykonane',
}

export function statusLabel(status) {
  if (!status) return 'Nieznany'
  return STATUS_LABELS[status] || STATUS_LABELS[String(status).toUpperCase()] || status
}

export function statusTone(status) {
  const normalized = String(status || '').toUpperCase()
  if (normalized === 'DONE' || normalized === 'COMPLETED' || normalized === 'CLOSED' || status === 'Wykonane') {
    return 'done'
  }
  if (normalized === 'IN_PROGRESS' || normalized === 'INPROGRESS' || status === 'W realizacji') {
    return 'progress'
  }
  return 'new'
}

export async function getJobs() {
  const payload = await request('/api/jobs')
  return unwrapList(payload)
}

export async function getJobById(id) {
  const jobs = await getJobs()
  const job = jobs.find((item) => String(item.id) === String(id))
  if (!job) {
    const error = new Error('Nie znaleziono zlecenia.')
    error.status = 404
    throw error
  }
  return job
}

export async function createJob(input) {
  return request('/api/jobs', {
    method: 'POST',
    body: {
      title: input.title,
      description: input.description,
      clientName: input.clientName,
      address: input.address,
      status: input.status || 'NEW',
    },
  })
}
