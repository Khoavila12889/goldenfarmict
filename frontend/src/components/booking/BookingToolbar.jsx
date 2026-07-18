import React, { useRef, useState, useEffect } from 'react'
import { getBookingStats } from '../../utils/bookingUtils'

function fmtDDMM(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

export default function BookingToolbar({
  tab, onNewBooking, onNewTrip,
  filterDate, filterType, onFilterChange,
  bookings, isAdmin, onManageResources,
}) {
  const isBooking = tab === 'bookings'
  const stats = getBookingStats(bookings || [])
  const dateInputRef = useRef(null)
  const [displayDate, setDisplayDate] = useState(() => fmtDDMM(filterDate))

  useEffect(() => {
    setDisplayDate(fmtDDMM(filterDate))
  }, [filterDate])

  const shiftDay = (delta) => {
    const d = new Date(filterDate)
    d.setDate(d.getDate() + delta)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    onFilterChange(`${y}-${m}-${day}`, null, null)
  }

  const openDatePicker = () => {
    dateInputRef.current?.showPicker()
  }

  const handleDateChange = (e) => {
    const val = e.target.value
    if (!val) return
    setDisplayDate(fmtDDMM(val))
    onFilterChange(val, null, null)
  }

  const STAT_ITEMS = [
    { key: 'total', label: 'Tổng số', icon: '📋' },
    { key: 'active', label: 'Đang sử dụng', icon: '🟢' },
    { key: 'upcoming', label: 'Sắp diễn ra', icon: '🟡' },
    { key: 'finished', label: 'Đã kết thúc', icon: '✅' },
    { key: 'expired', label: 'Đã hết giờ', icon: '⏰' },
  ]

  return (
    <div className="bk-toolbar-root">
      <div className="bk-toolbar-row">
        <div className="bk-toolbar-left">
          <button className="bk-btn bk-btn-primary" onClick={isBooking ? onNewBooking : onNewTrip}>
            {isBooking ? '+ Đặt lịch mới' : '+ Đăng ký công tác'}
          </button>
          {isAdmin && (
            <button className="bk-btn" onClick={onManageResources}>
              ⚙️ Quản lý tài nguyên
            </button>
          )}
          <select className="bk-select bk-toolbar-filter-type" value={filterType}
            onChange={e => onFilterChange(null, e.target.value, null)}>
            <option value="all">Tất cả loại</option>
            <option value="car">🚗 Xe</option>
            <option value="meeting_room">🏢 Phòng họp</option>
          </select>
        </div>

        <div className="bk-toolbar-right">
          <div className="bk-toolbar-stats">
            {STAT_ITEMS.map(item => (
              <span key={item.key} className="bk-stat-pill">
                <span className="bk-stat-pill-value">{stats[item.key]}</span>
                <span className="bk-stat-pill-label">{item.label}</span>
              </span>
            ))}
          </div>

          <div className="bk-date-nav">
            <button className="bk-date-nav-btn" onClick={() => shiftDay(-1)} title="Ngày trước">‹</button>
            <button className="bk-date-display" onClick={openDatePicker} title="Chọn ngày">
              {displayDate} 📅
            </button>
            <input ref={dateInputRef} type="date" className="bk-date-hidden"
              value={filterDate} onChange={handleDateChange} />
            <button className="bk-date-nav-btn" onClick={() => shiftDay(1)} title="Ngày sau">›</button>
          </div>

        </div>
      </div>
    </div>
  )
}
