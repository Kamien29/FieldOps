import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getAccessToken, request, setAccessToken, unwrapJobs } from './api.js'

afterEach(() => {
  vi.unstubAllGlobals()
  setAccessToken(null)
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

describe('api helpers', () => {
  it('unwraps the jobs array from the backend envelope', () => {
    expect(unwrapJobs({ serverTime: 'x', jobs: [{ id: 'J-1' }] })).toEqual([{ id: 'J-1' }])
    expect(unwrapJobs({})).toEqual([])
    expect(unwrapJobs(null)).toEqual([])
  })

  it('keeps API error status for callers', () => {
    const error = new ApiError(401, 'Nieprawidłowy e-mail lub hasło.')
    expect(error.status).toBe(401)
    expect(error.message).toMatch(/hasło/)
  })
})

describe('request', () => {
  it('translates backend error codes to Polish messages', async () => {
    stubFetch(401, { error: 'invalid_credentials' })
    await expect(request('/api/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 401,
      message: 'Nieprawidłowy e-mail lub hasło.',
    })
  })

  it('sends the in-memory token as a Bearer header', async () => {
    const fetchMock = stubFetch(200, { jobs: [] })
    setAccessToken('abc')
    await request('/api/jobs')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer abc')
  })

  it('clears the token and announces expiry on 401 for protected routes', async () => {
    stubFetch(401, { error: 'unauthorized' })
    setAccessToken('stale')
    const listener = vi.fn()
    window.addEventListener('fieldops:session-expired', listener)
    await expect(request('/api/jobs')).rejects.toBeInstanceOf(ApiError)
    window.removeEventListener('fieldops:session-expired', listener)
    expect(getAccessToken()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reports an unreachable server as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')))
    await expect(request('/api/jobs')).rejects.toMatchObject({ status: 0 })
  })
})
