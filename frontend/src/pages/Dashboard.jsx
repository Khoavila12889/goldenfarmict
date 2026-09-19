import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { getDashboardStats, getEmployeeByCode, getTickets, getTicketQueuePosition, getPendingApprovals, listApprovalRequests, approveRequest, rejectRequest, apiUrl } from '../services/api'
import { formatDate } from '../utils/date'
import { Ticket, Calendar, Users, Monitor, Clock, AlertCircle, CheckCircle2, XCircle, ArrowRight, CalendarOff } from 'lucide-react'
import AnnouncementsBox from '../components/AnnouncementsBox'
import './dashboard.css'

const STATUS_ORDER = ['Cho xu ly', 'Dang xu ly', 'Da xu ly', 'Da huy']

const STATUS_MAP = {
  'Cho xu ly': { label: '⏳ Chờ xử lý', color: '#d97706', bg: '#fef3c7' },
  'Dang xu ly': { label: '⚙️ Đang xử lý', color: '#2563eb', bg: '#dbeafe' },
  'Da xu ly': { label: '✅ Đã xử lý', color: '#16a34a', bg: '#dcfce7' },
  'Da huy': { label: '❌ Đã hủy', color: '#6b7280', bg: '#f3f4f6' },
}

export default function Dashboard() {
  const userRole = sessionStorage.getItem('user_role') || ''
  const userCode = sessionStorage.getItem('user_code') || ''
  const token = sessionStorage.getItem('token') || ''

  const isAdmin = userRole === 'admin'
  const isHead = userRole === 'head'

  const [stats, setStats] = useState(null)
  const [emp, setEmp] = useState(null)
  const [myTickets, setMyTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedStatus, setExpandedStatus] = useState(null)
  const [statusTickets, setStatusTickets] = useState([])
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [queuePos, setQueuePos] = useState(null)
  const [userPerms, setUserPerms] = useState({})

  const [pendingReqs, setPendingReqs] = useState([])
  const [myReqs, setMyReqs] = useState([])
  const [approvingId, setApprovingId] = useState(null)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const [viewDetail, setViewDetail] = useState(null)
  const [showHistoryReqs, setShowHistoryReqs] = useState(false)
  const [expandedItem, setExpandedItem] = useState(null)
  const toggleExpand = (id) => setExpandedItem(prev => prev === id ? null : id)
  const LIST_LIMIT = 10

  // 1. Lấy danh sách quyền động của User (Chống Memory Leak)
  useEffect(() => {
    if (isAdmin) return
    let isMounted = true
    const controller = new AbortController()

    fetch(apiUrl(`/auth/permissions?employee_code=${userCode}&token=${token}&role=${userRole}`), {
      signal: controller.signal
    })
      .then(r => r.json())
      .then(d => {
        if (isMounted) setUserPerms(d.data || {})
      })
      .catch((err) => {
        if (err.name !== 'AbortError' && isMounted) setUserPerms({})
      })

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [userCode, userRole, isAdmin, token])

  // Kiểm tra module có được phép xem không
  const canViewModule = useCallback((moduleKey) => {
    if (isAdmin) return true
    if (userPerms && userPerms[moduleKey] !== undefined) {
      return !!userPerms[moduleKey].can_view
    }
    return true
  }, [isAdmin, userPerms])

  // 2. Hàm load dữ liệu chính sử dụng Async/Await & Promise.all
  const loadData = useCallback(async () => {
    try {
      const promises = [getDashboardStats()]

      if (!isAdmin && userCode) {
        promises.push(getEmployeeByCode(userCode))
        promises.push(getTicketQueuePosition(userCode).catch(() => ({ data: null })))
      }

      const [statsRes, empRes, queueRes] = await Promise.all(promises)

      if (statsRes?.data) setStats(statsRes.data)

      if (!isAdmin && empRes?.data) {
        setEmp(empRes.data)
        if (queueRes?.data) setQueuePos(queueRes.data)

        if (empRes.data.id) {
          const ticketsRes = await getTickets().catch(() => ({ data: { data: [] } }))
          const allTickets = ticketsRes.data?.data || []
          setMyTickets(allTickets.filter(t => t.employee_id === empRes.data.id))
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu Dashboard:', err)
    }
  }, [isAdmin, userCode])

  // Trưởng phòng: đơn chờ duyệt
  const loadPendingApprovals = useCallback(() => {
    if (!isHead || !userCode) return
    getPendingApprovals(userCode)
      .then(r => setPendingReqs(r.data?.data || []))
      .catch(() => setPendingReqs([]))
  }, [isHead, userCode])

  // User: trạng thái đơn của mình (nghỉ phép / công tác)
  const loadMyApprovals = useCallback(() => {
    if (isAdmin || !userCode) return
    listApprovalRequests({ requester: userCode })
      .then(r => setMyReqs(r.data?.data || []))
      .catch(() => setMyReqs([]))
  }, [isAdmin, userCode])

  useEffect(() => {
    loadPendingApprovals()
    loadMyApprovals()
  }, [loadPendingApprovals, loadMyApprovals])

  const showToast = useCallback((type, text) => {
    setToast({ type, text })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4500)
  }, [])

  const handleApprove = async (req, action) => {
    if (approvingId) return
    setApprovingId(req.id)
    try {
      if (action === 'approve') {
        await approveRequest(req.id, { approver_code: userCode, comment: '' })
        showToast('success', '✅ Đã phê duyệt đơn #' + req.id)
      } else {
        await rejectRequest(req.id, { approver_code: userCode, comment: '' })
        showToast('error', '❌ Đã từ chối đơn #' + req.id)
      }
    } catch (err) {
      showToast('error', '⚠️ ' + (err.response?.data?.detail || err.response?.data?.error || 'Không thể xử lý đơn'))
    } finally {
      // Luôn làm mới danh sách (kể cả khi backend báo lỗi một phần) để giao diện đồng bộ
      await Promise.allSettled([loadPendingApprovals(), loadMyApprovals(), loadData()])
      setApprovingId(null)
    }
  }

  // Tạo danh sách chi tiết để mở modal (khi > 10 dòng)
  const detailRows = useCallback((kind, dept) => {
    if (kind === 'absences') {
      let list = stats?.pending_absences?.items || []
      if (dept) list = list.filter(a => (a.department || '') === dept)
      return {
        title: dept ? `🧑‍💼 NV phòng ${dept} đang xin nghỉ / công tác` : '🧑‍💼 NV đang xin nghỉ / công tác',
        rows: list.map(a => ({
          main: a.full_name,
          sub: `${a.kind === 'leave' ? '🏖️ Nghỉ phép' : '🧳 Công tác'} · ${a.department} · ${a.title}`,
          date: a.start_date && a.end_date ? `📅 ${formatDate(a.start_date)} → ${formatDate(a.end_date)}` : '',
          tag: '⏳ Chờ duyệt', tagColor: '#d97706', tagBg: '#fef3c7',
        })),
      }
    }
    if (kind === 'trips') return {
      title: '🧳 Nhân viên đi công tác hôm nay',
      rows: (stats?.trips_today || []).map(t => ({
        main: t.full_name,
        sub: `📍 ${t.destination} · ${t.department}`,
        date: `📅 ${formatDate(t.start_date)} → ${formatDate(t.end_date)}`,
      })),
    }
    if (kind === 'leaves') return {
      title: '🏖️ Nhân viên nghỉ phép / việc hôm nay',
      rows: (stats?.leaves_today || []).map(l => ({
        main: l.full_name,
        sub: `📝 ${l.destination || 'Nghỉ phép'} · ${l.department}`,
        date: `📅 ${formatDate(l.start_date)} → ${formatDate(l.end_date)}`,
      })),
    }
    if (kind === 'bookings') return {
      title: '📅 Lịch đặt hôm nay',
      rows: (stats?.bookings_today || []).map(b => ({
        main: b.resource_name,
        sub: `${b.title || 'Sử dụng nội bộ'} · ${b.full_name}${b.department ? ` (${b.department})` : ''}`,
        date: `${b.start_time}–${b.end_time}`,
      })),
    }
    return { title: '', rows: [] }
  }, [stats])

  // Initial Load
  useEffect(() => {
    let isMounted = true
    setLoading(true)

    loadData().finally(() => {
      if (isMounted) setLoading(false)
    })

    return () => { isMounted = false }
  }, [loadData])

  const loadDataRef = useRef(loadData)
  loadDataRef.current = loadData

  // 3. SSE — Realtime EventSource với Token Xác thực
  useEffect(() => {
    let es = null
    let reconnectTimer = null
    let closed = false

    function connect() {
      if (closed) return
      if (es) { es.close(); es = null }
      try {
        const sseUrl = apiUrl(`/events${token ? `?token=${token}` : ''}`)
        es = new EventSource(sseUrl)

        es.addEventListener('connected', () => { loadDataRef.current() })

        es.addEventListener('update_ticket', () => loadDataRef.current())
        es.addEventListener('new_ticket', () => loadDataRef.current())
        es.addEventListener('delete_ticket', () => loadDataRef.current())
        es.addEventListener('booking_created', () => loadDataRef.current())
        es.addEventListener('booking_updated', () => loadDataRef.current())
        es.addEventListener('trip_created', () => loadDataRef.current())

        // ─── Đơn nghỉ phép / công tác ───
        es.addEventListener('request_submitted', (ev) => {
          loadPendingApprovals()
          loadMyApprovals()
          loadDataRef.current()
          if (isHead) {
            try {
              const d = JSON.parse(ev.data || '{}')
              showToast('info', `📥 Đơn mới chờ duyệt: ${(d.title || '').slice(0, 60)}`)
            } catch (_) { }
          }
        })

        es.addEventListener('request_approved', (ev) => {
          loadPendingApprovals()
          loadMyApprovals()
          loadDataRef.current()
          try {
            const d = JSON.parse(ev.data || '{}')
            if (d.requester_code && d.requester_code === userCode) {
              showToast('success', `✅ Đơn "${(d.title || '').slice(0, 50)}" đã được duyệt`)
            }
          } catch (_) { }
        })

        es.addEventListener('request_rejected', (ev) => {
          loadPendingApprovals()
          loadMyApprovals()
          loadDataRef.current()
          try {
            const d = JSON.parse(ev.data || '{}')
            if (d.requester_code && d.requester_code === userCode) {
              showToast('error', `❌ Đơn "${(d.title || '').slice(0, 50)}" bị từ chối`)
            }
          } catch (_) { }
        })

        es.onerror = () => {
          if (closed) return
          if (es) { es.close(); es = null }
          if (reconnectTimer) clearTimeout(reconnectTimer)
          reconnectTimer = setTimeout(connect, 3000)
        }
      } catch (_) {
        reconnectTimer = setTimeout(connect, 3000)
      }
    }

    connect()
    return () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (es) es.close()
    }
  }, [token, isHead, userCode, showToast, loadPendingApprovals, loadMyApprovals])

  // 3b. Polling fallback — đảm bảo leaves_today / pending_absences luôn mới
  useEffect(() => {
    const poll = setInterval(() => {
      loadDataRef.current()
      loadPendingApprovals()
      loadMyApprovals()
    }, 15000)
    return () => clearInterval(poll)
  }, [loadPendingApprovals, loadMyApprovals])

  // 4. Memoize lọc dữ liệu
  const pendingTickets = useMemo(() =>
    myTickets.filter(t => t.status === 'Cho xu ly' || t.status === 'Dang xu ly'),
  [myTickets])

  const resolvedTickets = useMemo(() =>
    myTickets.filter(t => t.status === 'Da xu ly'),
  [myTickets])

  const todayBooking = useMemo(() =>
    stats?.bookings_today || [],
  [stats?.bookings_today])

  const showBookings = canViewModule('bookings')
  const showTickets = canViewModule('tickets')

  const activeMyReqs = myReqs.filter(r => !['approved', 'rejected', 'cancelled'].includes(r.status))
  const historyMyReqs = myReqs.filter(r => ['approved', 'rejected', 'cancelled'].includes(r.status))
  const displayReqs = showHistoryReqs ? historyMyReqs : activeMyReqs

  if (loading) {
    return (
      <div className="loading-container">
        🔄 Đang tải dữ liệu tổng quan...
      </div>
    )
  }

  // ── 1. ADMIN DASHBOARD ──
  if (isAdmin) {
    const items = stats ? [
      { label: 'Tổng nhân viên', value: stats.total_employees, icon: <Users size={24} color="#0a5b35" />, bg: '#e8f5e9' },
      { label: 'Thiết bị quản lý', value: stats.total_equipment, icon: <Monitor size={24} color="#2563eb" />, bg: '#eff6ff' },
      { label: 'Ticket chờ xử lý', value: stats.pending_tickets, icon: <Ticket size={24} color="#d97706" />, bg: '#fffbeb' },
      { label: 'Lịch đặt hôm nay', value: stats.bookings_today?.length || 0, icon: <Calendar size={24} color="#7c3aed" />, bg: '#f5f3ff' },
      { label: 'NV xin nghỉ/công tác', value: stats.pending_absences?.total_employees || 0, icon: <CalendarOff size={24} color="#0284c7" />, bg: '#f0f9ff' },
    ] : []

    return (
      <div>
        <h1 className="page-title">
          📊 Hệ thống Quản lý GOLDENFARM ICT
        </h1>

        {toast && <ToastBox toast={toast} />}

        <div className="grid-4">
          {items.map(item => (
            <div key={item.label} className="stat-card">
              <div>
                <span className="stat-label">{item.label}</span>
                <span className="stat-value">{item.value}</span>
              </div>
              <div className="stat-icon" style={{ background: item.bg }}>
                {item.icon}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <AnnouncementsBox />
        </div>

        <div className="grid-2">
          <div className="admin-card">
            <h3 className="kanban-title">🎫 Ticket theo trạng thái</h3>
            <div className="flex-col gap-sm">
              {(stats?.tickets_by_status || []).length === 0 ? (
                <p className="empty-text">Không có ticket nào</p>
              ) : STATUS_ORDER.map(s => {
                const item = stats.tickets_by_status.find(t => t.status === s)
                if (!item) return null
                return (
                  <div key={s}>
                    <div
                      onClick={async () => {
                        if (expandedStatus === s) { setExpandedStatus(null); return }
                        setExpandedStatus(s); setLoadingStatus(true)
                        try {
                          const r = await getTickets(s, 'Tất cả', '')
                          setStatusTickets(r.data?.data || [])
                        } catch { setStatusTickets([]) }
                        setLoadingStatus(false)
                      }}
                      className={`status-row ${expandedStatus === s ? 'status-row-active' : 'status-row-default'}`}
                    >
                      <span className="status-label" style={{ color: STATUS_MAP[s]?.color || '#475569', background: STATUS_MAP[s]?.bg || '#f1f5f9' }}>
                        {STATUS_MAP[s]?.label || s}
                      </span>
                      <span className="status-count">{item.count}</span>
                    </div>

                    {expandedStatus === s && (
                      <div className="status-detail">
                        {loadingStatus ? (
                          <p className="empty-text" style={{ margin: 0 }}>Đang tải...</p>
                        ) : statusTickets.length === 0 ? (
                          <p className="empty-text" style={{ margin: 0 }}>Không có ticket.</p>
                        ) : (
                          <div className="list-scroll-ticket">
                            {statusTickets.map(t => (
                              <div key={t.id} className="ticket-item">
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span className="ticket-item-id">#{t.id}</span>
                                  <span className="ticket-item-name">{t.title}</span>
                                  <div className="ticket-item-meta">
                                    👤 {t.full_name} · {t.department || '—'}
                                  </div>
                                </div>
                                <span className="ticket-item-date">{formatDate(t.created_at)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="admin-card">
            <div className="header-row">
              <h3 className="kanban-title" style={{ margin: 0 }}>📅 Lịch hôm nay</h3>
              <span className="bookings-count-badge">
                {stats?.bookings_today?.length || 0} lịch
              </span>
            </div>
            <BookingList bookings={stats?.bookings_today || []} />
          </div>
        </div>

        <div className="grid-2" style={{ marginTop: '1.5rem' }}>
          <div className="admin-card">
            <h3 className="kanban-title">🧳 Nhân viên đi công tác hôm nay ({stats?.trips_count || 0})</h3>
            {(stats?.trips_today || []).length === 0 ? (
              <p className="empty-absence">Không có ai đi công tác hôm nay.</p>
            ) : (
              <>
                <div className="list-scroll">
                  {stats.trips_today.slice(0, LIST_LIMIT).map(t => (
                    <div key={t.id} className="trip-card trip-card-car">
                      <div>
                        <div className="trip-name">👤 {t.full_name} ({t.department})</div>
                        <div className="trip-detail">📍 {t.destination}</div>
                      </div>
                      <span className="date-header">{formatDate(t.start_date)} → {formatDate(t.end_date)}</span>
                    </div>
                  ))}
                </div>
                {stats.trips_today.length > LIST_LIMIT && (
                  <button className="view-all-btn" onClick={() => setViewDetail(detailRows('trips'))}>Xem tất cả ({stats.trips_today.length})</button>
                )}
              </>
            )}
          </div>

          <div className="admin-card">
            <h3 className="kanban-title">🏖️ Nhân viên nghỉ phép / việc hôm nay ({stats?.leaves_count || 0})</h3>
            {(stats?.leaves_today || []).length === 0 ? (
              <p className="empty-absence">Không có ai nghỉ hôm nay.</p>
            ) : (
              <>
                <div className="list-scroll">
                  {stats.leaves_today.slice(0, LIST_LIMIT).map(l => (
                    <div 
                      key={l.id} 
                      className="trip-card trip-card-leave clickable-card" 
                      onClick={() => toggleExpand(`leave_${l.id}`)}
                      style={{ display: 'flex', flexDirection: 'column' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <div>
                          <div className="trip-name">👤 {l.full_name} ({l.department})</div>
                          <div className="trip-detail">📝 {l.destination || 'Nghỉ phép'}</div>
                        </div>
                        <span className="date-header">{formatDate(l.start_date)} → {formatDate(l.end_date)}</span>
                      </div>

                      {expandedItem === `leave_${l.id}` && (
                        <div className="expand-reason">
                          <strong>Lý do:</strong> {l.reason || l.description || 'Không có ghi chú'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {stats.leaves_today.length > LIST_LIMIT && (
                  <button className="view-all-btn" onClick={() => setViewDetail(detailRows('leaves'))}>Xem tất cả ({stats.leaves_today.length})</button>
                )}
              </>
            )}
          </div>

          <div className="admin-card">
            <h3 className="kanban-title">🧑💼 NV đang xin nghỉ phép / công tác ({stats?.pending_absences?.total_employees || 0} NV)</h3>
            {(stats?.pending_absences?.items || []).length === 0 ? (
              <p className="empty-absence">Không có ai đang xin nghỉ phép / công tác.</p>
            ) : (
              <>
                <div className="list-scroll">
                  {stats.pending_absences.items.slice(0, LIST_LIMIT).map(a => (
                    <div 
                      key={a.request_id} 
                      className="trip-card trip-card-absence clickable-card"
                      onClick={() => toggleExpand(`abs_${a.request_id}`)}
                      style={{ display: 'flex', flexDirection: 'column' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <div>
                          <div className="trip-name">👤 {a.full_name} ({a.department})</div>
                          <div className="trip-detail">{a.kind === 'leave' ? '🏖️ Nghỉ phép' : '🧳 Công tác'} · {a.title}</div>
                        </div>
                        <span className="pending-badge">⏳ Chờ duyệt</span>
                      </div>

                      {expandedItem === `abs_${a.request_id}` && (
                        <div className="expand-reason">
                          <strong>Lý do:</strong> {a.reason || a.description || 'Không có ghi chú'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {stats.pending_absences.items.length > LIST_LIMIT && (
                  <button className="view-all-btn" onClick={() => setViewDetail(detailRows('absences'))}>Xem tất cả ({stats.pending_absences.items.length})</button>
                )}
              </>
            )}
          </div>
        </div>

        {viewDetail && <ModalList title={viewDetail.title} rows={viewDetail.rows} onClose={() => setViewDetail(null)} />}
      </div>
    )
  }

  // ── 2. USER / HEAD DASHBOARD ──
  return (
    <div>
      <h1 className="page-title">
        📊 Tổng quan
        {emp && <span className="page-title-sub">— {emp.full_name} ({emp.department})</span>}
      </h1>

      {toast && <ToastBox toast={toast} />}

      <div style={{ marginBottom: '1.5rem' }}>
        <AnnouncementsBox compact />
      </div>

      {/* Trưởng phòng: duyệt đơn nghỉ phép / công tác */}
      {isHead && (
        <div className="kanban-col" style={{ marginBottom: '1.25rem' }}>
          <h3 className="kanban-title" style={{ margin: 0 }}>🗂️ Đơn chờ duyệt ({pendingReqs.length})</h3>
          {pendingReqs.length === 0 ? (
            <p className="empty-text" style={{ margin: 0 }}>Không có đơn chờ duyệt nào.</p>
          ) : (
            <div className="list-scroll-lg">
              {pendingReqs.map(r => {
                const meta = safeJson(r.metadata_json || r.metadata || '{}')
                const isLeave = meta.kind !== 'business_trip'
                return (
                  <div 
                    key={r.id} 
                    className="ticket-card clickable-card"
                    onClick={(e) => { if (e.target.tagName !== 'BUTTON') toggleExpand(`req_${r.id}`) }}
                  >
                    <div className="trip-name" style={{ marginBottom: '0.2rem' }}>
                      #{r.id} — {r.title}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b', whiteSpace: 'pre-line', marginBottom: '0.3rem' }}>
                      👤 {r.requester_name} · {r.requester_dept} · {formatDate(meta.start_date)} → {formatDate(meta.end_date)}
                    </div>

                    {expandedItem === `req_${r.id}` && (
                      <div className="expand-reason">
                        <strong>Lý do:</strong> {meta.reason || r.description || 'Không có ghi chú'}
                      </div>
                    )}

                    <div className="btn-row">
                      <button
                        onClick={() => handleApprove(r, 'approve')}
                        disabled={approvingId === r.id}
                        className="approve-btn approve-btn-yes"
                      >{approvingId === r.id ? 'Đang xử lý...' : isLeave ? '✅ Duyệt nghỉ phép' : '✅ Duyệt công tác'}</button>
                      <button
                        onClick={() => handleApprove(r, 'reject')}
                        disabled={approvingId === r.id}
                        className="approve-btn approve-btn-no"
                      >❌ Từ chối</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {!isAdmin && (
        <div className="kanban-col" style={{ marginBottom: '1.25rem' }}>
          <div className="header-row-nomargin">
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
              📋 Đơn của tôi ({activeMyReqs.length} đang chờ)
            </h3>

            <div className="flex-col gap-xs" style={{ flexDirection: 'row' }}>
              <button
                onClick={() => setShowHistoryReqs(false)}
                className={`history-toggle-btn ${!showHistoryReqs ? 'active' : 'inactive'}`}
              >
                Đang chờ
              </button>
              <button
                onClick={() => setShowHistoryReqs(true)}
                className={`history-toggle-btn ${showHistoryReqs ? 'active' : 'inactive'}`}
              >
                Lịch sử ({historyMyReqs.length})
              </button>
            </div>
          </div>

          {displayReqs.length === 0 ? (
            <p className="empty-text" style={{ margin: 0 }}>
              {showHistoryReqs ? 'Bạn chưa có lịch sử đơn nào.' : 'Bạn không có đơn nào đang chờ xử lý.'}
            </p>
          ) : (
            <div className="list-scroll-lg">
              {displayReqs.map(r => {
                const st = reqStatusStyle(r.status)
                return (
                  <div key={r.id} className="my-req-card">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="trip-name">#{r.id} — {r.title}</div>
                      <div className="ticket-item-meta">{formatDate(r.created_at)}</div>
                    </div>
                    <span className="req-status-badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {isHead && (
        <div className="kanban-col" style={{ marginBottom: '1.25rem' }}>
          <h3 className="kanban-title" style={{ margin: 0 }}>🧑💼 NV phòng đang xin nghỉ / công tác ({stats?.pending_absences?.total_employees || 0} NV)</h3>
          {(stats?.pending_absences?.items || []).length === 0 ? (
            <p className="empty-text" style={{ margin: 0 }}>Không có nhân viên nào đang xin nghỉ / công tác.</p>
          ) : (
            <>
              <div className="list-scroll" style={{ maxHeight: 260 }}>
                {stats.pending_absences.items.slice(0, LIST_LIMIT).map(a => (
                    <div 
                      key={a.request_id} 
                      className="trip-card trip-card-absence clickable-card"
                      onClick={() => toggleExpand(`abs_${a.request_id}`)}
                      style={{ display: 'flex', flexDirection: 'column' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <div>
                          <div className="trip-name">
                            👤 {a.full_name} ({a.department})
                          </div>
                          <div className="trip-detail">
                            {a.kind === 'leave' ? '🏖️ Nghỉ phép' : '🧳 Công tác'}
                            {a.start_date && a.end_date && ` · ${formatDate(a.start_date)} → ${formatDate(a.end_date)}`}
                          </div>
                        </div>
                        <span className="pending-badge">⏳ Chờ duyệt</span>
                      </div>

                      {expandedItem === `abs_${a.request_id}` && (
                        <div className="expand-reason">
                          <strong>Lý do:</strong> {a.reason || a.description || 'Không có ghi chú'}
                        </div>
                      )}
                    </div>
                ))}
              </div>
              {stats.pending_absences.items.length > LIST_LIMIT && (
                <button className="view-all-btn" onClick={() => setViewDetail(detailRows('absences', emp?.department || stats.pending_absences.items[0]?.department))}>Xem tất cả ({stats.pending_absences.items.length})</button>
              )}
            </>
          )}
        </div>
      )}

        <div className="kanban-grid">
          <div className="kanban-col">
            <div className="header-row-flex">
              <h3 className="kanban-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                🧳 Nhân viên đi công tác
              </h3>
              <span className="count-badge" style={{ background: '#0284c7' }}>{stats?.trips_today?.length || 0}</span>
            </div>
            {(stats?.trips_today || []).length === 0 ? (
              <div className="empty-kanban">
                <p className="empty-text" style={{ margin: 0 }}>Không có ai đi công tác hôm nay.</p>
              </div>
            ) : (
              <>
                <div className="list-scroll-md">
                  {stats.trips_today.slice(0, LIST_LIMIT).map(t => (
                    <div key={t.id} className="kcard trip-card trip-card-car">
                      <div>
                        <div className="trip-name">👤 {t.full_name}</div>
                        <div className="trip-detail">📍 {t.destination} ({t.department})</div>
                      </div>
                      <span className="date-header">{formatDate(t.start_date)} → {formatDate(t.end_date)}</span>
                    </div>
                  ))}
                </div>
                {stats.trips_today.length > LIST_LIMIT && (
                  <button className="view-all-btn" onClick={() => setViewDetail(detailRows('trips'))}>Xem tất cả ({stats.trips_today.length})</button>
                )}
              </>
            )}
          </div>

          <div className="kanban-col">
            <div className="header-row-flex">
              <h3 className="kanban-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                🏖️ Nhân viên nghỉ phép
              </h3>
              <span className="count-badge" style={{ background: '#e11d48' }}>{stats?.leaves_today?.length || 0}</span>
            </div>
            {(stats?.leaves_today || []).length === 0 ? (
              <div className="empty-kanban">
                <p className="empty-text" style={{ margin: 0 }}>Không có ai nghỉ hôm nay.</p>
              </div>
            ) : (
              <>
                <div className="list-scroll-md">
                  {stats.leaves_today.slice(0, LIST_LIMIT).map(l => (
                    <div 
                      key={l.id} 
                      className="kcard trip-card trip-card-leave clickable-card"
                      onClick={() => toggleExpand(`leave_${l.id}`)}
                      style={{ display: 'flex', flexDirection: 'column' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <div>
                          <div className="trip-name">👤 {l.full_name}</div>
                          <div className="trip-detail">📝 {l.destination || 'Nghỉ phép'} ({l.department})</div>
                        </div>
                        <span className="date-header">{formatDate(l.start_date)} → {formatDate(l.end_date)}</span>
                      </div>

                      {expandedItem === `leave_${l.id}` && (
                        <div className="expand-reason">
                          <strong>Lý do:</strong> {l.reason || l.description || 'Không có ghi chú'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {stats.leaves_today.length > LIST_LIMIT && (
                  <button className="view-all-btn" onClick={() => setViewDetail(detailRows('leaves'))}>Xem tất cả ({stats.leaves_today.length})</button>
                )}
              </>
            )}
          </div>

          {showBookings && (
            <div className="kanban-col">
              <div className="header-row-flex">
                <h3 className="kanban-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Calendar size={18} color="#0a5b35" /> Lịch hôm nay
                </h3>
                <span className="count-badge" style={{ background: '#0a5b35' }}>{todayBooking.length}</span>
              </div>
              {todayBooking.length === 0 ? (
                <div className="empty-kanban">
                  <p className="empty-text" style={{ margin: 0 }}>Hôm nay không có lịch đặt nào.</p>
                </div>
              ) : (
                <div className="list-scroll-sm">
                  {todayBooking.map(b => {
                    const isCar = b.resource_type?.includes('car')
                    const badge = bookingBadge(b)
                    return (
                      <div key={b.id} className={`kcard booking-card ${isCar ? 'booking-card-car' : 'booking-card-door'} ${badge.dot ? 'booking-card-active' : ''}`}>
                        <div className="booking-info-top">
                          <span className="booking-name">
                            {isCar ? '🚗' : '🚪'} {b.resource_name}
                          </span>
                          <span className="time-badge">{b.start_time} – {b.end_time}</span>
                        </div>
                        <div className="booking-detail">
                          {b.title || 'Sử dụng nội bộ'}
                        </div>
                        <div className="booking-footer">
                          <span>👤 {b.full_name}</span>
                          {b.department && <span className="dept-tag">{b.department}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {showTickets && (
            <div className="kanban-col">
              <div className="header-row-flex">
                <h3 className="kanban-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Ticket size={18} color="#2563eb" /> Ticket của tôi
                </h3>
                <div className="ticket-header">
                  <span className="count-badge" style={{ background: '#d97706' }}>chờ {pendingTickets.length}</span>
                  {queuePos && queuePos.total_pending > 0 && queuePos.rank > 1 && (
                    <span className="queue-badge">
                      #Hàng đợi: {queuePos.rank}
                    </span>
                  )}
                </div>
              </div>

              {pendingTickets.length > 0 && (
                <>
                  <div className="section-subtitle">⏳ ĐANG CHỜ XỬ LÝ</div>
                  {pendingTickets.map(t => {
                    const st = STATUS_MAP[t.status] || {}
                    return (
                      <div key={t.id} className="kcard ticket-card">
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a', marginBottom: '0.2rem' }}>
                          #{t.id} — {t.title}
                        </div>
                        <div className="gap-xs" style={{ display: 'flex', marginBottom: '0.3rem' }}>
                          <span className="status-badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                        </div>
                        {t.description && <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>{t.description}</div>}
                      </div>
                    )
                  })}
                </>
              )}

              {resolvedTickets.length > 0 && (
                <>
                  <div className="section-subtitle-margin">✅ ĐÃ XỬ LÝ GẦN ĐÂY</div>
                  {resolvedTickets.slice(0, 2).map(t => (
                    <div key={t.id} className="kcard ticket-card">
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a', marginBottom: '0.2rem' }}>
                        #{t.id} — {t.title}
                      </div>
                      <span className="status-badge" style={{ background: '#dcfce7', color: '#16a34a' }}>✅ Đã xong</span>
                    </div>
                  ))}
                </>
              )}

              {myTickets.length === 0 && (
                <div className="empty-kanban">
                  <p className="empty-text" style={{ margin: 0 }}>Bạn chưa có ticket yêu cầu nào.</p>
                </div>
              )}
            </div>
          )}
      </div>

      {viewDetail && <ModalList title={viewDetail.title} rows={viewDetail.rows} onClose={() => setViewDetail(null)} />}
    </div>
  )
}

// ── Các hàm phụ trợ & Inline Styles ngoài Component ──

function ModalList({ title, rows, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button onClick={onClose} className="modal-close-btn">✕</button>
        </div>
        <div className="modal-body">
          {rows.length === 0 ? (
            <p className="empty-text">Không có dữ liệu.</p>
          ) : (
            <div className="flex-col">
              {rows.map((r, i) => (
                <div key={i} className={`modal-row ${i % 2 ? 'modal-row-alt' : 'modal-row-normal'}`}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="trip-name">👤 {r.main}</div>
                    {r.sub && <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.1rem' }}>{r.sub}</div>}
                  </div>
                  {r.date && <span style={{ fontSize: '0.7rem', color: '#64748b', whiteSpace: 'nowrap' }}>{r.date}</span>}
                  {r.tag && <span className="req-status-badge" style={{ color: r.tagColor, background: r.tagBg }}>{r.tag}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ToastBox({ toast }) {
  return (
    <div className={`toast-box toast-${toast.type}`}>
      {toast.text}
    </div>
  )
}

function bookingBadge(b) {
  if (b.status === 'finished') return { label: 'Đã kết thúc', color: '#6b7280', bg: '#f3f4f6', dot: false }
  const now = new Date()
  const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  if (cur >= b.start_time && cur <= b.end_time) return { label: 'Đang diễn ra', color: '#16a34a', bg: '#dcfce7', dot: true }
  return { label: 'Sắp diễn ra', color: '#d97706', bg: '#fef3c7', dot: false }
}

function BookingList({ bookings }) {
  if (bookings.length === 0) {
    return <div className="empty-kanban"><p className="empty-text" style={{ margin: 0 }}>Không có lịch đặt hôm nay.</p></div>
  }
  return (
    <div className="list-scroll-md">
      {bookings.map(b => {
        const isCar = b.resource_type?.includes('car')
        return (
          <div key={b.id} className={`booking-card ${isCar ? 'booking-card-car' : 'booking-card-door'}`}>
            <div className="booking-info">
              <span className="trip-name">{isCar ? '🚗' : '🚪'} {b.resource_name}</span>
              <span className="time-badge">{b.start_time}–{b.end_time}</span>
            </div>
            <div className="booking-title">{b.title}</div>
            <div className="booking-user">👤 {b.full_name}</div>
          </div>
        )
      })}
    </div>
  )
}

function safeJson(str) {
  if (!str) return {}
  if (typeof str === 'object') return str
  try { return JSON.parse(str) } catch (_) { return {} }
}

function reqStatusStyle(status) {
  const map = {
    draft: { label: 'Nháp', color: '#6b7280', bg: '#f3f4f6' },
    pending: { label: '⏳ Chờ duyệt', color: '#d97706', bg: '#fef3c7' },
    in_progress: { label: '⚙️ Đang duyệt', color: '#2563eb', bg: '#dbeafe' },
    approved: { label: '✅ Đã duyệt', color: '#16a34a', bg: '#dcfce7' },
    rejected: { label: '❌ Bị từ chối', color: '#dc2626', bg: '#fee2e2' },
    cancelled: { label: '🕓 Đã hủy', color: '#6b7280', bg: '#f3f4f6' },
  }
  const s = map[status] || map.draft
  return { label: s.label, bg: s.bg, color: s.color }
}