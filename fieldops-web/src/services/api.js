// Jedyne miejsce, w którym aplikacja woła fetch. Kontrakt: docs/API.md backendu.
// Sesja to ciasteczko HttpOnly ustawiane przez backend – JavaScript nie widzi ani nie przechowuje tokenu.

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
  csrf_blocked: 'Żądanie zostało zablokowane ze względów bezpieczeństwa. Odśwież stronę.',
  email_taken: 'Konto z tym adresem e-mail już istnieje.',
  invalid_name: 'Podaj imię lub nazwę.',
  invalid_email: 'Podaj poprawny adres e-mail.',
  invalid_password: 'Hasło musi mieć od 8 do 200 znaków.',
  invalid_title: 'Podaj tytuł zlecenia.',
  invalid_description: 'Podaj opis zlecenia.',
  invalid_customer: 'Podaj nazwę klienta.',
  invalid_address: 'Podaj adres wykonania.',
  invalid_scheduledAt: 'Podaj poprawny termin zlecenia.',
  invalid_page: 'Niepoprawny numer strony.',
  invalid_limit: 'Niepoprawny rozmiar strony.',
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

// Ścieżki, dla których 401 oznacza „brak/zła sesja”, a nie „sesja wygasła w trakcie pracy”.
const AUTH_PATHS = ['/api/login', '/api/register', '/api/me']

export async function request(path, options = {}) {
  const { body, headers, ...rest } = options
  const requestHeaders = {
    // Nagłówek wymagany przez backend dla zmian wykonywanych na sesji z ciasteczka (ochrona CSRF).
    'X-Requested-With': 'fieldops-web',
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  }

  let response
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
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
    if (response.status === 401 && !AUTH_PATHS.includes(path) && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('fieldops:session-expired'))
    }
    throw new ApiError(response.status, extractMessage(payload, response.status), payload)
  }

  return payload
}
