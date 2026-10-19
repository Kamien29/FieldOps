import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from './api.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(status, body) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('request', () => {
  it('keeps API error status for callers', () => {
    const error = new ApiError(401, 'Nieprawidłowy e-mail lub hasło.')
    expect(error.status).toBe(401)
    expect(error.message).toMatch(/hasło/)
  })

  it('translates backend error codes to Polish messages', async () => {
    stubFetch(401, { error: 'invalid_credentials' })
    await expect(request('/api/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 401,
      message: 'Nieprawidłowy e-mail lub hasło.',
    })
    stubFetch(409, { error: 'email_taken' })
    await expect(request('/api/register', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 409,
      message: 'Konto z tym adresem e-mail już istnieje.',
    })
  })

  it('uses the session cookie (same-origin) and sends the CSRF header, never an Authorization header', async () => {
    const fetchMock = stubFetch(200, { jobs: [] })
    await request('/api/jobs')
    const [, init] = fetchMock.mock.calls[0]
    expect(init.credentials).toBe('same-origin')
    expect(init.headers['X-Requested-With']).toBe('fieldops-web')
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('announces session expiry on 401 for protected routes only', async () => {
    const listener = vi.fn()
    window.addEventListener('fieldops:session-expired', listener)

    stubFetch(401, { error: 'unauthorized' })
    await expect(request('/api/jobs')).rejects.toBeInstanceOf(ApiError)
    expect(listener).toHaveBeenCalledTimes(1)

    stubFetch(401, { error: 'unauthorized' })
    await expect(request('/api/me')).rejects.toBeInstanceOf(ApiError)
    stubFetch(401, { error: 'invalid_credentials' })
    await expect(request('/api/login', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError)
    expect(listener).toHaveBeenCalledTimes(1)

    window.removeEventListener('fieldops:session-expired', listener)
  })

  it('reports an unreachable server as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')))
    await expect(request('/api/jobs')).rejects.toMatchObject({ status: 0 })
  })
})
