import React from 'react'
import BookingFilter from './BookingFilter'

export default function BookingDrawer({
  isOpen, onClose, filterDate, filterType, filterStatus,
  dateSet, onFilterChange,
}) {
  return (
    <>
      <div
        className={`bk-drawer-overlay${isOpen ? ' open' : ''}`}
        onClick={onClose}
      />
      <div className={`bk-drawer${isOpen ? ' open' : ''}`}>
        <div className="bk-drawer-header">
          <div className="bk-drawer-title">🔍 Bộ lọc</div>
          <button className="bk-drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="bk-drawer-body">
          <BookingFilter
            filterDate={filterDate}
            filterType={filterType}
            filterStatus={filterStatus}
            dateSet={dateSet}
            onFilterChange={(...args) => {
              onFilterChange(...args)
              onClose()
            }}
          />
        </div>
      </div>
    </>
  )
}
