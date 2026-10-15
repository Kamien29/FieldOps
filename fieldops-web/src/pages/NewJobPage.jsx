import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import JobForm from '../components/JobForm.jsx'
import { SUPPORTED, UNSUPPORTED_MESSAGE } from '../services/capabilities.js'
import { createJob } from '../services/jobs.js'

export default function NewJobPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(values) {
    setSubmitting(true)
    setError('')
    try {
      await createJob(values)
      navigate('/jobs')
    } catch (requestError) {
      setError(requestError.message || 'Nie udało się utworzyć zlecenia.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="panel">
      <h2>Nowe zlecenie</h2>
      {!SUPPORTED.createJob ? (
        <p className="banner-error" role="status">
          {UNSUPPORTED_MESSAGE}
        </p>
      ) : null}
      {error ? (
        <p className="banner-error" role="alert">
          {error}
        </p>
      ) : null}
      <JobForm onSubmit={handleSubmit} submitting={submitting} disabled={!SUPPORTED.createJob} />
    </section>
  )
}
