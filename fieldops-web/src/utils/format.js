export function formatDateTime(value) {
  if (!value) return 'Nie podano'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Nie podano'
  return date.toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })
}
