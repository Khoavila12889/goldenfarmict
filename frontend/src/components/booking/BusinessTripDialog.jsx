import React, { useState, useEffect } from 'react'

export default function BusinessTripDialog({ isOpen, onClose, onSubmit, employee, initialData }) {
  const [destination, setDestination] = useState('')
  const [purpose, setPurpose] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setDestination(initialData.destination || '')
        setPurpose(initialData.purpose || '')
        setStartDate(initialData.start_date || '')
        setEndDate(initialData.end_date || '')
        setNotes(initialData.notes || '')
      } else {
        setDestination('')
        setPurpose('')
        setStartDate('')
        setEndDate('')
        setNotes('')
      }
      setError('')
      setSubmitting(false)
    }
  }, [isOpen, initialData])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!destination.trim()) { setError('Vui lòng nhập nơi đến.'); return }
    if (!purpose.trim()) { setError('Vui lòng nhập mục đích.'); return }
    if (!startDate) { setError('Vui lòng chọn ngày bắt đầu.'); return }
    if (!endDate) { setError('Vui lòng chọn ngày kết thúc.'); return }
    if (endDate < startDate) { setError('Ngày kết thúc phải sau ngày bắt đầu.'); return }

    setSubmitting(true)
    try {
      const data = {
        employee_code: employee?.employee_code || sessionStorage.getItem('user_code') || '',
        full_name: employee?.full_name || '',
        department: employee?.department || '',
        destination: destination.trim(),
        purpose: purpose.trim(),
        start_date: startDate,
        end_date: endDate,
        notes: notes.trim(),
      }
      const result = await onSubmit(data, initialData?.id)
      if (result?.error) {
        setError(result.error)
        setSubmitting(false)
      } else {
        onClose()
      }
    } catch {
      setError('Lỗi kết nối')
      setSubmitting(false)
    }
  }

  return (
    <div className="bk-dialog-overlay" onClick={onClose}>
      <div className="bk-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="bk-dialog-header">
          <div className="bk-dialog-title">
            {initialData ? '✏️ Sửa lịch công tác' : '➕ Đăng ký công tác'}
          </div>
          <button className="bk-dialog-close" onClick={onClose}>✕</button>
        </div>

        {error && <div className="bk-msg bk-msg-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="bk-form-group">
            <label className="bk-form-label">Nơi đến *</label>
            <input className="bk-input" type="text" placeholder="VD: Hà Nội, Đà Nẵng..."
              value={destination} onChange={e => setDestination(e.target.value)} />
          </div>

          <div className="bk-form-group">
            <label className="bk-form-label">Mục đích *</label>
            <input className="bk-input" type="text" placeholder="VD: Họp đối tác, Công tác khách hàng..."
              value={purpose} onChange={e => setPurpose(e.target.value)} />
          </div>

          <div className="bk-form-row">
            <div className="bk-form-group">
              <label className="bk-form-label">Ngày đi *</label>
              <input className="bk-input" type="date"
                value={startDate} onChange={e => {
                  setStartDate(e.target.value)
                  if (endDate && e.target.value > endDate) setEndDate(e.target.value)
                }} />
            </div>
            <div className="bk-form-group">
              <label className="bk-form-label">Ngày về *</label>
              <input className="bk-input" type="date"
                value={endDate} onChange={e => setEndDate(e.target.value)}
                min={startDate} />
            </div>
          </div>

          <div className="bk-form-group">
            <label className="bk-form-label">Ghi chú</label>
            <textarea className="bk-input bk-form-textarea" placeholder="Thông tin thêm..."
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <button className="bk-submit-btn" type="submit" disabled={submitting}>
            {submitting ? 'Đang xử lý...' : initialData ? '💾 Cập nhật' : '📋 Đăng ký'}
          </button>
        </form>
      </div>
    </div>
  )
}
