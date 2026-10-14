export function validateLogin(values) {
  const errors = {}
  if (!values.email.trim()) {
    errors.email = 'Podaj adres e-mail.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Podaj poprawny adres e-mail.'
  }
  if (!values.password) {
    errors.password = 'Podaj hasło.'
  }
  return errors
}

export function validateRegister(values) {
  const errors = {}
  if (!values.name.trim()) {
    errors.name = 'Podaj imię lub nazwę.'
  }
  if (!values.email.trim()) {
    errors.email = 'Podaj adres e-mail.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Podaj poprawny adres e-mail.'
  }
  if (!values.password) {
    errors.password = 'Podaj hasło.'
  } else if (values.password.length < 8) {
    errors.password = 'Hasło musi mieć co najmniej 8 znaków.'
  }
  if (values.confirmPassword !== values.password) {
    errors.confirmPassword = 'Hasła nie są takie same.'
  }
  return errors
}

export function validateJob(values) {
  const errors = {}

  if (!values.title.trim()) {
    errors.title = 'Podaj tytuł zlecenia.'
  }
  if (!values.description.trim()) {
    errors.description = 'Podaj opis zlecenia.'
  }
  if (!values.clientName.trim()) {
    errors.clientName = 'Podaj nazwę klienta.'
  }
  if (!values.address.trim()) {
    errors.address = 'Podaj adres wykonania.'
  }
  if (!values.status) {
    errors.status = 'Wybierz status.'
  }

  return errors
}
