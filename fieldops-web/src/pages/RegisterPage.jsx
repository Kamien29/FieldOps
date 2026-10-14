import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { validateRegister } from '../validation.js'

export default function RegisterPage() {
  const { register, login } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function updateField(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = validateRegister(values)
    setErrors(nextErrors)
    setApiError('')
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setSubmitting(true)
    try {
      const credentials = {
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
      }
      const user = await register(credentials)
      if (!user?.email) {
        await login({ email: credentials.email, password: credentials.password })
      }
      navigate('/jobs', { replace: true })
    } catch (error) {
      setApiError(error.message || 'Nie udało się utworzyć konta.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">System serwisowy</p>
        <h1>FieldOps</h1>
        <h2>Rejestracja</h2>

        {apiError ? (
          <p className="banner-error" role="alert">
            {apiError}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="name">Imię i nazwisko</label>
            <input
              id="name"
              name="name"
              autoComplete="name"
              value={values.name}
              onChange={updateField}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {errors.name ? (
              <p id="name-error" className="field-error" role="alert">
                {errors.name}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              value={values.email}
              onChange={updateField}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email ? (
              <p id="email-error" className="field-error" role="alert">
                {errors.email}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="password">Hasło</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={values.password}
              onChange={updateField}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
            />
            {errors.password ? (
              <p id="password-error" className="field-error" role="alert">
                {errors.password}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="confirmPassword">Powtórz hasło</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={values.confirmPassword}
              onChange={updateField}
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
            />
            {errors.confirmPassword ? (
              <p id="confirmPassword-error" className="field-error" role="alert">
                {errors.confirmPassword}
              </p>
            ) : null}
          </div>

          <button type="submit" disabled={submitting}>
            {submitting ? 'Tworzenie konta…' : 'Zarejestruj'}
          </button>
        </form>

        <p className="auth-switch">
          Masz już konto? <Link to="/login">Zaloguj się</Link>
        </p>
      </div>
    </div>
  )
}
