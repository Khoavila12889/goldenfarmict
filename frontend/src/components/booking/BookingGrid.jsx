import React, { useCallback, useRef, useMemo, useState, useEffect } from 'react'
import {
  timeSlots, START_HOUR, SLOT_HEIGHT, TOTAL_SLOTS,
  TIME_WIDTH, COL_WIDTH, slotIndex, timeToMinutes, minutesToTime,
} from '../../utils/timeUtils'
import { resourceColor } from '../../utils/bookingUtils'
import BookingBlock from './BookingBlock'
import BookingCurrentTime from './BookingCurrentTime'
import BookingTooltip from './BookingTooltip'
import { updateBooking } from '../../services/api'

export default function BookingGrid({
  resources, bookings, filteredResources, filterDate,
  selectedBooking, currentTimeMinutes, onSelect,
  onContextMenu, refresh,
  hiddenResources, visibleResources, onToggleResource,
}) {
  const gridRef = useRef(null)
  const headerRef = useRef(null)
  const slots = useMemo(() => timeSlots(), [])
  const [tooltip, setTooltip] = useState(null)
  const [dragOverCell, setDragOverCell] = useState(null)
  const [colWidth, setColWidth] = useState(COL_WIDTH)
  const [hoveredCol, setHoveredCol] = useState(null)
  const autoScrolled = useRef(false)

  const isToday = filterDate === new Date().toISOString().slice(0, 10)

  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const firstCol = header.querySelector('.bk-resource-header')
    if (!firstCol) return
    const measure = () => setColWidth(firstCol.offsetWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    return () => observer.disconnect()
  }, [filteredResources.length])

  useEffect(() => {
    if (autoScrolled.current || !gridRef.current || currentTimeMinutes < 0) return
    const top = (currentTimeMinutes / 30) * SLOT_HEIGHT - gridRef.current.offsetHeight / 3
    gridRef.current.scrollTop = Math.max(0, top)
    autoScrolled.current = true
  }, [currentTimeMinutes])

  const clearTooltip = useCallback(() => setTooltip(null), [])

  const handleSlotClick = useCallback((resourceId, slotTime) => {
    setTooltip(null)
  }, [])

  const handleBlockHover = useCallback((booking, e) => {
    setTooltip({ booking, position: { x: e.clientX, y: e.clientY } })
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDragEnter = useCallback((e, ri, si) => {
    e.preventDefault()
    setDragOverCell({ ri, si })
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverCell(null)
  }, [])

  const handleDrop = useCallback(async (e, targetResourceId, slotTime) => {
    e.preventDefault()
    setDragOverCell(null)
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      const bookingId = data.id
      const originalBooking = bookings.find(b => b.id === bookingId)
      if (!originalBooking) return

      const duration = timeToMinutes(originalBooking.end_time) - timeToMinutes(originalBooking.start_time)
      const newStart = slotTime
      const newEndMinutes = timeToMinutes(newStart) + duration
      const newEnd = minutesToTime(newEndMinutes)

      if (originalBooking.resource_id !== targetResourceId || originalBooking.start_time !== newStart) {
        await updateBooking(bookingId, {
          resource_id: targetResourceId,
          start_time: newStart,
          end_time: newEnd,
          book_date: filterDate,
        })
        refresh()
      }
    } catch {
      // silently fail
    }
  }, [bookings, filterDate, refresh])

  const handleResizeEnd = useCallback(async (booking, newEndTime) => {
    try {
      await updateBooking(booking.id, {
        end_time: newEndTime,
        book_date: filterDate,
      })
      refresh()
    } catch {
      // silently fail
    }
  }, [filterDate, refresh])

  useEffect(() => {
    if (!gridRef.current) return
    const el = gridRef.current
    function onScroll() {
      if (tooltip) setTooltip(null)
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [tooltip])

  if (!filteredResources.length) {
    return (
      <div className="bk-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--bk-text-muted)' }}>
        Không có tài nguyên nào.
      </div>
    )
  }

  const allHidden = filteredResources.every(r => hiddenResources.has(r.id))

  return (
    <div className="bk-grid-wrapper" ref={gridRef}>
      <div style={{ position: 'relative', width: '100%', minWidth: TIME_WIDTH + filteredResources.length * 120, minHeight: TOTAL_SLOTS * SLOT_HEIGHT + 40 }}>
        <div className="bk-grid-header" ref={headerRef}>
          <div className="bk-time-header">Giờ</div>
          {filteredResources.map((r, i) => (
            <div
              key={r.id}
              className={`bk-resource-header${hiddenResources.has(r.id) ? ' hidden' : ''}${i % 2 === 0 ? ' bk-col-even' : ' bk-col-odd'}${hoveredCol === i ? ' bk-col-hovered' : ''}`}
              onClick={() => onToggleResource(r.id)}
              onMouseEnter={() => setHoveredCol(i)}
              onMouseLeave={() => setHoveredCol(null)}
              style={{ cursor: 'pointer' }}
              title={hiddenResources.has(r.id) ? 'Nhấn để hiện' : 'Nhấn để ẩn'}
            >
              <span className="bk-resource-dot" style={{ background: resourceColor(i) }} />
              {r.type === 'car' ? '🚗 ' : '🏢 '}{r.name}
            </div>
          ))}
        </div>

        <div className="bk-grid-body">
          {slots.map((slot, si) => {
            const slotMin = timeToMinutes(slot)
            const isPast = isToday && currentTimeMinutes >= 0 && slotMin + 30 <= currentTimeMinutes
            return (
            <div
              key={slot}
              className={`bk-row ${si % 2 === 0 ? 'bk-row-even' : 'bk-row-odd'}${isPast ? ' bk-row-past' : ''}`}
            >
              <div className="bk-time-cell">
                {si % 2 === 0 ? slot : ''}
              </div>
              {filteredResources.map((r, ri) => {
                const isHidden = hiddenResources.has(r.id)
                return (
                  <div
                    key={r.id}
                    className={`bk-slot-cell${ri % 2 === 0 ? ' bk-col-even' : ' bk-col-odd'}${hoveredCol === ri ? ' bk-col-hovered' : ''}${dragOverCell && dragOverCell.ri === ri && dragOverCell.si === si ? ' drag-over' : ''}${isHidden ? ' bk-slot-hidden' : ''}`}
                    onClick={() => !isHidden && handleSlotClick(r.id, slot)}
                    onDragOver={!isHidden ? handleDragOver : undefined}
                    onDragEnter={!isHidden ? (e) => handleDragEnter(e, ri, [si, ri]) : undefined}
                    onDragLeave={!isHidden ? handleDragLeave : undefined}
                    onDrop={!isHidden ? (e) => handleDrop(e, r.id, slot) : undefined}
                  />
                )
              })}
            </div>
            )
          })}

          {bookings.filter(b => filteredResources.some(r => r.id === b.resource_id) && !hiddenResources.has(b.resource_id)).map(b => {
            const ri = filteredResources.findIndex(r => r.id === b.resource_id)
            if (ri < 0) return null
            return (
              <BookingBlock
                key={b.id}
                booking={b}
                resourceIndex={ri}
                colWidth={colWidth}
                resources={filteredResources}
                bookings={bookings}
                selected={selectedBooking?.id === b.id}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
                onResizeEnd={handleResizeEnd}
                onDragEnd={() => {}}
                filterDate={filterDate}
                loadBookings={refresh}
              />
            )
          })}

          <BookingCurrentTime minutes={currentTimeMinutes} isToday={isToday} />

          {allHidden && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bk-surface)', opacity: 0.85, zIndex: 5, borderRadius: '0 0 var(--bk-radius) var(--bk-radius)',
            }}>
              <div style={{ textAlign: 'center', color: 'var(--bk-text-muted)', fontSize: '0.9rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👁️</div>
                <div>Tất cả tài nguyên đang bị ẩn.</div>
                <div style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>Nhấn vào tên tài nguyên trên header để hiện lại.</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {tooltip && (
        <BookingTooltip
          booking={tooltip.booking}
          position={tooltip.position}
        />
      )}
    </div>
  )
}
