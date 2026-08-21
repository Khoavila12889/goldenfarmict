import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { getDashboardStats, getEmployeeByCode, getTickets, getTicketQueuePosition, getPendingApprovals, listApprovalRequests, approveRequest, rejectRequest, apiUrl } from '../services/api'
import { formatDate } from '../utils/date'
import { Ticket, Calendar, Users, Monitor, Clock, AlertCircle, CheckCircle2, XCircle, ArrowRight, CalendarOff } from 'lucide-react'
import AnnouncementsBox from '../components/AnnouncementsBox'

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
      await loadData()
      await loadPendingApprovals()
      await loadMyApprovals()
    } catch (_) { }
    setApprovingId(null)
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
          loadPendingApprovals()
          loadMyApprovals()
          loadData()
          if (isHead) {
            try {
              const d = JSON.parse(ev.data || '{}')
              showToast('info', `📥 Đơn mới chờ duyệt: ${(d.title || '').slice(0, 60)}`)
            } catch (_) { }
          }
        })

        // ─── Đơn được duyệt / từ chối → người gửi: cập nhật trạng thái + thông báo ───
        es.addEventListener('request_approved', (ev) => {
          loadPendingApprovals()
          loadMyApprovals()
          loadData()
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
          loadData()
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
  }, [loadData, token, isHead, userCode, showToast, loadPendingApprovals, loadMyApprovals])

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
      { label: 'Lịch đặt hôm nay', value: stats.bookings_today?.length || 0, icon: <Calendar size={24} color="#7c3aed" />, bg: '#f5f3ff' },
      { label: 'NV xin nghỉ/công tác', value: stats.pending_absences?.total_employees || 0, icon: <CalendarOff size={24} color="#0284c7" />, bg: '#f0f9ff' },
    ] : []

    return (
      <div>
        <style>{`
          .grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; margin-bottom: 1.5rem; }
          .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1.5rem; }
          .stat-card { background: #fff; border-radius: 12px; padding: 1.25rem; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; transition: transform 0.2s; }
          .stat-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          @media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } }
        `}</style>

        <h1 style={pageTitleStyle}>
          📊 Hệ thống Quản lý GOLDENFARM ICT
        </h1>

        {toast && (
          <div style={{
            position: 'fixed', top: 18, right: 18, zIndex: 1200, maxWidth: 360,
            padding: '0.7rem 1rem', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600,
            color: '#fff',
            background: toast.type === 'error' ? '#dc2626' : toast.type === 'success' ? '#16a34a' : '#00468C',
            boxShadow: '0 6px 18px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            {toast.text}
          </div>
        )}

        <div className="grid-4">
          {items.map(item => (
            <div key={item.label} className="stat-card">
              <div>
                <span style={statLabelStyle}>{item.label}</span>
                <span style={statValueStyle}>{item.value}</span>
              </div>
              <div style={{ width: 48, height: 48, borderRadius: 10, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.icon}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <AnnouncementsBox />
        </div>

        <div className="grid-2">
          <div style={adminCardStyle}>
            <h3 style={kanbanTitleStyle}>🎫 Ticket theo trạng thái</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(stats?.tickets_by_status || []).length === 0 ? (
                <p style={emptyTextStyle}>Không có ticket nào</p>
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
                        padding: '0.65rem 1rem', borderRadius: 8, background: expandedStatus === s ? '#f1f5f9' : '#f8fafc',
                        border: `1px solid ${expandedStatus === s ? '#cbd5e1' : '#f1f5f9'}`,
                        cursor: 'pointer', transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{
                        fontSize: '0.82rem', fontWeight: 600, color: STATUS_MAP[s]?.color || '#475569',
                        background: STATUS_MAP[s]?.bg || '#f1f5f9', padding: '0.2rem 0.55rem', borderRadius: 6,
                      }}>{STATUS_MAP[s]?.label || s}</span>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>{item.count}</span>
                    </div>

                    {expandedStatus === s && (
                      <div style={{ marginTop: '0.4rem', padding: '0.6rem 0.75rem', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        {loadingStatus ? (
                          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>Đang tải...</p>
                        ) : statusTickets.length === 0 ? (
                          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>Không có ticket.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 280, overflowY: 'auto' }}>
                            {statusTickets.map(t => (
                              <div key={t.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '0.45rem 0.65rem', borderRadius: 6, background: '#f8fafc', fontSize: '0.8rem',
                              }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ fontWeight: 600, color: '#0f172a' }}>#{t.id}</span>
                                  <span style={{ color: '#475569', marginLeft: '0.35rem' }}>{t.title}</span>
                                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                                    👤 {t.full_name} · {t.department || '—'}
                                  </div>
                                </div>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>{formatDate(t.created_at)}</span>
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

          <div style={adminCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ ...kanbanTitleStyle, margin: 0 }}>📅 Lịch hôm nay</h3>
              <span style={{ fontSize: '0.75rem', color: '#0a5b35', background: '#e8f5e9', padding: '0.2rem 0.55rem', borderRadius: 20, fontWeight: 600 }}>
                {stats?.bookings_today?.length || 0} lịch
              </span>
            </div>
            <BookingList bookings={stats?.bookings_today || []} />
          </div>
        </div>

        <div className="grid-2" style={{ marginTop: '1.5rem' }}>
          {/* Widget: NV Đi công tác hôm nay */}
          <div style={adminCardStyle}>
            <h3 style={kanbanTitleStyle}>🧳 Nhân viên đi công tác hôm nay ({stats?.trips_count || 0})</h3>
            {(stats?.trips_today || []).length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>Không có ai đi công tác hôm nay.</p>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 240, overflowY: 'auto' }}>
                  {stats.trips_today.slice(0, LIST_LIMIT).map(t => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: 8, borderLeft: '4px solid #0284c7' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#0f172a' }}>👤 {t.full_name} ({t.department})</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>📍 {t.destination}</div>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#475569', background: '#e2e8f0', padding: '0.1rem 0.4rem', borderRadius: 4 }}>{formatDate(t.start_date)} → {formatDate(t.end_date)}</span>
                    </div>
                  ))}
                </div>
                {stats.trips_today.length > LIST_LIMIT && (
                  <button style={viewAllBtnStyle} onClick={() => setViewDetail(detailRows('trips'))}>Xem tất cả ({stats.trips_today.length})</button>
                )}
              </>
            )}
          </div>

          {/* Widget: NV Nghỉ phép / việc hôm nay */}
          <div style={adminCardStyle}>
            <h3 style={kanbanTitleStyle}>🏖️ Nhân viên nghỉ phép / việc hôm nay ({stats?.leaves_count || 0})</h3>
            {(stats?.leaves_today || []).length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>Không có ai nghỉ hôm nay.</p>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 240, overflowY: 'auto' }}>
                  {stats.leaves_today.slice(0, LIST_LIMIT).map(l => (
                    <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: 8, borderLeft: '4px solid #e11d48' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#0f172a' }}>👤 {l.full_name} ({l.department})</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>📝 {l.destination || 'Nghỉ phép'}</div>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#475569', background: '#e2e8f0', padding: '0.1rem 0.4rem', borderRadius: 4 }}>{formatDate(l.start_date)} → {formatDate(l.end_date)}</span>
                    </div>
                  ))}
                </div>
                {stats.leaves_today.length > LIST_LIMIT && (
                  <button style={viewAllBtnStyle} onClick={() => setViewDetail(detailRows('leaves'))}>Xem tất cả ({stats.leaves_today.length})</button>
                )}
              </>
            )}
          </div>

          {/* Widget: NV đang xin nghỉ phép / công tác (chờ duyệt) */}
          <div style={adminCardStyle}>
            <h3 style={kanbanTitleStyle}>🧑💼 NV đang xin nghỉ phép / công tác ({stats?.pending_absences?.total_employees || 0} NV)</h3>
            {(stats?.pending_absences?.items || []).length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>Không có ai đang xin nghỉ phép / công tác.</p>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 240, overflowY: 'auto' }}>
                  {stats.pending_absences.items.slice(0, LIST_LIMIT).map(a => (
                    <div key={a.request_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: 8, borderLeft: '4px solid #0284c7' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#0f172a' }}>👤 {a.full_name} ({a.department})</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{a.kind === 'leave' ? '🏖️ Nghỉ phép' : '🧳 Công tác'} · {a.title}</div>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#d97706', background: '#fef3c7', padding: '0.1rem 0.4rem', borderRadius: 4, whiteSpace: 'nowrap' }}>⏳ Chờ duyệt</span>
                    </div>
                  ))}
                </div>
                {stats.pending_absences.items.length > LIST_LIMIT && (
                  <button style={viewAllBtnStyle} onClick={() => setViewDetail(detailRows('absences'))}>Xem tất cả ({stats.pending_absences.items.length})</button>
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
      <style>{`
        .kanban-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem; }
        .kcard { transition: all 0.2s ease; }
        .kcard:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
      `}</style>

      <h1 style={pageTitleStyle}>
        📊 Tổng quan
        {emp && <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#64748b' }}>— {emp.full_name} ({emp.department})</span>}
      </h1>

      {toast && (
        <div style={{
          position: 'fixed', top: 18, right: 18, zIndex: 1200, maxWidth: 360,
          padding: '0.7rem 1rem', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600,
          color: '#fff',
          background: toast.type === 'error' ? '#dc2626' : toast.type === 'success' ? '#16a34a' : '#00468C',
          boxShadow: '0 6px 18px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          {toast.text}
        </div>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <AnnouncementsBox compact />
      </div>

      {/* Trưởng phòng: duyệt đơn nghỉ phép / công tác */}
      {isHead && (
        <div style={{ ...kanbanColStyle, marginBottom: '1.25rem' }}>
          <h3 style={{ ...kanbanTitleStyle, margin: 0 }}>🗂️ Đơn chờ duyệt ({pendingReqs.length})</h3>
          {pendingReqs.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>Không có đơn chờ duyệt nào.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: 320, overflowY: 'auto' }}>
              {pendingReqs.map(r => {
                const meta = safeJson(r.metadata_json || r.metadata || '{}')
                const isLeave = meta.kind !== 'business_trip'
                return (
                  <div key={r.id} style={ticketCardStyle}>
                    <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#0f172a', marginBottom: '0.2rem' }}>
                      #{r.id} — {r.title}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b', whiteSpace: 'pre-line', marginBottom: '0.3rem' }}>
                      👤 {r.requester_name} · {r.requester_dept} · {formatDate(meta.start_date)} → {formatDate(meta.end_date)}
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button
                        onClick={() => handleApprove(r, 'approve')}
                        disabled={approvingId === r.id}
                        style={{ padding: '0.28rem 0.7rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer' }}
                      >{approvingId === r.id ? 'Đang xử lý...' : isLeave ? '✅ Duyệt nghỉ phép' : '✅ Duyệt công tác'}</button>
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
        </div>
      )}

      {/* User: trạng thái đơn nghỉ phép / công tác của mình */}
      {!isAdmin && (
        <div style={{ ...kanbanColStyle, marginBottom: '1.25rem' }}>
          <h3 style={{ ...kanbanTitleStyle, margin: 0 }}>📋 Trạng thái đơn của tôi ({myReqs.length})</h3>
          {myReqs.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>Bạn chưa có đơn nghỉ phép / công tác nào.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 320, overflowY: 'auto' }}>
              {myReqs.map(r => {
                const st = reqStatusStyle(r.status)
                return (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.7rem', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#0f172a' }}>#{r.id} — {r.title}</div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{formatDate(r.created_at)}</div>
                    </div>
                    <span style={st.badge}>{st.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Trưởng phòng: NV phòng đang xin nghỉ/công tác */}
      {isHead && (
        <div style={{ ...kanbanColStyle, marginBottom: '1.25rem' }}>
          <h3 style={{ ...kanbanTitleStyle, margin: 0 }}>🧑💼 NV phòng đang xin nghỉ / công tác ({stats?.pending_absences?.total_employees || 0} NV)</h3>
          {(stats?.pending_absences?.items || []).length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>Không có nhân viên nào đang xin nghỉ / công tác.</p>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 260, overflowY: 'auto' }}>
                {stats.pending_absences.items.slice(0, LIST_LIMIT).map(a => (
                  <div key={a.request_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.7rem', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', borderLeft: '4px solid #0284c7' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#0f172a' }}>
                        👤 {a.full_name} ({a.department})
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        {a.kind === 'leave' ? '🏖️ Nghỉ phép' : '🧳 Công tác'}
                        {a.start_date && a.end_date && ` · ${formatDate(a.start_date)} → ${formatDate(a.end_date)}`}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.7rem', color: '#d97706', background: '#fef3c7', padding: '0.1rem 0.45rem', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap' }}>⏳ Chờ duyệt</span>
                  </div>
                ))}
              </div>
              {stats.pending_absences.items.length > LIST_LIMIT && (
                <button style={viewAllBtnStyle} onClick={() => setViewDetail(detailRows('absences', emp?.department || stats.pending_absences.items[0]?.department))}>Xem tất cả ({stats.pending_absences.items.length})</button>
              )}
            </>
          )}
        </div>
      )}

      <div className="kanban-grid">
        {/* Widget: Lịch hôm nay */}
        {showBookings && (
          <div style={kanbanColStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
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
          <div style={kanbanColStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.4rem' }}>
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

      {viewDetail && <ModalList title={viewDetail.title} rows={viewDetail.rows} onClose={() => setViewDetail(null)} />}
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
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>Không có dữ liệu.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {rows.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.4rem', borderRadius: 8, borderBottom: '1px solid #f1f5f9', background: i % 2 ? '#fafcfe' : '#fff' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#0f172a' }}>👤 {r.main}</div>
                    {r.sub && <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '0.1rem' }}>{r.sub}</div>}
                  </div>
                  {r.date && <span style={{ fontSize: '0.7rem', color: '#64748b', whiteSpace: 'nowrap' }}>{r.date}</span>}
                  {r.tag && <span style={{ padding: '0.1rem 0.45rem', borderRadius: 20, fontSize: '0.68rem', fontWeight: 600, color: r.tagColor, background: r.tagBg, whiteSpace: 'nowrap' }}>{r.tag}</span>}
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
  const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
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
    draft: { label: 'Nháp', color: '#6b7280', bg: '#f3f4f6' },
    pending: { label: '⏳ Chờ duyệt', color: '#d97706', bg: '#fef3c7' },
    in_progress: { label: '⚙️ Đang duyệt', color: '#2563eb', bg: '#dbeafe' },
    approved: { label: '✅ Đã duyệt', color: '#16a34a', bg: '#dcfce7' },
    rejected: { label: '❌ Bị từ chối', color: '#dc2626', bg: '#fee2e2' },
    cancelled: { label: '🕓 Đã hủy', color: '#6b7280', bg: '#f3f4f6' },
  }
  const s = map[status] || map.draft
  return {
    label: s.label,
    badge: { display: 'inline-block', padding: '0.1rem 0.5rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600, background: s.bg, color: s.color, whiteSpace: 'nowrap' },
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
const viewAllBtnStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: '0.5rem',
  padding: '0.4rem 0.6rem', background: '#f0f9ff', color: '#00468C', border: '1px solid #bfdbfe',
  borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
}
const mvOverlay = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)' }
const mvCard = { background: '#fff', borderRadius: 14, width: 540, maxWidth: '94vw', boxShadow: '0 25px 50px rgba(0,0,0,0.18)', overflow: 'hidden' }
const mvClose = { width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.9rem', color: '#64748b' }