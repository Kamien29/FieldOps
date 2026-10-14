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

function extractMessage(payload, status) {
  if (status === 0 || status === 502 || status === 503 || status === 504) {
    return 'Nie udało się połączyć z serwerem. Uruchom backend i spróbuj ponownie.'
  }

  if (payload == null) {
    return status === 401
      ? 'Nieprawidłowy e-mail lub hasło.'
      : `Żądanie nie powiodło się (kod ${status}).`
  }

  if (typeof payload === 'string' && payload.trim()) {
    return payload
  }

  if (typeof payload === 'object') {
    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message
    }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error
    }
    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      return payload.errors
        .map((item) => (typeof item === 'string' ? item : item.message))
        .filter(Boolean)
        .join(' ')
    }
  }

  if (status === 401) {
    return 'Nieprawidłowy e-mail lub hasło.'
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
      credentials: 'include',
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...rest,
    })
  } catch {
    throw new ApiError(
      0,
      'Nie udało się połączyć z serwerem. Uruchom backend i spróbuj ponownie.',
    )
  }

  const payload = await parseBody(response)

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractMessage(payload, response.status),
      payload,
    )
  }

  return payload
}

export function unwrapUser(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload
  }

  return payload.user ?? payload.data ?? payload
}

export function unwrapToken(payload) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  return payload.token ?? payload.accessToken ?? payload.access_token ?? null
}

export function unwrapList(payload) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.jobs)) return payload.jobs
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload.content)) return payload.content
    if (Array.isArray(payload.items)) return payload.items
  }

  return []
}
