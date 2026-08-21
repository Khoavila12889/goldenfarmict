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
  const [viewModal, setViewModal] = useState(null)
  const isHead = userRole === 'head'

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

  const rowsFrom = useCallback((kind) => {
    if (kind === 'absences') return (stats?.pending_absences?.items || []).map(a => ({
      main: a.full_name, sub: `${a.kind === 'leave' ? '🏖️ Nghỉ phép' : '🧳 Công tác'} · ${a.department}`,
      date: a.start_date && a.end_date ? `${formatDate(a.start_date)} → ${formatDate(a.end_date)}` : '',
      tag: '⏳ Chờ duyệt', tagColor: '#d97706', tagBg: '#fef3c7',
    }))
    if (kind === 'trips') return (stats?.trips_today || []).map(t => ({
      main: t.full_name, sub: `📍 ${t.destination}`, date: `${formatDate(t.start_date)} → ${formatDate(t.end_date)}`,
    }))
    if (kind === 'leaves') return (stats?.leaves_today || []).map(l => ({
      main: l.full_name, sub: `📝 ${l.destination || 'Nghỉ phép'}`, date: `${formatDate(l.start_date)} → ${formatDate(l.end_date)}`,
    }))
    if (kind === 'bookings') return (stats?.bookings_today || []).map(b => ({
      main: b.resource_name, sub: `${b.full_name}${b.department ? ` (${b.department})` : ''}`, date: `${b.start_time}–${b.end_time}`,
    }))
    return []
  }, [stats])

  const openView = useCallback((title, kind) => {
    setViewModal({ title, rows: rowsFrom(kind) })
  }, [rowsFrom])

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
      await refreshApprovals()
    } catch (_) { }
    setApprovingId(null)
  }

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

  const refreshApprovals = useCallback(() => {
    loadPendingApprovals()
    loadMyApprovals()
    loadData()
  }, [loadPendingApprovals, loadMyApprovals, loadData])

  // Initial Load
  useEffect(() => {
    let isMounted = true
    setLoading(true)

    loadData().finally(() => {
      if (isMounted) setLoading(false)
    })

    return () => { isMounted = false }
  }, [loadData])

  // 3. SSE — Realtime EventSource với Token Xác thực
  useEffect(() => {
    let es = null
    let reconnectTimer = null
    
    function connect() {
      try {
        const sseUrl = apiUrl(`/events${token ? `?token=${token}` : ''}`)
        es = new EventSource(sseUrl)

        const handleReload = () => loadData()

        es.addEventListener('update_ticket', handleReload)
        es.addEventListener('new_ticket', handleReload)
        es.addEventListener('delete_ticket', handleReload)
        es.addEventListener('booking_created', handleReload)
        es.addEventListener('booking_updated', handleReload)

        // ─── Đơn nghỉ phép / công tác vừa gửi → trưởng phòng: báo có đơn mới ───
        es.addEventListener('request_submitted', (ev) => {
          refreshApprovals()
          if (isHead) {
            try {
              const d = JSON.parse(ev.data || '{}')
              showToast('info', `📥 Đơn mới chờ duyệt: ${(d.title || '').slice(0, 60)}`)
            } catch (_) { }
          }
        })

        // ─── Đơn được duyệt / từ chối → người gửi: cập nhật trạng thái + thông báo ───
        es.addEventListener('request_approved', (ev) => {
          refreshApprovals()
          try {
            const d = JSON.parse(ev.data || '{}')
            if (d.requester_code && d.requester_code === userCode) {
              showToast('success', `✅ Đơn "${(d.title || '').slice(0, 50)}" đã được duyệt`)
            }
          } catch (_) { }
        })
        es.addEventListener('request_rejected', (ev) => {
          refreshApprovals()
          try {
            const d = JSON.parse(ev.data || '{}')
            if (d.requester_code && d.requester_code === userCode) {
              showToast('error', `❌ Đơn "${(d.title || '').slice(0, 50)}" bị từ chối`)
            }
          } catch (_) { }
        })

        es.onerror = () => {
          if (es) es.close()
          reconnectTimer = setTimeout(connect, 3000)
        }
      } catch (_) {
        reconnectTimer = setTimeout(connect, 3000)
      }
    }
    
    connect()
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (es) es.close()
    }
  }, [loadData, token, refreshApprovals, isHead, userCode, showToast])

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

  if (loading) {
    return (
      <div style={loadingStyle}>
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
      { label: 'Lịch đặt hôm nay', value: stats.bookings_today?.length || 0, icon: <Calendar size={24} color="#7c3aed" />, bg: '#f5f3ff', modalKey: 'bookings' },
      { label: 'NV xin nghỉ/công tác', value: stats.pending_absences?.total_employees || 0, icon: <CalendarOff size={24} color="#0284c7" />, bg: '#f0f9ff', modalKey: 'absences' },
    ] : []

    return (
      <div className="d-root">
        <h1 className="d-page-title">📊 DASHBOARD</h1>

        <div className="d-stats">
          {items.map(item => (
            <div key={item.label} className={`d-stat${item.modalKey ? ' d-stat-click' : ''}`} onClick={item.modalKey ? () => openView(item.label, item.modalKey) : undefined}>
              <div>
                <span className="d-stat-label">{item.label}</span>
                <span className="d-stat-value">{item.value}</span>
              </div>
              <div className="d-stat-icon" style={{ background: item.bg }}>{item.icon}</div>
            </div>
          ))}
        </div>

        <div className="d-main">
          <div className="d-card">
            <div className="d-card-title">📢 Thông báo nội bộ</div>
            <AnnouncementsBox />
          </div>
          <div className="d-card">
            <h3 className="d-card-title">🎫 Ticket theo trạng thái</h3>
            <div className="d-list">
              {(stats?.tickets_by_status || []).length === 0 ? (
                <p className="d-empty">Không có ticket nào</p>
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
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.55rem 0.6rem', borderRadius: 8,
                        background: expandedStatus === s ? '#f1f7fb' : 'transparent',
                        cursor: 'pointer', transition: 'all 0.15s ease',
                      }}
                    >
                      <span className="d-pill" style={{ color: STATUS_MAP[s]?.color || '#475569', background: STATUS_MAP[s]?.bg || '#f1f5f9' }}>{STATUS_MAP[s]?.label || s}</span>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>{item.count}</span>
                    </div>

                    {expandedStatus === s && (
                      <div style={{ margin: '0.2rem 0 0.4rem 0.6rem', paddingLeft: '0.6rem', borderLeft: '2px solid #e2e8f0' }}>
                        {loadingStatus ? (
                          <p className="d-empty" style={{ padding: '0.4rem 0' }}>Đang tải...</p>
                        ) : statusTickets.length === 0 ? (
                          <p className="d-empty" style={{ padding: '0.4rem 0' }}>Không có ticket.</p>
                        ) : (
                          <div className="d-list">
                            {statusTickets.map(t => (
                              <div key={t.id} className="d-row">
                                <div className="d-row-main">
                                  <span className="d-row-title">#{t.id} {t.title}</span>
                                  <div className="d-row-sub">👤 {t.full_name} · {t.department || '—'}</div>
                                </div>
                                <span className="d-row-date">{formatDate(t.created_at)}</span>
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

          </div>

        <div className="d-events">
          <div className="d-card">
            <div className="d-card-title" style={{ cursor: 'pointer' }} onClick={() => openView('🧳 Nhân viên đi công tác hôm nay', 'trips')}>
              🧳 NV đi công tác hôm nay ({stats?.trips_count || 0}) <span className="d-count">Xem tất cả</span>
            </div>
            {(stats?.trips_today || []).length === 0 ? (
              <p className="d-empty">Không có ai đi công tác hôm nay.</p>
            ) : (
              <div className="d-list">
                {stats.trips_today.map(t => (
                  <div key={t.id} className="d-row" style={{ borderLeft: '4px solid #0284c7' }}>
                    <div className="d-row-main">
                      <div className="d-row-title">👤 {t.full_name} ({t.department})</div>
                      <div className="d-row-sub">📍 {t.destination}</div>
                    </div>
                    <span className="d-row-date">{formatDate(t.start_date)} → {formatDate(t.end_date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      {viewModal && <ModalList title={viewModal.title} rows={viewModal.rows} onClose={() => setViewModal(null)} />}
      </div>
    )
  }

  // ── 2. USER / HEAD DASHBOARD ──
  return (
    <div className="d-root">
      <h1 className="d-page-title">
        📊 Tổng quan
        {emp && <span className="d-tag">— {emp.full_name} ({emp.department})</span>}
      </h1>

      {toast && (
        <div className="d-toast" style={{ background: toast.type === 'error' ? '#dc2626' : toast.type === 'success' ? '#16a34a' : '#00468C' }}>
          {toast.text}
        </div>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <AnnouncementsBox compact />
      </div>

      {/* Trưởng phòng: duyệt đơn nghỉ phép / công tác */}
      {isHead && (
        <div className="d-card" style={{ marginBottom: '1.25rem' }}>
          <h3 className="d-card-title">🗂️ Đơn chờ duyệt ({pendingReqs.length})</h3>
          {pendingReqs.length === 0 ? (
            <p className="d-empty">Không có đơn chờ duyệt nào.</p>
          ) : (
            <div className="d-list">
              {pendingReqs.map(r => {
                const meta = safeJson(r.metadata_json || r.metadata || '{}')
                const isLeave = meta.kind !== 'business_trip'
                return (
                  <div key={r.id} className="d-row" style={{ alignItems: 'flex-start' }}>
                    <div className="d-row-main">
                      <div className="d-row-title">#{r.id} — {r.title}</div>
                      <div className="d-row-sub">👤 {r.requester_name} · {r.requester_dept} · {formatDate(meta.start_date)} → {formatDate(meta.end_date)}</div>
                      <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.35rem' }}>
                        <button className="d-btn-smapp" onClick={() => handleApprove(r, 'approve')} disabled={approvingId === r.id}>
                          {approvingId === r.id ? 'Đang xử lý...' : isLeave ? '✅ Duyệt nghỉ phép' : '✅ Duyệt công tác'}
                        </button>
                        <button className="d-btn d-btn-danger d-btn-sm" onClick={() => handleApprove(r, 'reject')} disabled={approvingId === r.id}>❌ Từ chối</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* User: trạng thái đơn nghỉ phép / công tác của mình */}
      {!isAdmin && (
        <div className="d-card" style={{ marginBottom: '1.25rem' }}>
          <h3 className="d-card-title">📋 Trạng thái đơn của tôi ({myReqs.length})</h3>
          {myReqs.length === 0 ? (
            <p className="d-empty">Bạn chưa có đơn nghỉ phép / công tác nào.</p>
          ) : (
            <div className="d-list">
              {myReqs.map(r => {
                const st = reqStatusStyle(r.status)
                return (
                  <div key={r.id} className="d-row">
                    <div className="d-row-main">
                      <div className="d-row-title">#{r.id} — {r.title}</div>
                      <div className="d-row-sub">{formatDate(r.created_at)}</div>
                    </div>
                    <span className="d-pill" style={{ color: st.color, background: st.bg }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />{st.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Trưởng phòng: NV phòng đang xin nghỉ/công tác */}
      {isHead && (
        <div className="d-card" style={{ marginBottom: '1.25rem' }}>
          <div className="d-card-title" style={{ cursor: 'pointer' }} onClick={() => openView('🧑‍💼 NV phòng đang xin nghỉ / công tác', 'absences')}>
            🧑💼 NV phòng đang xin nghỉ / công tác ({stats?.pending_absences?.total_employees || 0} NV) <span className="d-count">Xem tất cả</span>
          </div>
          {(stats?.pending_absences?.items || []).length === 0 ? (
            <p className="d-empty">Không có nhân viên nào đang xin nghỉ / công tác.</p>
          ) : (
            <div className="d-list">
              {stats.pending_absences.items.map(a => (
                <div key={a.request_id} className="d-row" style={{ borderLeft: '4px solid #0284c7' }}>
                  <div className="d-row-main">
                    <div className="d-row-title">👤 {a.full_name} ({a.department})</div>
                    <div className="d-row-sub">
                      {a.kind === 'leave' ? '🏖️ Nghỉ phép' : '🧳 Công tác'}
                      {a.start_date && a.end_date && ` · ${formatDate(a.start_date)} → ${formatDate(a.end_date)}`}
                    </div>
                  </div>
                  <span className="d-pill" style={{ color: '#d97706', background: '#fef3c7' }}>⏳ Chờ duyệt</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="d-events" style={{ marginTop: 0 }}>
        {/* Widget: Lịch hôm nay */}
        {showBookings && (
          <div className="d-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
              <h3 style={{ ...kanbanTitleStyle, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Calendar size={18} color="#0a5b35" /> Lịch hôm nay
              </h3>
              <span style={countBadge(todayBooking.length, '#0a5b35')}>{todayBooking.length}</span>
            </div>
            {todayBooking.length === 0 ? (
              <div style={emptyKanbanStyle}>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>Hôm nay không có lịch đặt nào.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {todayBooking.map(b => {
                  const isCar = b.resource_type?.includes('car')
                  const badge = bookingBadge(b)
                  return (
                    <div key={b.id} className="kcard" style={{
                      ...bookingCard(isCar),
                      ...(badge.dot ? { borderLeft: '4px solid #16a34a' } : {}),
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.3rem' }}>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          {isCar ? '🚗' : '🚪'} {b.resource_name}
                        </span>
                        <span style={timeBadgeStyle}>{b.start_time} – {b.end_time}</span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '0.3rem' }}>
                        {b.title || 'Sử dụng nội bộ'}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b' }}>
                        <span>👤 {b.full_name}</span>
                        {b.department && <span style={deptTagStyle}>{b.department}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Widget: Ticket hỗ trợ */}
        {showTickets && (
          <div className="d-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.4rem' }}>
              <h3 style={{ ...kanbanTitleStyle, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Ticket size={18} color="#2563eb" /> Ticket của tôi
              </h3>
              <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                <span style={countBadge(pendingTickets.length, '#d97706')}>chờ {pendingTickets.length}</span>
                {queuePos && queuePos.total_pending > 0 && queuePos.rank > 1 && (
                  <span style={queueBadgeStyle}>
                    #Hàng đợi: {queuePos.rank}
                  </span>
                )}
              </div>
            </div>

            {/* Pending Tickets */}
            {pendingTickets.length > 0 && (
              <>
                <div style={sectionSubTitleStyle}>⏳ ĐANG CHỜ XỬ LÝ</div>
                {pendingTickets.map(t => {
                  const st = STATUS_MAP[t.status] || {}
                  return (
                    <div key={t.id} className="kcard" style={ticketCardStyle}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a', marginBottom: '0.2rem' }}>
                        #{t.id} — {t.title}
                      </div>
                      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.3rem' }}>
                        <span style={statusBadge(st.bg, st.color)}>{st.label}</span>
                      </div>
                      {t.description && <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>{t.description}</div>}
                    </div>
                  )
                })}
              </>
            )}

            {/* Resolved Tickets */}
            {resolvedTickets.length > 0 && (
              <>
                <div style={{ ...sectionSubTitleStyle, margin: '0.75rem 0 0.4rem' }}>✅ ĐÃ XỬ LÝ GẦN ĐÂY</div>
                {resolvedTickets.slice(0, 2).map(t => (
                  <div key={t.id} className="kcard" style={ticketCardStyle}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a', marginBottom: '0.2rem' }}>
                      #{t.id} — {t.title}
                    </div>
                    <span style={statusBadge('#dcfce7', '#16a34a')}>✅ Đã xong</span>
                  </div>
                ))}
              </>
            )}

            {myTickets.length === 0 && (
              <div style={emptyKanbanStyle}>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>Bạn chưa có ticket yêu cầu nào.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {viewModal && <ModalList title={viewModal.title} rows={viewModal.rows} onClose={() => setViewModal(null)} />}
    </div>
  )
}

// ── Các hàm phụ trợ & Inline Styles ngoài Component ──

function ModalList({ title, rows, onClose }) {
  return (
    <div style={mvOverlay} onClick={onClose}>
      <div style={mvCard} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.9rem 1.1rem', borderBottom: '1px solid #eef2f6' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{title}</h3>
          <button onClick={onClose} style={mvClose}>✕</button>
        </div>
        <div style={{ maxHeight: '66vh', overflowY: 'auto', padding: '0.75rem 1rem' }}>
          {rows.length === 0 ? (
            <p className="d-empty">Không có dữ liệu.</p>
          ) : (
            <div className="d-list">
              {rows.map((r, i) => (
                <div key={i} className="d-row">
                  <div className="d-row-main">
                    <div className="d-row-title">👤 {r.main}</div>
                    {r.sub && <div className="d-row-sub">{r.sub}</div>}
                  </div>
                  {r.date && <span className="d-row-date">{r.date}</span>}
                  {r.tag && <span className="d-pill" style={{ color: r.tagColor, background: r.tagBg }}>{r.tag}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function bookingBadge(b) {
  if (b.status === 'finished') return { label: 'Đã kết thúc', color: '#6b7280', bg: '#f3f4f6', dot: false }
  const now = new Date()
  const cur = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
  if (cur >= b.start_time && cur <= b.end_time) return { label: 'Đang diễn ra', color: '#16a34a', bg: '#dcfce7', dot: true }
  return { label: 'Sắp diễn ra', color: '#d97706', bg: '#fef3c7', dot: false }
}

function BookingList({ bookings }) {
  if (bookings.length === 0) {
    return <div style={emptyKanbanStyle}><p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>Không có lịch đặt hôm nay.</p></div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 300, overflowY: 'auto' }}>
      {bookings.map(b => {
        const isCar = b.resource_type?.includes('car')
        return (
          <div key={b.id} style={bookingCard(isCar)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#0f172a' }}>{isCar ? '🚗' : '🚪'} {b.resource_name}</span>
              <span style={timeBadgeStyle}>{b.start_time}–{b.end_time}</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569' }}>{b.title}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.15rem' }}>👤 {b.full_name}</div>
          </div>
        )
      })}
    </div>
  )
}

function bookingCard(isCar) {
  return {
    padding: '0.65rem 0.85rem', borderRadius: 8,
    borderLeft: `4px solid ${isCar ? '#0284c7' : '#0a5b35'}`,
    background: '#f8fafc', borderTop: '1px solid #e2e8f0',
    borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0',
  }
}

function statusBadge(bg, color) { 
  return { display: 'inline-block', padding: '0.1rem 0.4rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600, background: bg, color } 
}

function safeJson(str) {
  if (!str) return {}
  if (typeof str === 'object') return str
  try { return JSON.parse(str) } catch (_) { return {} }
}

function reqStatusStyle(status) {
  const map = {
    draft: { label: 'Nháp', color: '#6b7280', bg: '#f3f4f6', dot: '#9ca3af' },
    pending: { label: '⏳ Chờ duyệt', color: '#d97706', bg: '#fef3c7', dot: '#f59e0b' },
    in_progress: { label: '⚙️ Đang duyệt', color: '#2563eb', bg: '#dbeafe', dot: '#3b82f6' },
    approved: { label: '✅ Đã duyệt', color: '#16a34a', bg: '#dcfce7', dot: '#22c55e' },
    rejected: { label: '❌ Bị từ chối', color: '#dc2626', bg: '#fee2e2', dot: '#ef4444' },
    cancelled: { label: '🕓 Đã hủy', color: '#6b7280', bg: '#f3f4f6', dot: '#9ca3af' },
  }
  const s = map[status] || map.draft
  return {
    label: s.label,
    badge: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.15rem 0.55rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600, background: s.bg, color: s.color, whiteSpace: 'nowrap' },
    dot: s.dot,
  }
}

function countBadge(count, color) { 
  return { fontSize: '0.72rem', fontWeight: 700, color: '#fff', background: color, padding: '0.1rem 0.45rem', borderRadius: 20 } 
}

const loadingStyle = { color: '#64748b', padding: '3rem', textAlign: 'center', fontSize: '0.95rem' }
const pageTitleStyle = { fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }
const statLabelStyle = { fontSize: '0.82rem', color: '#64748b', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }
const statValueStyle = { fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }
const kanbanTitleStyle = { fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.85rem' }
const adminCardStyle = { background: '#fff', borderRadius: 12, padding: '1.25rem', border: '1px solid #e2e8f0' }
const kanbanColStyle = { background: '#fff', borderRadius: 12, padding: '1.25rem', border: '1px solid #e2e8f0', height: 'fit-content' }
const emptyKanbanStyle = { textAlign: 'center', padding: '1.5rem 1rem', border: '2px dashed #e2e8f0', borderRadius: 10 }
const emptyTextStyle = { color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }
const ticketCardStyle = { background: '#f8fafc', borderRadius: 8, padding: '0.65rem 0.85rem', marginBottom: '0.4rem', border: '1px solid #e2e8f0' }
const timeBadgeStyle = { color: '#fff', background: '#0a5b35', fontSize: '0.7rem', padding: '0.1rem 0.45rem', borderRadius: 4, fontWeight: 600, fontFamily: 'monospace' }
const deptTagStyle = { background: '#e2e8f0', padding: '0.05rem 0.35rem', borderRadius: 4, fontSize: '0.68rem', color: '#475569' }
const queueBadgeStyle = { fontSize: '0.72rem', fontWeight: 600, color: '#fff', background: '#0a5b35', padding: '0.1rem 0.45rem', borderRadius: 20 }
const sectionSubTitleStyle = { fontSize: '0.75rem', color: '#64748b', marginBottom: '0.4rem', fontWeight: 700 }
const mvOverlay = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)' }
const mvCard = { background: '#fff', borderRadius: 14, width: 520, maxWidth: '94vw', boxShadow: '0 25px 50px rgba(0,0,0,0.18)', overflow: 'hidden' }
const mvClose = { width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.9rem', color: '#64748b' }