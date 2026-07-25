import React, { useState } from 'react'
import { formatDate } from '../../utils/date'

function parseDateInput(val) {
  const parts = val.split('/')
  if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`
  }
  return null
}

export default function BookingFilter({ filterDate, filterType, filterStatus, dateSet, onFilterChange }) {
  const hasDate = dateSet.has(filterDate)

  const shiftDay = (delta) => {
    const d = new Date(filterDate)
    d.setDate(d.getDate() + delta)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    onFilterChange(`${y}-${m}-${day}`, null, null)
  }

  return (
    <div className="bk-filter-bar">
      <div className="bk-date-nav">
        <button className="bk-date-nav-btn" onClick={() => shiftDay(-1)} title="Ngày trước">‹</button>
        <input
          type="text"
          className="bk-input"
          placeholder="DD/MM/YYYY"
          value={formatDate(filterDate)}
          onChange={e => {
            const parsed = parseDateInput(e.target.value)
            if (parsed) onFilterChange(parsed, null, null)
          }}
          style={hasDate ? { borderColor: '#f59e0b' } : {}}
        />
        <button className="bk-date-nav-btn" onClick={() => shiftDay(1)} title="Ngày sau">›</button>
      </div>
      <select
        className="bk-select"
        value={filterType}
        onChange={e => onFilterChange(null, e.target.value, null)}
      >
        <option value="all">Tất cả loại</option>
        <option value="car">🚗 Xe</option>
        <option value="meeting_room">🏢 Phòng họp</option>
      </select>
      <select
        className="bk-select"
        value={filterStatus}
        onChange={e => onFilterChange(null, null, e.target.value)}
      >
        <option value="all">Tất cả trạng thái</option>
        <option value="active">🟢 Đang sử dụng</option>
        <option value="finished">✅ Đã kết thúc</option>
      </select>
    </div>
  )
}
