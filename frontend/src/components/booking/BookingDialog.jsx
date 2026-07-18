import React, { useState, useEffect } from 'react'
import { today } from '../../utils/timeUtils'
import { validateBookingForm, getResourceIcon } from '../../utils/bookingUtils'

export default function BookingDialog({
  isOpen, onClose, onSubmit, resources, employee,
  initialDate, initialResourceId,
}) {
  const [resourceId, setResourceId] = useState('')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(initialDate || today())
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('09:00')
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    if (isOpen) {
      setResourceId(initialResourceId || (resources.length > 0 ? String(resources[0].id) : ''))
      setDate(initialDate || today())
      setStartTime('08:00')
      setEndTime('09:00')
      setTitle('')
      setNotes('')
      setFormError('')
      setSuccessMsg('')
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

  if (!isOpen) return null

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
            <input
              type="date"
              className="bk-input"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
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
            disabled={sending}
          >
            {sending ? '⏳ Đang xử lý...' : '📤 Đặt lịch'}
          </button>
        </form>
      </div>
    </div>
  )
}
