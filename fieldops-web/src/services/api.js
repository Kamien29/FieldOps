// Jedyne miejsce, w którym aplikacja woła fetch. Kontrakt: docs/API.md backendu.
// Token (Bearer) trzymany wyłącznie w pamięci modułu – nie trafia do localStorage.
let accessToken = null

export function setAccessToken(token) {
  accessToken = token || null
}

export function getAccessToken() {
  return accessToken
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

const NETWORK_MESSAGE = 'Nie udało się połączyć z serwerem. Uruchom backend i spróbuj ponownie.'

// Backend zwraca { error: "<kod>" } – tłumaczymy znane kody na czytelne komunikaty.
const ERROR_MESSAGES = {
  invalid_credentials: 'Nieprawidłowy e-mail lub hasło.',
  invalid_credentials_format: 'Podaj poprawny e-mail i hasło.',
  unauthorized: 'Sesja wygasła. Zaloguj się ponownie.',
  job_not_found: 'Nie znaleziono zlecenia.',
  not_found: 'Nie znaleziono zasobu.',
  invalid_json: 'Serwer odrzucił żądanie (niepoprawny JSON).',
  payload_too_large: 'Przesyłane dane są zbyt duże.',
  internal_error: 'Wystąpił błąd serwera. Spróbuj ponownie później.',
}

function extractMessage(payload, status) {
  if (status === 0 || status === 502 || status === 503 || status === 504) {
    return NETWORK_MESSAGE
  }
  if (payload && typeof payload === 'object') {
    if (typeof payload.error === 'string' && ERROR_MESSAGES[payload.error]) {
      return ERROR_MESSAGES[payload.error]
    }
    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message
    }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error
    }
  }
  if (typeof payload === 'string' && payload.trim()) {
    return payload
  }
  if (status === 401) {
    return ERROR_MESSAGES.invalid_credentials
  }
  return `Żądanie nie powiodło się (kod ${status}).`
}

async function parseBody(response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }
  const text = await response.text()
  return text ? text : null
}

export async function request(path, options = {}) {
  const { body, headers, ...rest } = options
  const requestHeaders = {
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  }
  if (accessToken) {
    requestHeaders.Authorization = `Bearer ${accessToken}`
  }

  let response
  try {
    response = await fetch(path, {
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...rest,
    })
  } catch {
    throw new ApiError(0, NETWORK_MESSAGE)
  }

  let payload = null
  try {
    payload = await parseBody(response)
  } catch {
    payload = null
  }

  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') {
      setAccessToken(null)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('fieldops:session-expired'))
      }
    }
    throw new ApiError(response.status, extractMessage(payload, response.status), payload)
  }

  return payload
}

/** GET /api/jobs → { serverTime, jobs: [...] }. Zwraca samą tablicę surowych zleceń. */
export function unwrapJobs(payload) {
  if (payload && typeof payload === 'object' && Array.isArray(payload.jobs)) {
    return payload.jobs
  }
  return []
}
