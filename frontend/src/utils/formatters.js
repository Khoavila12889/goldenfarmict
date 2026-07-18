export function formatDate(s) {
  if (!s) return ''
  const parts = s.split(/[- :]/)
  if (parts.length < 3) return s
  const d = parts[2], m = parts[1], y = parts[0]
  const time = parts[3] ? ` ${parts[3]}:${parts[4]}` : ''
  return `${d}/${m}/${y}${time}`
}
