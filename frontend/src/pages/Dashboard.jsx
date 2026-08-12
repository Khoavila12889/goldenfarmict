import React, { useEffect, useState, useCallback } from 'react'
import { getDashboardStats, getEmployeeByCode, getTickets, getTicketQueuePosition, apiUrl } from '../services/api'
import { formatDate } from '../utils/date'
import { Ticket, Calendar, Users, Monitor, Clock, AlertCircle, CheckCircle2, XCircle, ArrowRight } from 'lucide-react'
import AnnouncementsBox from '../components/AnnouncementsBox'

const statusOrder = ['Cho xu ly', 'Dang xu ly', 'Da xu ly', 'Da huy']

const statusMap = {
  'Cho xu ly': { label: '⏳ Chờ xử lý', color: '#d97706', bg: '#fef3c7' },
  'Dang xu ly': { label: '⚙️ Đang xử lý', color: '#2563eb', bg: '#dbeafe' },
  'Da xu ly': { label: '✅ Đã xử lý', color: '#16a34a', bg: '#dcfce7' },
  'Da huy': { label: '❌ Đã hủy', color: '#6b7280', bg: '#f3f4f6' },
}

export default function Dashboard() {
  const userRole = sessionStorage.getItem('user_role') || ''
  const userCode = sessionStorage.getItem('user_code') || ''
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

  // Lấy danh sách quyền động của User từ API
  useEffect(() => {
    if (isAdmin) return
    const token = sessionStorage.getItem('token')
    fetch(apiUrl(`/auth/permissions?employee_code=${userCode}&token=${token}&role=${userRole}`))
      .then(r => r.json())
      .then(d => setUserPerms(d.data || {}))
      .catch(() => setUserPerms({}))
  }, [userCode, userRole, isAdmin])

  // Kiểm tra module có được phép xem không
  const canViewModule = useCallback((moduleKey) => {
    if (isAdmin) return true
    if (userPerms && userPerms[moduleKey] !== undefined) {
      return !!userPerms[moduleKey].can_view
    }
    return true // Mặc định mở nếu chưa load xong
  }, [isAdmin, userPerms])

  const loadAll = useCallback(() => {
    getDashboardStats().then(r => setStats(r.data)).catch(() => {})
    if (!isAdmin && userCode) {
      getEmployeeByCode(userCode).then(r => {
        if (r.data?.id) {
          setEmp(r.data)
          getTickets().then(res => {
            const all = res.data?.data || []
            setMyTickets(all.filter(t => t.employee_id === r.data.id))
          }).catch(() => {})
        }
      }).catch(() => {})
    }
  }, [isAdmin, userCode])
  
  const loadQueuePos = useCallback(() => {
    if (!isAdmin && userCode) {
      getTicketQueuePosition(userCode).then(r => {
        setQueuePos(r.data)
      }).catch(() => {
        setQueuePos(null)
      })
    }
  }, [isAdmin, userCode])

  useEffect(() => { 
    loadAll()
    loadQueuePos()
    setLoading(false) 
  }, [loadAll, loadQueuePos])

  // SSE — Realtime EventSource
  useEffect(() => {
    let es = null
    let reconnectTimer = null
    
    function connect() {
      try {
        es = new EventSource(apiUrl('/events'))
        es.addEventListener('update_ticket', () => { loadAll(); loadQueuePos() })
        es.addEventListener('new_ticket', () => { loadAll(); loadQueuePos() })
        es.addEventListener('delete_ticket', () => { loadAll(); loadQueuePos() })
        es.addEventListener('booking_created', () => loadAll())
        es.addEventListener('booking_updated', () => loadAll())
        
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
  }, [loadAll, loadQueuePos])

  if (loading) {
    return (
      <div style={{ color: '#64748b', padding: '3rem', textAlign: 'center', fontSize: '0.95rem' }}>
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
    ] : []

    return (
      <div>
        <style>{`
          .grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; margin-bottom: 1.5rem; }
          .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1.5rem; }
          .stat-card { background: #fff; borderRadius: 12px; padding: 1.25rem; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; transition: transform 0.2s; }
          .stat-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          @media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } }
        `}</style>
        
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          📊 Hệ thống Quản lý GOLDENFARM ICT
        </h1>

        <div className="grid-4">
          {items.map(item => (
            <div key={item.label} className="stat-card">
              <div>
                <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>{item.label}</span>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>{item.value}</span>
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
          <div style={adminCard}>
            <h3 style={kanbanTitle}>🎫 Ticket theo trạng thái</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(stats?.tickets_by_status || []).length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>Không có ticket nào</p>
              ) : [...statusOrder].map(s => {
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
                        fontSize: '0.82rem', fontWeight: 600, color: statusMap[s]?.color || '#475569',
                        background: statusMap[s]?.bg || '#f1f5f9', padding: '0.2rem 0.55rem', borderRadius: 6,
                      }}>{statusMap[s]?.label || s}</span>
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

          <div style={adminCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ ...kanbanTitle, margin: 0 }}>📅 Lịch hôm nay</h3>
              <span style={{ fontSize: '0.75rem', color: '#0a5b35', background: '#e8f5e9', padding: '0.2rem 0.55rem', borderRadius: 20, fontWeight: 600 }}>
                {stats?.bookings_today?.length || 0} lịch
              </span>
            </div>
            <BookingList bookings={stats?.bookings_today || []} />
          </div>
        </div>
      </div>
    )
  }

  // ── 2. USER / HEAD DASHBOARD ──
  const pendingTickets = myTickets.filter(t => t.status === 'Cho xu ly' || t.status === 'Dang xu ly')
  const resolvedTickets = myTickets.filter(t => t.status === 'Da xu ly')
  const todayBooking = stats?.bookings_today || []

  const showBookings = canViewModule('bookings')
  const showTickets = canViewModule('tickets')

  return (
    <div>
      <style>{`
        .kanban-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem; }
        .kcard { transition: all 0.2s ease; }
        .kcard:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
      `}</style>

      <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        📊 Tổng quan
        {emp && <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#64748b' }}>— {emp.full_name} ({emp.department})</span>}
      </h1>

      <div className="kanban-grid">
        {/* Widget: Lịch hôm nay */}
        {showBookings && (
          <div style={kanbanCol}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ ...kanbanTitle, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Calendar size={18} color="#0a5b35" /> Lịch hôm nay
              </h3>
              <span style={countBadge(todayBooking.length, '#0a5b35')}>{todayBooking.length}</span>
            </div>
            {todayBooking.length === 0 ? (
              <div style={emptyKanban}>
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
                        <span style={timeBadge}>{b.start_time} – {b.end_time}</span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '0.3rem' }}>
                        {b.title || 'Sử dụng nội bộ'}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b' }}>
                        <span>👤 {b.full_name}</span>
                        {b.department && <span style={deptTag}>{b.department}</span>}
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
          <div style={kanbanCol}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.4rem' }}>
              <h3 style={{ ...kanbanTitle, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Ticket size={18} color="#2563eb" /> Ticket của tôi
              </h3>
              <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                <span style={countBadge(pendingTickets.length, '#d97706')}>chờ {pendingTickets.length}</span>
                {queuePos && queuePos.total_pending > 0 && queuePos.rank > 1 && (
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#fff', background: '#0a5b35', padding: '0.1rem 0.45rem', borderRadius: 20 }}>
                    #Hàng đợi: {queuePos.rank}
                  </span>
                )}
              </div>
            </div>

            {/* Pending Tickets */}
            {pendingTickets.length > 0 && (
              <>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.4rem', fontWeight: 700 }}>⏳ ĐANG CHỜ XỬ LÝ</div>
                {pendingTickets.map(t => {
                  const st = statusMap[t.status] || {}
                  return (
                    <div key={t.id} className="kcard" style={ticketCard}>
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
                <div style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.75rem 0 0.4rem', fontWeight: 700 }}>✅ ĐÃ XỬ LÝ GẦN ĐÂY</div>
                {resolvedTickets.slice(0, 2).map(t => (
                  <div key={t.id} className="kcard" style={ticketCard}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a', marginBottom: '0.2rem' }}>
                      #{t.id} — {t.title}
                    </div>
                    <span style={statusBadge('#dcfce7', '#16a34a')}>✅ Đã xong</span>
                  </div>
                ))}
              </>
            )}

            {myTickets.length === 0 && (
              <div style={emptyKanban}>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>Bạn chưa có ticket yêu cầu nào.</p>
              </div>
            )}
          </div>
        )}
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
    return <div style={emptyKanban}><p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>Không có lịch đặt hôm nay.</p></div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 300, overflowY: 'auto' }}>
      {bookings.map(b => {
        const isCar = b.resource_type?.includes('car')
        return (
          <div key={b.id} style={bookingCard(isCar)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#0f172a' }}>{isCar ? '🚗' : '🚪'} {b.resource_name}</span>
              <span style={timeBadge}>{b.start_time}–{b.end_time}</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569' }}>{b.title}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.15rem' }}>👤 {b.full_name}</div>
          </div>
        )
      })}
    </div>
  )
}

const kanbanTitle = { fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.85rem' }
const adminCard = { background: '#fff', borderRadius: 12, padding: '1.25rem', border: '1px solid #e2e8f0' }
const kanbanCol = { background: '#fff', borderRadius: 12, padding: '1.25rem', border: '1px solid #e2e8f0', height: 'fit-content' }
const emptyKanban = { textAlign: 'center', padding: '1.5rem 1rem', border: '2px dashed #e2e8f0', borderRadius: 10 }

function bookingCard(isCar) {
  return {
    padding: '0.65rem 0.85rem', borderRadius: 8,
    borderLeft: `4px solid ${isCar ? '#0284c7' : '#0a5b35'}`,
    background: '#f8fafc', borderTop: '1px solid #e2e8f0',
    borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0',
  }
}

const ticketCard = { background: '#f8fafc', borderRadius: 8, padding: '0.65rem 0.85rem', marginBottom: '0.4rem', border: '1px solid #e2e8f0' }
const timeBadge = { color: '#fff', background: '#0a5b35', fontSize: '0.7rem', padding: '0.1rem 0.45rem', borderRadius: 4, fontWeight: 600, fontFamily: 'monospace' }
function statusBadge(bg, color) { return { display: 'inline-block', padding: '0.1rem 0.4rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600, background: bg, color } }
const deptTag = { background: '#e2e8f0', padding: '0.05rem 0.35rem', borderRadius: 4, fontSize: '0.68rem', color: '#475569' }
function countBadge(count, color) { return { fontSize: '0.72rem', fontWeight: 700, color: '#fff', background: color, padding: '0.1rem 0.45rem', borderRadius: 20 } }