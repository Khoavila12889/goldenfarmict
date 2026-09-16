import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import {
  listApprovalRequests, getPendingApprovals, getEmployeeByCode,
  approveRequest, rejectRequest, apiUrl,
} from '../services/api'
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
  if (r.metadata && typeof r.metadata === 'object') return r.metadata
  const raw = r.metadata_json
  if (raw && typeof raw === 'object') return raw
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch (_) { return {} }
  }
  return {}
}

function isLeave(d) {
  const k = d?.kind || metaOf(d).kind
  return !k || k === 'leave'
}

function parseEvent(ev) {
  try { return JSON.parse(ev.data || '{}') } catch (_) { return {} }
}

function stubFromEvent(d, status) {
  return {
    id: d.id,
    title: d.title || `Đơn #${d.id}`,
    status: status || d.status || 'pending',
    requester_code: d.requester_code || '',
    requester_name: d.requester_name || '',
    requester_dept: d.requester_dept || '',
    created_at: new Date().toISOString(),
    metadata: {
      kind: d.kind || 'leave',
      start_date: d.start_date || '',
      end_date: d.end_date || '',
      session: d.session || '',
      reason: d.reason || '',
      leave_type: d.leave_type || '',
    },
  }
}

function sessionLabel(m) {
  const s = m.session
  if (s === 'morning') return ' (Buổi sáng)'
  if (s === 'afternoon') return ' (Buổi chiều)'
  if (s === 'hourly') return ` (Nghỉ ${m.hours || 0} tiếng)`
  if (s === 'full' || s === 'full_day') return ' (Cả ngày)'
  return ''
}

