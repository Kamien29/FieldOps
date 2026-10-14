import { describe, expect, it } from 'vitest'
import { validateLogin, validateRegister } from './validation.js'

describe('form validation', () => {
  it('requires email and password on login', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Podaj adres e-mail.',
      password: 'Podaj hasło.',
    })
  })

  it('rejects mismatched registration passwords', () => {
    const errors = validateRegister({
      name: 'Anna',
      email: 'anna@example.com',
      password: 'password1',
      confirmPassword: 'password2',
    })
    expect(errors.confirmPassword).toBe('Hasła nie są takie same.')
  })
})
