import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { updateProfile } from '../services/profile.js'

export default function ProfilePage() {
  const { user } = useAuth()
  const [values, setValues] = useState({
    name: user?.name || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    setValues((current) => ({
      ...current,
      name: user?.name || '',
      email: user?.email || '',
    }))
  }, [user])

  function updateField(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setError('')
    setSuccess('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    const name = values.name.trim()
    const email = values.email.trim().toLowerCase()

    if (!name) {
      setError('Podaj imię i nazwisko lub nazwę użytkownika.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Podaj poprawny adres e-mail.')
      return
    }
    if (values.newPassword || values.currentPassword || values.confirmPassword) {
      if (!values.currentPassword) {
        setError('Podaj obecne hasło, aby ustawić nowe.')
        return
      }
      if (values.newPassword.length < 8) {
        setError('Nowe hasło musi mieć co najmniej 8 znaków.')
        return
      }
      if (values.newPassword !== values.confirmPassword) {
        setError('Nowe hasła nie są identyczne.')
        return
      }
    }

    setSaving(true)
    try {
      const updated = await updateProfile({
        name,
        email,
        ...(values.newPassword
          ? { currentPassword: values.currentPassword, newPassword: values.newPassword }
          : {}),
      })
      // AuthContext owns the displayed session user. A reload restores the updated user
      // from GET /api/me; fields are updated locally for immediate feedback.
      setValues((current) => ({
        ...current,
        name: updated.name || name,
        email: updated.email || email,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      }))
      setSuccess('Profil został zapisany.')
      window.dispatchEvent(new Event('fieldops:profile-updated'))
    } catch (requestError) {
      setError(requestError.message || 'Nie udało się zapisać profilu.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Konto użytkownika</p>
          <h2>Twój profil</h2>
          <p className="muted">Zmień dane konta lub ustaw nowe hasło.</p>
        </div>
      </div>

      {error ? <p className="banner-error" role="alert">{error}</p> : null}
      {success ? (
        <p className="profile-success" role="status">{success}</p>
      ) : null}

      <form className="profile-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="profile-name">Imię i nazwisko / nazwa</label>
          <input
            id="profile-name"
            name="name"
            type="text"
            autoComplete="name"
            maxLength={100}
            value={values.name}
            onChange={updateField}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="profile-email">Adres e-mail</label>
          <input
            id="profile-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            value={values.email}
            onChange={updateField}
            required
          />
        </div>

        <div className="profile-divider">
          <h3>Zmiana hasła</h3>
          <p className="muted">Zostaw pola puste, jeśli nie chcesz zmieniać hasła.</p>
        </div>

        <div className="field">
          <label htmlFor="profile-current-password">Obecne hasło</label>
          <input
            id="profile-current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            value={values.currentPassword}
            onChange={updateField}
          />
        </div>

        <div className="field">
          <label htmlFor="profile-new-password">Nowe hasło</label>
          <input
            id="profile-new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={200}
            value={values.newPassword}
            onChange={updateField}
          />
        </div>

        <div className="field">
          <label htmlFor="profile-confirm-password">Powtórz nowe hasło</label>
          <input
            id="profile-confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={values.confirmPassword}
            onChange={updateField}
          />
        </div>

        <button type="submit" disabled={saving || loading}>
          {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
        </button>
      </form>
    </section>
  )
}
