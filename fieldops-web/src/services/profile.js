import { request } from './api.js'

/** PATCH /api/me – aktualizacja danych zalogowanego użytkownika. */
export async function updateProfile(input) {
  const payload = await request('/api/me', {
    method: 'PATCH',
    body: input,
  })
  return payload.user
}
