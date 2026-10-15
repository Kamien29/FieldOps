import { useState } from 'react'
import { JOB_STATUSES } from '../services/jobs.js'
import { validateJob } from '../validation.js'

const INITIAL = {
  title: '',
  description: '',
  clientName: '',
  address: '',
  dueDate: '',
  status: 'new',
}

export default function JobForm({ onSubmit, submitting, disabled = false, submitLabel = 'Utwórz zlecenie' }) {
  const [values, setValues] = useState(INITIAL)
  const [errors, setErrors] = useState({})

  function updateField(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = validateJob(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    await onSubmit({
      title: values.title.trim(),
      description: values.description.trim(),
      clientName: values.clientName.trim(),
      address: values.address.trim(),
      dueDate: values.dueDate,
      status: values.status,
    })
  }

  return (
    <form className="job-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="title">Tytuł</label>
        <input
          id="title"
          name="title"
          value={values.title}
          onChange={updateField}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? 'title-error' : undefined}
        />
        {errors.title ? (
          <p id="title-error" className="field-error" role="alert">
            {errors.title}
          </p>
        ) : null}
      </div>

      <div className="field field-wide">
        <label htmlFor="description">Opis</label>
        <textarea
          id="description"
          name="description"
          rows="4"
          value={values.description}
          onChange={updateField}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? 'description-error' : undefined}
        />
        {errors.description ? (
          <p id="description-error" className="field-error" role="alert">
            {errors.description}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="clientName">Klient</label>
        <input
          id="clientName"
          name="clientName"
          value={values.clientName}
          onChange={updateField}
          aria-invalid={Boolean(errors.clientName)}
          aria-describedby={errors.clientName ? 'clientName-error' : undefined}
        />
        {errors.clientName ? (
          <p id="clientName-error" className="field-error" role="alert">
            {errors.clientName}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="address">Adres</label>
        <input
          id="address"
          name="address"
          value={values.address}
          onChange={updateField}
          aria-invalid={Boolean(errors.address)}
          aria-describedby={errors.address ? 'address-error' : undefined}
        />
        {errors.address ? (
          <p id="address-error" className="field-error" role="alert">
            {errors.address}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="dueDate">Termin</label>
        <input id="dueDate" name="dueDate" type="date" value={values.dueDate} onChange={updateField} aria-invalid={Boolean(errors.dueDate)} />
        {errors.dueDate ? <p className="field-error" role="alert">{errors.dueDate}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="status">Status</label>
        <select id="status" name="status" value={values.status} onChange={updateField}>
          {JOB_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" disabled={submitting || disabled}>
        {submitting ? 'Zapisywanie…' : submitLabel}
      </button>
    </form>
  )
}