export default function NghiPhep() {
  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || ''
  const token = sessionStorage.getItem('token') || ''
  const isHead = userRole === 'head'

  const [employee, setEmployee] = useState(null)
  const [requests, setRequests] = useState([])
  const [pendingReqs, setPendingReqs] = useState([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [approvingId, setApprovingId] = useState(null)
  const [toast, setToast] = useState(null)
  const [notifs, setNotifs] = useState([])
  const [highlightId, setHighlightId] = useState(null)

  const toastTimer = useRef(null)
  const highlightTimer = useRef(null)
  const refetchTimer = useRef(null)
  const seenRef = useRef(new Set())
  const loadMyRef = useRef(() => {})
  const loadPendingRef = useRef(() => {})

  const loadMy = useCallback(async ({ silent } = {}) => {
    if (!silent) setLoading(true)
    try {
      const res = await listApprovalRequests({ requester: userCode })
      const list = (res.data?.data || []).filter(r => isLeave(r))
      setRequests(list)
    } catch {
      if (!silent) setRequests([])
    }
    if (!silent) setLoading(false)
  }, [userCode])

  const loadPending = useCallback(async () => {
    if (!isHead || !userCode) return
    try {
      const r = await getPendingApprovals(userCode)
      setPendingReqs((r.data?.data || []).filter(x => isLeave(x)))
    } catch {
      /* giữ danh sách cũ khi lỗi mạng — tránh nháy trống */
    }
  }, [isHead, userCode])

  loadMyRef.current = loadMy
  loadPendingRef.current = loadPending

  useEffect(() => {
    getEmployeeByCode(userCode)
      .then(r => r.data && setEmployee(r.data))
      .catch(() => {})
    loadMy()
    loadPending()
  }, [userCode, loadMy, loadPending])

  const scheduleSilentSync = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(() => {
      loadMyRef.current({ silent: true })
      loadPendingRef.current()
    }, 250)
  }, [])

  const markSeen = useCallback((key) => {
    const s = seenRef.current
    if (s.has(key)) return false
    s.add(key)
    if (s.size > 60) seenRef.current = new Set([...s].slice(-30))
    return true
  }, [])

  const pushNotif = useCallback((type, text, key) => {
    if (key && !markSeen(key)) return
    const item = { id: key || `n-${Date.now()}`, type, text, at: Date.now() }
    setNotifs(prev => [item, ...prev.filter(n => n.id !== item.id)].slice(0, 8))
    setToast({ type, text })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4500)
  }, [markSeen])

  const flashRow = useCallback((id) => {
    if (!id) return
    setHighlightId(id)
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlightId(null), 2800)
  }, [])

  const patchMy = useCallback((d, status) => {
    if (!d?.id) return
    setRequests(prev => {
      const nextStatus = status || d.status
      const idx = prev.findIndex(r => r.id === d.id)
      if (idx >= 0) {
        const copy = prev.slice()
        copy[idx] = { ...copy[idx], status: nextStatus }
        return copy
      }
      if (d.requester_code && d.requester_code !== userCode) return prev
      return [stubFromEvent(d, nextStatus), ...prev]
    })
    flashRow(d.id)
  }, [userCode, flashRow])

  const patchPending = useCallback((d, action) => {
    if (!isHead || !d?.id) return
    setPendingReqs(prev => {
      if (action === 'remove') return prev.filter(r => r.id !== d.id)
      if (prev.some(r => r.id === d.id)) return prev
      return [stubFromEvent(d, 'pending'), ...prev]
    })
  }, [isHead])

  // Realtime SSE: patch ngay + toast, refetch im lặng để khớp server
  useEffect(() => {
    let es = null
    let reconnectTimer = null
    let closed = false

    const onSubmitted = (ev) => {
      const d = parseEvent(ev)
      if (!isLeave(d)) { scheduleSilentSync(); return }
      if (d.requester_code === userCode) {
        patchMy(d, 'pending')
        pushNotif('info', `⏳ Đơn #${d.id} đang chờ trưởng phòng duyệt`, `sub-${d.id}`)
      }
      if (isHead && d.requester_code !== userCode) {
        patchPending(d, 'add')
        pushNotif('info', `📥 Đơn mới chờ duyệt: ${(d.title || `#${d.id}`).slice(0, 70)}`, `pend-${d.id}`)
      }
      scheduleSilentSync()
    }

    const onApproved = (ev) => {
      const d = parseEvent(ev)
      if (!isLeave(d)) { scheduleSilentSync(); return }
      const st = d.status || 'approved'
      if (d.requester_code === userCode) {
        patchMy(d, st)
        const by = d.approver_name ? ` bởi ${d.approver_name}` : ''
        const text = st === 'in_progress'
          ? `⚙️ Đơn "${(d.title || '').slice(0, 50)}" đã được duyệt một bước${by}`
          : `✅ Đơn "${(d.title || '').slice(0, 50)}" đã được duyệt${by}`
        pushNotif('success', text, `ok-${d.id}-${st}`)
      }
      patchPending(d, 'remove')
      scheduleSilentSync()
    }

    const onRejected = (ev) => {
      const d = parseEvent(ev)
      if (!isLeave(d)) { scheduleSilentSync(); return }
      if (d.requester_code === userCode) {
        patchMy(d, 'rejected')
        const by = d.approver_name ? ` bởi ${d.approver_name}` : ''
        pushNotif('error', `❌ Đơn "${(d.title || '').slice(0, 50)}" bị từ chối${by}`, `no-${d.id}`)
      }
      patchPending(d, 'remove')
      scheduleSilentSync()
    }

    function connect() {
      if (closed) return
      if (es) { es.close(); es = null }
      try {
        es = new EventSource(apiUrl(`/events${token ? `?token=${token}` : ''}`))
        es.addEventListener('connected', () => scheduleSilentSync())
        es.addEventListener('request_submitted', onSubmitted)
        es.addEventListener('request_approved', onApproved)
        es.addEventListener('request_rejected', onRejected)
        es.onerror = () => {
          if (closed) return
          if (es) { es.close(); es = null }
          if (reconnectTimer) clearTimeout(reconnectTimer)
          reconnectTimer = setTimeout(connect, 2500)
        }
      } catch (_) {
        reconnectTimer = setTimeout(connect, 2500)
      }
    }

    connect()
    return () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (refetchTimer.current) clearTimeout(refetchTimer.current)
      if (es) es.close()
    }
  }, [token, userCode, isHead, patchMy, patchPending, pushNotif, scheduleSilentSync])

  useEffect(() => {
    if (!isHead) return
    const poll = setInterval(() => {
      loadPendingRef.current()
    }, 15000)
    return () => clearInterval(poll)
  }, [isHead])

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
  }, [])

  const handleApprove = async (req, action) => {
    if (approvingId) return
    setApprovingId(req.id)
    try {
      if (action === 'approve') {
        await approveRequest(req.id, { approver_code: userCode, comment: '' })
        markSeen(`ok-${req.id}-approved`)
        patchPending(req, 'remove')
        pushNotif('success', `✅ Đã phê duyệt đơn #${req.id}`, `head-ok-${req.id}`)
      } else {
        await rejectRequest(req.id, { approver_code: userCode, comment: '' })
        markSeen(`no-${req.id}`)
        patchPending(req, 'remove')
        pushNotif('error', `❌ Đã từ chối đơn #${req.id}`, `head-no-${req.id}`)
      }
      scheduleSilentSync()
    } catch (err) {
      pushNotif('error', '⚠️ ' + (err.response?.data?.detail || err.response?.data?.error || 'Không thể xử lý đơn'))
      loadPending()
    } finally {
      setApprovingId(null)
    }
  }

  const statusCount = (s) => requests.filter(r => r.status === s).length

  return (
    <div style={pageStyle}>
      <style>{`
        .np-card { background:#fff; border:1px solid #e6edf5; border-radius:12px; padding:1rem; }
        @keyframes npIn { from {opacity:0; transform: translateY(6px);} to {opacity:1; transform: translateY(0);} }
        @keyframes npFlash { from { background:#ecfdf5; } to { background:transparent; } }
      `}</style>

      {toast && (
        <div style={{
          position: 'fixed', top: 18, right: 18, zIndex: 1200, maxWidth: 380,
          padding: '0.7rem 1rem', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600,
          color: '#fff',
          background: toast.type === 'error' ? '#dc2626' : toast.type === 'success' ? '#16a34a' : '#00468C',
          boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
        }}>
          {toast.text}
        </div>
      )}

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
          <button onClick={() => { loadMy(); loadPending() }} style={ghostBtnStyle}><RefreshCw size={15} /> Làm mới</button>
          <button onClick={() => setDialogOpen(true)} style={primaryBtnStyle}><Plus size={16} /> Đăng ký nghỉ phép</button>
        </div>
      </div>

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

      <div className="np-card" style={{ marginBottom: '1rem', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e6edf5', fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🔔 Thông báo</span>
          {notifs.length > 0 && (
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fff', background: '#00468C', padding: '0.1rem 0.45rem', borderRadius: 20 }}>{notifs.length}</span>
          )}
        </div>
        {notifs.length === 0 ? (
          <div style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: '#94a3b8' }}>Chưa có thông báo mới trong phiên này.</div>
        ) : (
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {notifs.map(n => (
              <div key={n.id} style={{
                padding: '0.55rem 1rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem', fontWeight: 600,
                color: n.type === 'error' ? '#b91c1c' : n.type === 'success' ? '#166534' : '#1e3a8a',
                background: n.type === 'error' ? '#fef2f2' : n.type === 'success' ? '#f0fdf4' : '#eff6ff',
              }}>
                {n.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {isHead && (
        <div className="np-card" style={{ marginBottom: '1rem', padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e6edf5', fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
            🗂️ Đơn chờ duyệt ({pendingReqs.length})
          </div>
          {pendingReqs.length === 0 ? (
            <div style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: '#94a3b8' }}>Không có đơn nghỉ phép chờ duyệt.</div>
          ) : pendingReqs.map(r => {
            const m = metaOf(r)
            return (
              <div key={r.id} style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>#{r.id} — {r.title}</div>
                <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                  👤 {r.requester_name || r.requester_code} {r.requester_dept ? `· ${r.requester_dept}` : ''}
                  {m.start_date && m.end_date ? ` · ${formatDate(m.start_date)}${m.start_date !== m.end_date ? ` → ${formatDate(m.end_date)}` : ''}` : ''}
                </div>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button
                    onClick={() => handleApprove(r, 'approve')}
                    disabled={approvingId === r.id}
                    style={{ padding: '0.28rem 0.7rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer' }}
                  >{approvingId === r.id ? 'Đang xử lý...' : '✅ Duyệt'}</button>
                  <button
                    onClick={() => handleApprove(r, 'reject')}
                    disabled={approvingId === r.id}
                    style={{ padding: '0.28rem 0.7rem', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer' }}
                  >❌ Từ chối</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="np-card" style={{ padding: 0, overflow: 'hidden' }}>
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
              const hi = highlightId === r.id
              return (
                <div key={r.id} style={{
                  borderBottom: '1px solid #f1f5f9', padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem',
                  animation: hi ? 'npFlash .8s ease' : 'npIn .2s ease',
                  background: hi ? '#ecfdf5' : 'transparent',
                  boxShadow: hi ? `inset 3px 0 0 ${st.dot}` : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>#{r.id} — {r.title}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.15rem 0.55rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />{st.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', whiteSpace: 'pre-line' }}>
                    {m.start_date && m.end_date && <span>📅 {formatDate(m.start_date)} {m.start_date !== m.end_date ? `→ ${formatDate(m.end_date)}` : ''}</span>}
                    <span style={{ fontWeight: 500, color: '#334155' }}>{sessionLabel(m)}</span>
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
          pushNotif('info', '✅ Đã gửi đơn xin nghỉ phép, chờ trưởng phòng duyệt', `sent-${Date.now()}`)
          loadMy({ silent: true })
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
