import React, { useState, useEffect, useCallback } from 'react'
import { CalendarOff, Plus, RefreshCw } from 'lucide-react'
import { listApprovalRequests, getEmployeeByCode } from '../services/api'
import LeaveRequestDialog from '../components/booking/LeaveRequestDialog'
import { formatDate } from '../utils/date'

const STATUS_STYLE = {
  draft: { label: 'Nháp', color: '#6b7280', bg: '#f3f4f6', dot: '#9ca3af' },
  pending: { label: '⏳ Chờ duyệt', color: '#d97706', bg: '#fef3c7', dot: '#f59e0b' },
  in_progress: { label: '⚙️ Đang duyệt', color: '#2563eb', bg: '#dbeafe', dot: '#3b82f6' },
  approved: { label: '✅ Đã duyệt', color: '#16a34a', bg: '#dcfce7', dot: '#22c55e' },
  rejected: { label: '❌ Bị từ chối', color: '#dc2626', bg: '#fee2e2', dot: '#ef4444' },
  cancelled: { label: '🕓 Đã hủy', color: '#6b7280', bg: '#f3f4f6', dot: '#9ca3af' },
}

function metaOf(r) {
  if (!r) return {}
  if (r.metadata_json && typeof r.metadata_json === 'string') {
    try { return JSON.parse(r.metadata_json) } catch (_) { return {} }
  }
  return r.metadata || {}
}

export default function NghiPhep() {
  const userCode = sessionStorage.getItem('user_code') || ''
  const [employee, setEmployee] = useState(null)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listApprovalRequests({ requester: userCode })
      const list = res.data?.data || []
      setRequests(list.filter(r => metaOf(r).kind === 'leave'))
    } catch { setRequests([]) }
    setLoading(false)
  }, [userCode])

  useEffect(() => {
    getEmployeeByCode(userCode)
      .then(r => r.data && setEmployee(r.data))
      .catch(() => {})
    load()
  }, [userCode, load])

  function showMsg(text) {
    setMsg(text)
    setTimeout(() => setMsg(''), 3000)
  }

  const statusCount = (s) => requests.filter(r => r.status === s).length

  return (
    <div style={pageStyle}>
      <style>{`
        .np-card { background:#fff; border:1px solid #e6edf5; border-radius:12px; padding:1rem; }
        @keyframes npIn { from {opacity:0; transform: translateY(6px);} to {opacity:1; transform: translateY(0);} }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🏖️ Nghỉ phép / Việc
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0.25rem 0 0' }}>
            {employee ? `${employee.full_name} (${employee.department})` : ''} — theo dõi & đăng ký nghỉ phép
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={load} style={ghostBtnStyle}><RefreshCw size={15} /> Làm mới</button>
          <button onClick={() => setDialogOpen(true)} style={primaryBtnStyle}><Plus size={16} /> Đăng ký nghỉ phép</button>
        </div>
      </div>

      {msg && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', borderRadius: 8, padding: '0.6rem 0.9rem', fontSize: '0.82rem', marginBottom: '1rem' }}>{msg}</div>}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Tổng đơn', v: requests.length, c: '#0f172a' },
          { label: 'Chờ duyệt', v: statusCount('pending') + statusCount('in_progress'), c: '#d97706' },
          { label: 'Đã duyệt', v: statusCount('approved'), c: '#16a34a' },
          { label: 'Bị từ chối', v: statusCount('rejected'), c: '#dc2626' },
        ].map(s => (
          <div key={s.label} className="np-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* List */}
      <div className="np-card" style={Object.assign({}, { padding: 0, overflow: 'hidden' })}>
        <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid #e6edf5', fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
          📋 Danh sách đơn nghỉ phép của tôi
        </div>
        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Đang tải...</div>
        ) : requests.length === 0 ? (
          <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
            Bạn chưa có đơn nghỉ phép nào.
          </div>
        ) : (
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            {requests.map(r => {
              const m = metaOf(r)
              const st = STATUS_STYLE[r.status] || STATUS_STYLE.draft
              return (
                <div key={r.id} style={{ borderBottom: '1px solid #f1f5f9', padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', animation: 'npIn .2s ease' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>#{r.id} — {r.title}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.15rem 0.55rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />{st.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', whiteSpace: 'pre-line' }}>
                    {m.start_date && m.end_date && <span>📅 {formatDate(m.start_date)} {m.start_date !== m.end_date ? `→ ${formatDate(m.end_date)}` : ''}</span>}

                    {/* Hiển thị linh hoạt các loại nghỉ */}
                    <span style={{ fontWeight: 500, color: '#334155' }}>
                      {m.session === 'full_day' && ' (Cả ngày)'}
                      {m.session === 'morning' && ' (Buổi sáng)'}
                      {m.session === 'afternoon' && ' (Buổi chiều)'}
                      {m.session === 'hourly' && ` (Nghỉ ${m.hours || 0} tiếng)`}
                    </span>
                  </div>
                  {m.reason && <div style={{ fontSize: '0.78rem', color: '#475569' }}>💬 {m.reason}</div>}
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Gửi: {formatDate(r.created_at)}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <LeaveRequestDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={() => {
          showMsg('✅ Đã gửi đơn xin nghỉ phép, chờ trưởng phòng duyệt')
          load()
        }}
        employee={employee}
      />
    </div>
  )
}

const pageStyle = { padding: '0 0 1.5rem', animation: 'npIn .25s ease' }
const primaryBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem',
  background: '#0a5b35', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600,
  fontSize: '0.84rem', cursor: 'pointer',
}
const ghostBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem',
  background: '#fff', color: '#475569', border: '1px solid #d1d5db', borderRadius: 8,
  fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
}