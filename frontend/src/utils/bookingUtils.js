export const RESOURCE_COLORS = [
  '#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
]

export function resourceColor(index) {
  return RESOURCE_COLORS[index % RESOURCE_COLORS.length]
}

export function isExpired(b) {
  if (!b || b.status !== 'active') return false
  if (!b.book_date || !b.end_time) return false
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  if (b.book_date < today) return true
  if (b.book_date > today) return false
  const parts = b.end_time.split(':')
  if (parts.length < 2) return false
  const [eh, em] = parts.map(Number)
  return now.getHours() > eh || (now.getHours() === eh && now.getMinutes() >= em)
}

export function isUpcoming(b) {
  if (!b || b.status !== 'active') return false
  if (!b.book_date || !b.start_time) return false
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  if (b.book_date > today) return true
  if (b.book_date < today) return false
  const parts = b.start_time.split(':')
  if (parts.length < 2) return false
  const [sh, sm] = parts.map(Number)
  return now.getHours() < sh || (now.getHours() === sh && now.getMinutes() < sm)
}

export function getResourceIcon(type) {
  return type === 'car' ? '🚗' : '🏢'
}

export function getStatusLabel(booking) {
  if (booking.status === 'finished') return { text: 'Đã kết thúc', color: '#6b7280', bg: 'rgba(100,116,139,0.15)' }
  if (isExpired(booking)) return { text: 'Đã hết giờ', color: '#dc2626', bg: 'rgba(239,68,68,0.12)' }
  if (isUpcoming(booking)) return { text: 'Sắp diễn ra', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' }
  return { text: 'Đang sử dụng', color: '#16a34a', bg: 'rgba(34,197,94,0.15)' }
}

export function getResourceTypeLabel(type) {
  return type === 'car' ? 'Xe' : 'Phòng họp'
}

export function formatBookingTime(booking) {
  return `${booking.start_time} → ${booking.end_time}`
}

export function formatDateDDMM(s) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d)) return s
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export function validateBookingForm({ resource_id, title, date, startTime, endTime }) {
  const errors = []
  if (!title || !title.trim()) errors.push('Vui lòng nhập mục đích.')
  if (!resource_id) errors.push('Vui lòng chọn tài nguyên.')
  if (!date) errors.push('Vui lòng chọn ngày.')
  if (!startTime) errors.push('Vui lòng chọn giờ bắt đầu.')
  if (!endTime) errors.push('Vui lòng chọn giờ kết thúc.')
  if (startTime && endTime && startTime >= endTime) {
    errors.push('Giờ kết thúc phải sau giờ bắt đầu.')
  }
  return errors
}

export function getBookingStats(bookings) {
  const upcoming = bookings.filter(b => isUpcoming(b)).length
  const active = bookings.filter(b => b.status === 'active' && !isExpired(b) && !isUpcoming(b)).length
  const finished = bookings.filter(b => b.status === 'finished').length
  const expired = bookings.filter(b => isExpired(b)).length
  const total = bookings.length
  return { upcoming, active, finished, expired, total }
}
