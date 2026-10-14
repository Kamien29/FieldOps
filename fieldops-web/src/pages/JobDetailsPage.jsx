import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getJobById, statusLabel, statusTone } from '../services/jobs.js'

export default function JobDetailsPage() {
  const { jobId } = useParams()
  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadJob() {
      setLoading(true)
      setError('')
      try {
        const data = await getJobById(jobId)
        if (!cancelled) {
          setJob(data)
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || 'Nie udało się pobrać zlecenia.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadJob()
    return () => {
      cancelled = true
    }
  }, [jobId])

  return (
    <section className="panel">
      <Link className="back-link" to="/jobs">
        ← Wróć do listy
      </Link>
      {loading ? <p role="status">Ładowanie szczegółów…</p> : null}
      {error ? (
        <p className="banner-error" role="alert">
          {error}
        </p>
      ) : null}
      {job ? (
        <article className="job-details">
          <div className="panel-header">
            <h2>{job.title}</h2>
            <span className={`status-badge status-${statusTone(job.status)}`}>
              {statusLabel(job.status)}
            </span>
          </div>
          <dl>
            <div>
              <dt>Klient</dt>
              <dd>{job.clientName}</dd>
            </div>
            <div>
              <dt>Adres</dt>
              <dd>{job.address}</dd>
            </div>
            <div>
              <dt>Opis</dt>
              <dd>{job.description}</dd>
            </div>
          </dl>
        </article>
      ) : null}
    </section>
  )
}
