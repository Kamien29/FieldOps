import { request, setAccessToken, unwrapToken, unwrapUser } from './api.js'

function applySession(payload) {
  const token = unwrapToken(payload)
  if (token) {
    setAccessToken(token)
  }
  return unwrapUser(payload)
}

export async function register(input) {
  const payload = await request('/api/auth/register', {
    method: 'POST',
    body: {
      email: input.email,
      password: input.password,
      name: input.name || undefined,
    },
  })
  return applySession(payload)
}

export async function login(input) {
  const payload = await request('/api/auth/login', {
    method: 'POST',
    body: {
      email: input.email,
      password: input.password,
    },
  })
  return applySession(payload)
}

export async function getCurrentUser() {
  const payload = await request('/api/auth/me')
  return unwrapUser(payload)
}

export async function logout() {
  try {
    await request('/api/auth/logout', { method: 'POST' })
  } catch (error) {
    if (error.status && error.status !== 404) {
      throw error
    }
  } finally {
    setAccessToken(null)
  }
}
