import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import JobCard from '../components/JobCard.jsx'
import { getJobs, JOB_STATUSES, statusLabel } from '../services/jobs.js'

export default function JobsPage() {
  const [jobs, setJobs] = useState([])
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageData, setPageData] = useState({ total: 0, totalPages: 1 })
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadJobs() {
      setLoading(true)
      setError('')
      try {
        const data = await getJobs(page)
        if (!cancelled) {
          setJobs(data.items)
          setPageData(data)
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || 'Nie udało się pobrać zleceń.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadJobs()
    return () => {
      cancelled = true
    }
  }, [page, reload])

  const visibleJobs = useMemo(() => {
    if (filter === 'ALL') return jobs
    return jobs.filter((job) => String(job.status).toLowerCase() === filter)
  }, [jobs, filter])

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Lista zleceń</h2>
          <p className="muted">Zlecenia: {pageData.total}</p>
        </div>
        <div className="panel-actions">
          <label className="filter">
            Status
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filtruj zlecenia według statusu"
            >
              <option value="ALL">Wszystkie</option>
              {JOB_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {statusLabel(status.value)}
                </option>
              ))}
            </select>
          </label>
          <Link className="button-link" to="/jobs/new">
            Dodaj zlecenie
          </Link>
        </div>
      </div>

      {loading ? <p role="status">Ładowanie zleceń…</p> : null}
      {error ? (
        <p className="banner-error" role="alert">
          {error}
        </p>
      ) : null}
      {error ? <button type="button" onClick={() => setReload((value) => value + 1)}>Spróbuj ponownie</button> : null}
      {!loading && !error && visibleJobs.length === 0 ? (
        <p className="empty">Brak zleceń do wyświetlenia.</p>
      ) : null}
      {!loading && !error
        ? visibleJobs.map((job) => <JobCard key={job.id} job={job} />)
        : null}
      {!loading && !error && pageData.totalPages > 1 ? (
        <nav className="pagination" aria-label="Paginacja zleceń">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Poprzednia
          </button>
          <span aria-live="polite">
            Strona {page} z {pageData.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= pageData.totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Następna
          </button>
        </nav>
      ) : null}
    </section>
  )
}
