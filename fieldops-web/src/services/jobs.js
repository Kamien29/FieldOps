import { ApiError, request } from './api.js'

export const DEFAULT_PAGE_SIZE = 10

// Wartości statusów zgodne z backendem (docs/API.md). Nowe zlecenie zawsze zaczyna jako 'new'.
export const JOB_STATUSES = [
  { value: 'new', label: 'Do wykonania' },
  { value: 'in_progress', label: 'W realizacji' },
  { value: 'done', label: 'Wykonane' },
]

const STATUS_LABELS = {
  NEW: 'Do wykonania',
  TODO: 'Do wykonania',
  IN_PROGRESS: 'W realizacji',
  DONE: 'Wykonane',
}

export function statusLabel(status) {
  if (!status) return 'Nieznany'
  return STATUS_LABELS[String(status).toUpperCase()] || status
}

export function statusTone(status) {
  const normalized = String(status || '').toUpperCase()
  if (normalized === 'DONE') return 'done'
  if (normalized === 'IN_PROGRESS') return 'progress'
  return 'new'
}

/**
 * Mapowanie modelu backendu na model frontendu (granica aplikacji):
 *   customer    → clientName
 *   scheduledAt → dueDate
 */
export function mapJob(raw) {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? '',
    clientName: raw.customer ?? '',
    address: raw.address ?? '',
    status: raw.status,
    dueDate: raw.scheduledAt ?? null,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    version: raw.version,
    report: raw.report ?? null,
  }
}

/** Odwrotne mapowanie dla POST /api/jobs. `dueDate` z formularza (datetime-local) → ISO. */
export function toApiJob(input) {
  const due = new Date(input.dueDate)
  return {
    title: input.title,
    description: input.description,
    customer: input.clientName,
    address: input.address,
    scheduledAt: Number.isNaN(due.getTime()) ? input.dueDate : due.toISOString(),
  }
}

/** GET /api/jobs?page&limit – lista zleceń zalogowanego użytkownika, posortowana po terminie. */
export async function getJobs(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  const query = new URLSearchParams({ page: String(page), limit: String(pageSize) })
  const payload = await request(`/api/jobs?${query}`)
  const meta = payload.pagination
  return {
    items: payload.jobs.map(mapJob),
    page: meta.page,
    pageSize: meta.limit,
    total: meta.total,
    totalPages: meta.totalPages,
  }
}

/** GET /api/jobs/:id */
export async function getJobById(id) {
  const payload = await request(`/api/jobs/${encodeURIComponent(id)}`)
  return mapJob(payload.job)
}

/** POST /api/jobs – status początkowy ustawia backend ('new'). */
export async function createJob(input) {
  const payload = await request('/api/jobs', { method: 'POST', body: toApiJob(input) })
  return mapJob(payload.job)
}

export { ApiError }
