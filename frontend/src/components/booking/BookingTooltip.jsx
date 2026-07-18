import React from 'react'
import { isExpired, getStatusLabel, formatBookingTime } from '../../utils/bookingUtils'

export default function BookingTooltip({ booking, position }) {
  if (!booking || !position) return null

  const status = getStatusLabel(booking)
  const expired = isExpired(booking)

  return (
    <div
      className="bk-tooltip"
      style={{
        left: position.x + 12,
        top: position.y + 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{booking.title}</div>
      <div>👤 {booking.full_name} {booking.department ? `(${booking.department})` : ''}</div>
      <div>🕐 {formatBookingTime(booking)}</div>
      {booking.notes && <div>📎 {booking.notes}</div>}
      <div style={{
        marginTop: '0.25rem', display: 'inline-block',
        padding: '0.1rem 0.4rem', borderRadius: 4,
        fontSize: '0.7rem', background: status.bg,
        color: status.color, fontWeight: 500,
      }}>
        {expired ? '⏰ Đã hết giờ' : status.text}
      </div>
    </div>
  )
}
