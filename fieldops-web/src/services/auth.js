import { request, setAccessToken } from './api.js'

/** POST /api/login → { token, user: { id, name, email } } */
export async function login(input) {
  const payload = await request('/api/login', {
    method: 'POST',
    body: { email: input.email, password: input.password },
  })
  if (!payload?.token || !payload?.user) {
    throw new Error('Serwer zwrócił niepoprawną odpowiedź logowania.')
  }
  setAccessToken(payload.token)
  return payload.user
}

/**
 * Backend nie ma endpointu wylogowania (token jest bezstanowy, ważny 30 dni),
 * więc wylogowanie czyści tylko token po stronie klienta.
 */
export function logout() {
  setAccessToken(null)
}
