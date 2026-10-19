import { request } from './api.js'

/** POST /api/register → 201 { token, user }; backend od razu zakłada sesję (ciasteczko). */
export async function register(input) {
  const payload = await request('/api/register', {
    method: 'POST',
    body: { name: input.name, email: input.email, password: input.password },
  })
  return payload.user
}

/** POST /api/login → { token, user }; sesję przechowuje ciasteczko HttpOnly. */
export async function login(input) {
  const payload = await request('/api/login', {
    method: 'POST',
    body: { email: input.email, password: input.password },
  })
  return payload.user
}

/** GET /api/me → { user } (odtworzenie sesji po odświeżeniu strony). */
export async function getCurrentUser() {
  const payload = await request('/api/me')
  return payload.user
}

/** POST /api/logout – backend kasuje ciasteczko sesji. */
export async function logout() {
  await request('/api/logout', { method: 'POST' })
}
