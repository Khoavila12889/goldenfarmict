import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { getBusinessTrips, createBusinessTrip, updateBusinessTrip, deleteBusinessTrip } from '../../services/api'
import BusinessTripDialog from './BusinessTripDialog'
import BusinessTripGrid from './BusinessTripGrid'
import { formatDateDDMM } from '../../utils/bookingUtils'

function addMonths(date, n) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

function monthStart(date) {
  const d = new Date(date)
  d.setDate(1)
  return d
}

function monthEnd(date) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + 1)
  d.setDate(0)
  return d
}

const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

export default function BusinessTripPanel({ employee, openDialog }) {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTrip, setEditTrip] = useState(null)
  const [detailTrip, setDetailTrip] = useState(null)
  const [filter, setFilter] = useState('')
  const [msg, setMsg] = useState('')
  const [viewDate, setViewDate] = useState(new Date())

  useEffect(() => {
    if (openDialog > 0) {
      setEditTrip(null)
      setDialogOpen(true)
    }
  }, [openDialog])

  const userCode = employee?.employee_code || sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || 'user'
  const userDept = employee?.department || sessionStorage.getItem('user_department') || ''

  const dateRange = useMemo(() => {
    const s = monthStart(viewDate)
    const e = monthEnd(viewDate)
    return {
      start: s.toISOString().slice(0, 10),
      end: e.toISOString().slice(0, 10),
    }
  }, [viewDate])

  const loadTrips = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        date_from: dateRange.start,
        date_to: dateRange.end,
      }
      if (filter === 'mine') params.employee_code = userCode
      const res = await getBusinessTrips(params)
      setTrips(res.data?.data || [])
    } catch { setTrips([]) }
    setLoading(false)
  }, [filter, userCode, dateRange])

  useEffect(() => { loadTrips() }, [loadTrips])

  const startDate = useMemo(() => monthStart(viewDate), [viewDate])
  const endDate = useMemo(() => monthEnd(viewDate), [viewDate])

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const active = trips.filter(t => t.status === 'active' && t.start_date <= today && today <= t.end_date)
    const upcoming = trips.filter(t => t.status === 'active' && t.start_date > today)
    const finished = trips.filter(t => t.status === 'finished')
    const cancelled = trips.filter(t => t.status === 'cancelled')
    return {
      total: trips.length,
      active: active.length,
      upcoming: upcoming.length,
      finished: finished.length,
      cancelled: cancelled.length,
    }
  }, [trips])

  const handleSubmit = async (data, editId) => {
    try {
      if (editId) {
        await updateBusinessTrip(editId, data)
        setMsg('✅ Cập nhật thành công')
      } else {
        await createBusinessTrip(data)
        setMsg('✅ Đăng ký thành công')
      }
      await loadTrips()
      setTimeout(() => setMsg(''), 3000)
      return { success: true }
    } catch (err) {
      return { error: err?.response?.data?.error || 'Lỗi kết nối' }
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Hủy lịch công tác này?')) return
    try {
      await deleteBusinessTrip(id)
      setDetailTrip(null)
      setMsg('✅ Đã hủy')
      await loadTrips()
      setTimeout(() => setMsg(''), 3000)
    } catch (err) { 
      const errMsg = err?.response?.data?.detail || 'Lỗi kết nối'
      setMsg(`❌ ${errMsg}`)
      setTimeout(() => setMsg(''), 3000)
    }
  }

  const handleFinish = async (id) => {
    try {
      await updateBusinessTrip(id, { status: 'finished' })
      setDetailTrip(null)
      await loadTrips()
    } catch (err) {
      const errMsg = err?.response?.data?.detail || 'Lỗi kết nối'
      setMsg(`❌ ${errMsg}`)
      setTimeout(() => setMsg(''), 3000)
    }
  }

  const handleTripClick = useCallback((trip) => {
    setDetailTrip(trip)
  }, [])

  const openEdit = (trip) => {
    setEditTrip(trip)
    setDialogOpen(true)
  }

  const STATUS_MAP = {
    active: { label: 'Đang công tác', color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
    finished: { label: 'Đã kết thúc', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
    cancelled: { label: 'Đã hủy', color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
  }

  const STAT_ITEMS = [
    { key: 'total', label: 'Tổng số', icon: '📋' },
    { key: 'active', label: 'Đang công tác', icon: '🟢' },
    { key: 'upcoming', label: 'Sắp diễn ra', icon: '🟡' },
    { key: 'finished', label: 'Đã kết thúc', icon: '✅' },
    { key: 'cancelled', label: 'Đã hủy', icon: '❌' },
  ]

  return (
    <div className="bt-container">
      {msg && <div className="bk-msg bk-msg-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

      {/* Toolbar — matching BookingToolbar structure exactly */}
      <div className="bk-toolbar-root">
        <div className="bk-toolbar-row">
          <div className="bk-toolbar-left">
            <button className="bk-btn bk-btn-primary" onClick={() => { setEditTrip(null); setDialogOpen(true) }}>
              + Đăng ký công tác
            </button>
            <button className={`bk-btn ${filter === '' ? 'bk-btn-active' : ''}`}
              onClick={() => setFilter('')}>Tất cả</button>
            <button className={`bk-btn ${filter === 'mine' ? 'bk-btn-active' : ''}`}
              onClick={() => setFilter('mine')}>Của tôi</button>
          </div>
          <div className="bk-toolbar-right">
            <div className="bk-toolbar-stats">
              {STAT_ITEMS.map(item => (
                <span key={item.key} className="bk-stat-pill">
                  <span>{item.icon}</span>
                  <span className="bk-stat-pill-value">{stats[item.key]}</span>
                  <span className="bk-stat-pill-label">{item.label}</span>
                </span>
              ))}
            </div>
            <div className="bk-date-nav">
              <button className="bk-date-nav-btn" onClick={() => setViewDate(v => addMonths(v, -1))}>‹</button>
              <span className="bk-date-display" style={{ cursor: 'default' }}>
                Tháng {viewDate.getMonth() + 1}, {viewDate.getFullYear()}
              </span>
              <button className="bk-date-nav-btn" onClick={() => setViewDate(v => addMonths(v, 1))}>›</button>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="bt-loading">Đang tải...</div>
      ) : (
        <BusinessTripGrid
          trips={trips}
          startDate={startDate}
          endDate={endDate}
          onTripClick={handleTripClick}
          employee={employee}
        />
      )}

      {/* Detail panel */}
      {detailTrip && (
        <div className="bt-detail" onClick={() => setDetailTrip(null)}>
          <div className="bt-detail-card" onClick={e => e.stopPropagation()}>
            <div className="bt-detail-header">
              <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>📍 {detailTrip.destination}</span>
              <button className="bk-dialog-close" onClick={() => setDetailTrip(null)}>✕</button>
            </div>

            <div className="bt-detail-body">
              <div className="bt-detail-row">
                <span className="bt-detail-label">Mục đích</span>
                <span className="bt-detail-value">📋 {detailTrip.purpose}</span>
              </div>
              <div className="bt-detail-row">
                <span className="bt-detail-label">Thời gian</span>
                <span className="bt-detail-value">📅 {formatDateDDMM(detailTrip.start_date)} → {formatDateDDMM(detailTrip.end_date)}</span>
              </div>
              <div className="bt-detail-row">
                <span className="bt-detail-label">Số ngày</span>
                <span className="bt-detail-value">
                  {Math.ceil((new Date(detailTrip.end_date) - new Date(detailTrip.start_date)) / 86400000) + 1} ngày
                </span>
              </div>
              <div className="bt-detail-row">
                <span className="bt-detail-label">Nhân viên</span>
                <span className="bt-detail-value">👤 {detailTrip.full_name} ({detailTrip.department})</span>
              </div>
              {detailTrip.status === 'finished' && detailTrip.completed_at && (() => {
                const expected = new Date(detailTrip.end_date)
                const actual = new Date(detailTrip.completed_at.slice(0, 10))
                const diffDays = Math.round((actual - expected) / 86400000)
                const deltaText = diffDays < 0
                  ? `✓ về sớm ${Math.abs(diffDays)} ngày`
                  : diffDays > 0
                    ? `✗ trễ ${diffDays} ngày`
                    : '✓ đúng hạn'
                return (
                  <div className="bt-detail-row">
                    <span className="bt-detail-label">Hoàn thành</span>
                    <span className="bt-detail-value" style={{ fontSize: '0.82rem', color: 'var(--bk-text-muted)' }}>
                      {deltaText}
                    </span>
                  </div>
                )
              })()}

              <div className="bt-detail-row">
                <span className="bt-detail-label">Trạng thái</span>
                <span className="bt-detail-value">
                  <span className="bt-card-badge" style={{
                    background: (STATUS_MAP[detailTrip.status] || STATUS_MAP.active).bg,
                    color: (STATUS_MAP[detailTrip.status] || STATUS_MAP.active).color,
                  }}>
                    {(STATUS_MAP[detailTrip.status] || STATUS_MAP.active).label}
                  </span>
                </span>
              </div>
              {detailTrip.notes && (
                <div className="bt-detail-row">
                  <span className="bt-detail-label">Ghi chú</span>
                  <span className="bt-detail-value">📎 {detailTrip.notes}</span>
                </div>
              )}
            </div>

            <div className="bt-detail-actions">
              {detailTrip.status === 'active' && (
                <>
                  {/* Chỉ người tạo hoặc admin được phép thao tác */}
                  {(userRole === 'admin' || detailTrip.employee_code === userCode) && (
                    <>
                      <button className="bk-btn bk-btn-sm" onClick={() => openEdit(detailTrip)}>✏️ Sửa</button>
                      <button className="bk-btn bk-btn-sm" onClick={() => handleFinish(detailTrip.id)}>✅ Kết thúc</button>
                      <button className="bk-btn bk-btn-sm" onClick={() => handleDelete(detailTrip.id)}
                        style={{ color: 'var(--bk-danger)' }}>🗑️ Hủy</button>
                    </>
                  )}
                  {userRole !== 'admin' && detailTrip.employee_code !== userCode && (
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>
                      Chỉ người đăng ký mới có thể thao tác
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <BusinessTripDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
        employee={employee}
        initialData={editTrip}
      />
    </div>
  )
}
