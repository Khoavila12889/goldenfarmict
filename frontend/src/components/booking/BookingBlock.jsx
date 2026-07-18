import React, { useCallback, useRef, useState } from 'react'
import { COL_WIDTH, TIME_WIDTH, gridPos, SLOT_HEIGHT, timeToMinutes, minutesToTime } from '../../utils/timeUtils'
import { resourceColor, isExpired, isUpcoming } from '../../utils/bookingUtils'

export default function BookingBlock({
  booking, resourceIndex, colWidth, resources, bookings,
  selected, onSelect, onContextMenu, onResizeEnd, onDragEnd,
  filterDate, loadBookings,
}) {
  const pos = gridPos(booking.start_time, booking.end_time)
  const color = resourceColor(resourceIndex)
  const expired = isExpired(booking)
  const upcoming = isUpcoming(booking)
  const isFinished = booking.status === 'finished'
  const blockRef = useRef(null)
  const resizeRef = useRef(null)
  const [resizing, setResizing] = useState(false)

  const statusClass = isFinished ? 'finished' : expired ? 'expired' : upcoming ? 'upcoming' : 'active'

  const handleDragStart = useCallback((e) => {
    if (expired || isFinished || upcoming) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('application/json', JSON.stringify({
      id: booking.id,
      resource_id: booking.resource_id,
      originalStart: booking.start_time,
      originalEnd: booking.end_time,
    }))
    e.dataTransfer.effectAllowed = 'move'
  }, [booking, expired, isFinished, upcoming])

  const handleResizeMouseDown = useCallback((e) => {
    e.stopPropagation()
    e.preventDefault()
    if (expired || isFinished || upcoming) return

    const blockEl = blockRef.current
    if (!blockEl) return
    const startY = e.clientY
    const startHeight = pos.height
    let currentEndTime = booking.end_time

    function onMouseMove(ev) {
      const deltaY = ev.clientY - startY
      const slotsDelta = Math.round(deltaY / SLOT_HEIGHT)
      const newSlots = Math.max(0.5, (pos.height / SLOT_HEIGHT) + slotsDelta)
      const newHeight = newSlots * SLOT_HEIGHT
      const startMin = timeToMinutes(booking.start_time)
      const newEndMin = startMin + newSlots * 30
      currentEndTime = minutesToTime(newEndMin)
      if (blockEl) {
        blockEl.style.height = `${newHeight}px`
      }
      setResizing(true)
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      setResizing(false)
      if (blockEl) blockEl.style.height = ''
      if (currentEndTime !== booking.end_time) {
        onResizeEnd(booking, currentEndTime)
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [booking, pos.height, expired, isFinished, onResizeEnd])

  const handleClick = useCallback((e) => {
    if (resizing) return
    onSelect(booking)
  }, [booking, onSelect, resizing])

  const handleContext = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    onContextMenu(booking, e.clientX, e.clientY)
  }, [booking, onContextMenu])

  const cw = colWidth || COL_WIDTH
  const left = TIME_WIDTH + resourceIndex * cw + 2
  const width = cw - 4
  const showSub = pos.height >= SLOT_HEIGHT * 1.5
  const showTime = pos.height >= SLOT_HEIGHT * 2.5

  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  const blockBg = expired ? '#f1f5f9' : hexToRgba(color, 0.12)
  const blockBorder = expired ? '#cbd5e1' : color
  const blockColor = expired ? '#94a3b8' : ''

  return (
    <div
      ref={blockRef}
      className={`bk-block ${statusClass}${selected ? ' selected' : ''}`}
      style={{
        top: pos.top,
        height: pos.height,
        left,
        width,
        '--block-color': blockBorder,
        background: blockBg,
        color: blockColor || undefined,
      }}
      draggable={!expired && !isFinished && !upcoming}
      onDragStart={handleDragStart}
      onClick={handleClick}
      onContextMenu={handleContext}
    >
      <div className={`bk-block-title${expired ? ' expired-title' : ''}`}>
        {booking.title}
      </div>
      {showSub && (
        <div className="bk-block-sub" style={{ color: expired ? '#cbd5e1' : 'var(--bk-text-secondary)' }}>
          {booking.full_name}
          {showTime ? ` · ${booking.start_time}→${booking.end_time}` : ''}
        </div>
      )}
      {!expired && !isFinished && !upcoming && (
        <div
          ref={resizeRef}
          className="bk-resize-handle"
          onMouseDown={handleResizeMouseDown}
        />
      )}
    </div>
  )
}