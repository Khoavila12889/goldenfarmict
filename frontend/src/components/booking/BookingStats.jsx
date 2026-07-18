import React from 'react'
import { getBookingStats } from '../../utils/bookingUtils'

const STAT_ITEMS = [
  { key: 'total', label: 'Tổng số', icon: '📋', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  { key: 'active', label: 'Đang sử dụng', icon: '🟢', color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  { key: 'upcoming', label: 'Sắp diễn ra', icon: '🟡', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  { key: 'finished', label: 'Đã kết thúc', icon: '✅', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  { key: 'expired', label: 'Đã hết giờ', icon: '⏰', color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
]

export default function BookingStats({ bookings, compact }) {
  const stats = getBookingStats(bookings)

  if (compact) {
    return (
      <div className="bk-stats-compact">
        {STAT_ITEMS.map(item => (
          <div key={item.key} className="bk-stat-pill" style={{ '--pill-color': item.color, '--pill-bg': item.bg }}>
            <span>{item.icon}</span>
            <span className="bk-stat-pill-value">{stats[item.key]}</span>
            <span className="bk-stat-pill-label">{item.label}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="bk-stats">
      {STAT_ITEMS.map(item => (
        <div key={item.key} className="bk-stat-card">
          <div className="bk-stat-icon" style={{ background: item.bg, color: item.color }}>
            {item.icon}
          </div>
          <div className="bk-stat-info">
            <div className="bk-stat-value">{stats[item.key]}</div>
            <div className="bk-stat-label">{item.label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
