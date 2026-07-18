import React, { useEffect, useRef } from 'react'
import { isExpired, isUpcoming } from '../../utils/bookingUtils'

export default function BookingContextMenu({ booking, position, onClose, onEdit, onFinish, onDelete }) {
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose()
      }
    }
    function handleEsc(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [onClose])

  if (!booking) return null

  const expired = isExpired(booking)
  const upcoming = isUpcoming(booking)

  return (
    <div
      ref={ref}
      className="bk-context-menu"
      style={{ left: position.x, top: position.y }}
    >
      {booking.status === 'active' && !expired && (
        <button className="bk-context-item" onClick={() => { onEdit(booking); onClose() }}>
          ✏️ Chỉnh sửa
        </button>
      )}
      {booking.status === 'active' && !expired && !upcoming && (
        <button className="bk-context-item" onClick={() => { onFinish(booking.id); onClose() }}>
          ✅ Kết thúc
        </button>
      )}
      <div className="bk-context-separator" />
      <button className="bk-context-item">
        📋 Xem chi tiết
      </button>
      <div className="bk-context-separator" />
      <button className="bk-context-item danger" onClick={() => { onDelete(booking); onClose() }}>
        🗑️ Hủy đặt lịch
      </button>
    </div>
  )
}
