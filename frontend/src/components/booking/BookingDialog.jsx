import React, { useState, useEffect } from 'react'
import { today } from '../../utils/timeUtils'
import { validateBookingForm, getResourceIcon } from '../../utils/bookingUtils'
import { formatDate } from '../../utils/date'
import DateSelector from './DateSelector'
import { checkOverlap, getBookings } from '../../services/api'

export default function BookingDialog({
  isOpen, onClose, onSubmit, resources, employee,
  initialDate, initialResourceId,
}) {
  const [resourceId, setResourceId] = useState('')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(initialDate || today())
  const [dateDisplay, setDateDisplay] = useState('')
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('09:00')
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [conflicts, setConflicts] = useState([])
  const [busySlots, setBusySlots] = useState([])

  useEffect(() => {
    if (isOpen) {
      const d = initialDate || today()
      setResourceId(initialResourceId || (resources.length > 0 ? String(resources[0].id) : ''))
      setDate(d)
      setDateDisplay(formatDate(d))
      setStartTime('08:00')
      setEndTime('09:00')
      setTitle('')
      setNotes('')
      setFormError('')
      setSuccessMsg('')
      setConflicts([])
      setBusySlots([])
      setSending(false)
    }
  }, [isOpen, initialDate, initialResourceId, resources])

  useEffect(() => {
    function handleEsc(e) {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  // Kiểm tra trùng giờ trực tiếp khi người dùng chọn tài nguyên/ngày/giờ,
  // đồng thời tải các khung giờ đã đặt trong ngày để tránh đặt trùng.
  useEffect(() => {
    if (!isOpen || !resourceId || !date || !startTime || !endTime) return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const [ov, day] = await Promise.all([
          checkOverlap(parseInt(resourceId), date, startTime, endTime),
          getBookings(date, 'all', 'active'),
        ])
        if (cancelled) return
        setConflicts(ov.data?.conflicts || [])
        const all = day.data?.data || []
        setBusySlots(all.filter(b => String(b.resource_id) === String(resourceId)))
      } catch {
        if (!cancelled) { setConflicts([]); setBusySlots([]) }
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [isOpen, resourceId, date, startTime, endTime])

  if (!isOpen) return null

  function parseDateInput(val) {
    const parts = val.split('/')
    if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`
    }
    return null
  }

  function handleDateChange(val) {
    setDateDisplay(val)
    const parsed = parseDateInput(val)
    if (parsed) setDate(parsed)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errors = validateBookingForm({
      resource_id: resourceId, title, date,
      startTime, endTime,
    })
    if (errors.length) {
      setFormError(errors.join('. '))
      return
    }
    setFormError('')
    setSending(true)
    try {
      const result = await onSubmit({
        resource_id: parseInt(resourceId),
        title: title.trim(),
        employee_id: employee?.id || null,
        full_name: employee?.full_name || 'Khách',
        department: employee?.department || '',
        book_date: date,
        start_time: startTime,
        end_time: endTime,
        notes: notes.trim(),
      })
      if (result.success) {
        setSuccessMsg('✅ Đặt lịch thành công!')
        setTimeout(() => {
          setSuccessMsg('')
          onClose()
        }, 1200)
      } else {
        setFormError(result.error || 'Đã xảy ra lỗi.')
      }
    } catch {
      setFormError('Lỗi kết nối máy chủ.')
    } finally {
      setSending(false)
    }
  }

  const selectedResource = resources.find(r => String(r.id) === resourceId)

  return (
    <div className="bk-dialog-overlay" onClick={onClose}>
      <div className="bk-dialog" onClick={e => e.stopPropagation()}>
        <div className="bk-dialog-header">
          <div className="bk-dialog-title">📝 Đặt lịch mới</div>
          <button className="bk-dialog-close" onClick={onClose}>✕</button>
        </div>

        {successMsg && <div className="bk-msg bk-msg-success">{successMsg}</div>}
        {formError && <div className="bk-msg bk-msg-error">{formError}</div>}
        {conflicts.length > 0 && (
          <div className="bk-msg bk-msg-error">
            ⛔ Trùng giờ với lịch của {conflicts[0].full_name} ({conflicts[0].start_time}–{conflicts[0].end_time}). Vui lòng chọn khung giờ khác.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {employee && (
            <div className="bk-form-group" style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              padding: '0.5rem 0.75rem', background: '#f8fafc',
              borderRadius: 10, marginBottom: '0.75rem',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: '#00468C', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.85rem', fontWeight: 700, flexShrink: 0,
              }}>
                {(employee.full_name || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--bk-text)' }}>
                  {employee.full_name || 'Khách'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--bk-text-secondary)' }}>
                  {employee.department || ''}
                </div>
              </div>
            </div>
          )}

          <div className="bk-form-group">
            <label className="bk-form-label">Tài nguyên</label>
            <select
              className="bk-select"
              value={resourceId}
              onChange={e => setResourceId(e.target.value)}
            >
              {resources.map(r => (
                <option key={r.id} value={r.id}>
                  {getResourceIcon(r.type)} {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="bk-form-group">
            <label className="bk-form-label">Mục đích *</label>
            <input
              type="text"
              className="bk-input"
              placeholder="Nhập mục đích sử dụng..."
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="bk-form-group">
            <label className="bk-form-label">Ngày</label>
            <DateSelector value={date} onChange={setDate} />
          </div>

          <div className="bk-form-group">
            <label className="bk-form-label">Giờ</label>
            <div className="bk-form-row">
              <input
                type="time"
                className="bk-input"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
              />
              <input
                type="time"
                className="bk-input"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {busySlots.length > 0 && (
            <div className="bk-form-group">
              <label className="bk-form-label">Khung giờ đã có người đặt ngày này</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {busySlots.map(b => (
                  <span key={b.id} style={{
                    background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5',
                    borderRadius: 999, padding: '0.15rem 0.6rem', fontSize: '0.78rem', fontWeight: 600,
                  }}>
                    {b.start_time}–{b.end_time} · {b.full_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="bk-form-group">
            <label className="bk-form-label">Ghi chú</label>
            <textarea
              className="bk-input bk-form-textarea"
              placeholder="Ghi chú thêm..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <button
            type="submit"
            className="bk-submit-btn"
            disabled={sending || conflicts.length > 0}
          >
            {sending ? '⏳ Đang xử lý...' : conflicts.length > 0 ? '⛔ Khung giờ đã có người đặt' : '📤 Đặt lịch'}
          </button>
        </form>
      </div>
    </div>
  )
}
