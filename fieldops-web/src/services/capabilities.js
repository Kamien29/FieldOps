// Operacje, których backend FieldOps (docs/API.md) obecnie NIE udostępnia.
// Backend ma tylko: POST /api/login, GET /api/jobs, POST /api/jobs/:id/status,
// PUT /api/jobs/:id/report, zdjęcia. Brak: rejestracji, tworzenia zleceń, /me, wylogowania.
// Gdy odpowiednie endpointy pojawią się w backendzie, przestaw flagę na true
// i dopisz wywołanie w services/auth.js lub services/jobs.js.
export const SUPPORTED = {
  register: false,
  createJob: false,
}

export const UNSUPPORTED_MESSAGE =
  'Ta operacja nie jest jeszcze dostępna: backend FieldOps nie udostępnia odpowiedniego endpointu.'
