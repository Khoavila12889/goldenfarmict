export const SYSTEM_DATE_FORMAT = 'DD/MM/YYYY'

export function formatDate(s) {
  if (!s) return ''
  const parts = s.split(/[- :]/)
  if (parts.length < 3) return s
  const d = parts[2], m = parts[1], y = parts[0]
  const time = parts[3] ? ` ${parts[3]}:${parts[4]}` : ''
  return `${d}/${m}/${y}${time}`
}

export function formatDateTime(s) {
  return formatDate(s)
}

export function formatDateDDMM(s) {
  if (!s) return ''
  try {
    const d = new Date(s)
    if (isNaN(d.getTime())) return s
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  } catch { return s }
}

export function toISODate(s) {
  const parts = s.split('/')
  if (parts.length === 3 && parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  return s
}

export function parseDateInput(val) {
  if (!val) return null
  const parts = val.split('/')
  if (parts.length === 3 && parts[0].length >= 1 && parts[1].length >= 1 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  return null
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
