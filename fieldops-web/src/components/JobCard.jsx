import { Link } from 'react-router-dom'
import { statusLabel, statusTone } from '../services/jobs.js'

export default function JobCard({ job }) {
  return (
    <article className="job-card">
      <div>
        <h3>
          <Link to={`/jobs/${job.id}`}>{job.title}</Link>
        </h3>
        <p>Klient: {job.clientName}</p>
        <p>Adres: {job.address}</p>
      </div>
      <span className={`status-badge status-${statusTone(job.status)}`}>
        {statusLabel(job.status)}
      </span>
    </article>
  )
}
