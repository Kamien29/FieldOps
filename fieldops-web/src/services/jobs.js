import { ApiError, request, unwrapJobs } from './api.js'
import { UNSUPPORTED_MESSAGE } from './capabilities.js'

// Wartości statusów zgodne z backendem (docs/API.md).
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
 * Backend nie zwraca `description` ani `createdAt` – pozostają puste/null.
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

/** GET /api/jobs – backend zwraca wszystkie zlecenia użytkownika (bez paginacji). */
export async function getJobs() {
  const payload = await request('/api/jobs')
  return unwrapJobs(payload).map(mapJob)
}

/** Backend nie ma GET /api/jobs/:id – szczegóły wybieramy z listy zleceń użytkownika. */
export async function getJobById(id) {
  const jobs = await getJobs()
  const job = jobs.find((item) => String(item.id) === String(id))
  if (!job) {
    throw new ApiError(404, 'Nie znaleziono zlecenia.')
  }
  return job
}

/** Backend nie ma endpointu tworzenia zleceń (patrz services/capabilities.js). */
export async function createJob() {
  throw new ApiError(501, UNSUPPORTED_MESSAGE)
}
