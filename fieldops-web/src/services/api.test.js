import { describe, expect, it } from 'vitest'
import { ApiError, unwrapList, unwrapToken, unwrapUser } from './api.js'

describe('api helpers', () => {
  it('unwraps job lists from common API envelopes', () => {
    expect(unwrapList([{ id: 1 }])).toEqual([{ id: 1 }])
    expect(unwrapList({ jobs: [{ id: 2 }] })).toEqual([{ id: 2 }])
    expect(unwrapList({ data: [{ id: 3 }] })).toEqual([{ id: 3 }])
    expect(unwrapList({})).toEqual([])
  })

  it('unwraps user and token from login payload', () => {
    expect(unwrapUser({ user: { email: 'a@b.c' } })).toEqual({ email: 'a@b.c' })
    expect(unwrapToken({ accessToken: 'abc' })).toBe('abc')
    expect(unwrapToken({ token: 'xyz' })).toBe('xyz')
  })

  it('keeps API error status for callers', () => {
    const error = new ApiError(401, 'Nieprawidłowy e-mail lub hasło.')
    expect(error.status).toBe(401)
    expect(error.message).toMatch(/hasło/)
  })
})
