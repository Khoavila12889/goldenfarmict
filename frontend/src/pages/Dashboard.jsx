import React, { useEffect, useState, useCallback } from 'react'
import { getDashboardStats, getEmployeeByCode, getTickets, getTicketQueuePosition } from '../services/api'
import { formatDate } from '../utils/formatters'

const statusOrder = ['Cho xu ly', 'Dang xu ly', 'Da xu ly', 'Da huy']

const statusMap = {
  'Cho xu ly': { label: '⏳ Chờ xử lý', color: '#d97706', bg: '#fef3c7' },
  'Dang xu ly': { label: '⚙️ Đang xử lý', color: '#2563eb', bg: '#dbeafe' },
  'Da xu ly': { label: '✅ Đã xử lý', color: '#16a34a', bg: '#dcfce7' },
  'Da huy': { label: '❌ Đã hủy', color: '#6b7280', bg: '#f3f4f6' },
}

export default function Dashboard() {
  const userRole = sessionStorage.getItem('user_role')
  const userCode = sessionStorage.getItem('user_code')
  const isAdmin = userRole === 'admin'

  const [stats, setStats] = useState(null)
  const [emp, setEmp] = useState(null)
  const [myTickets, setMyTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedStatus, setExpandedStatus] = useState(null)
  const [statusTickets, setStatusTickets] = useState([])
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [queuePos, setQueuePos] = useState(null)

  const loadAll = useCallback(() => {
    getDashboardStats().then(r => setStats(r.data)).catch(() => {})
    if (!isAdmin && userCode) {
      getEmployeeByCode(userCode).then(r => {
        if (r.data.id) {
          setEmp(r.data)
          getTickets().then(res => {
            const all = res.data?.data || []
            setMyTickets(all.filter(t => t.employee_id === r.data.id))
          }).catch(() => {})
        }
      }).catch(() => {})
    }
  }, [isAdmin, userCode])
  
  // Load queue position for non-admin users
  const loadQueuePos = useCallback(() => {
    if (!isAdmin && userCode) {
      getTicketQueuePosition(userCode).then(r => {
        setQueuePos(r.data)
      }).catch(() => {
        // Ignore errors (e.g., no pending tickets)
        setQueuePos(null)
      })
    }
  }, [isAdmin, userCode])

  useEffect(() => { loadAll(); loadQueuePos(); setLoading(false) }, [loadAll, loadQueuePos])

  // SSE — realtime updates for tickets & bookings with auto-reconnect
  useEffect(() => {
    let es = null
    let reconnectTimer = null
    
    function connect() {
      try {
        es = new EventSource('/api/events')
        
        es.addEventListener('update_ticket', () => { loadAll(); loadQueuePos() })
        es.addEventListener('new_ticket', () => { loadAll(); loadQueuePos() })
        es.addEventListener('delete_ticket', () => { loadAll(); loadQueuePos() })
        es.addEventListener('booking_created', () => loadAll())
        es.addEventListener('booking_updated', () => loadAll())
        
        es.onerror = () => {
          if (es) es.close()
          // Auto reconnect after 3 seconds
          reconnectTimer = setTimeout(connect, 3000)
        }
      } catch (err) {
        reconnectTimer = setTimeout(connect, 3000)
      }
    }
    
    connect()
    
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (es) es.close()
    }
  }, [loadAll, loadQueuePos])

  // Tick every 30s to refresh time-based booking badges
  const [, setTick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(iv)
  }, [])

  if (loading) {
    return <div style={{ color: '#64748b', padding: '2rem', textAlign: 'center', fontSize: '0.95rem' }}>🔄 Đang tải...</div>
  }

  // ── ADMIN DASHBOARD ──
  if (isAdmin) {
    const items = stats ? [
      { label: 'Tổng nhân viên', value: stats.total_employees, icon: '👥', bg: '#eff6ff' },
      { label: 'Thiết bị quản lý', value: stats.total_equipment, icon: '💻', bg: '#f0fdf4' },
      { label: 'Ticket chờ xử lý', value: stats.pending_tickets, icon: '🎫', bg: '#fffbeb' },
      { label: 'Lịch đặt hôm nay', value: stats.bookings_today?.length || 0, icon: '📅', bg: '#fdf2f8' },
    ] : []

    return (
      <div>
        <style>{`
          .grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; margin-bottom: 1.5rem; }
          .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1.5rem; }
          @media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } }
        `}</style>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          📊 Hệ Thống Quản Lý ICT GoldenFarm
        </h1>

        <div className="grid-4">
          {items.map(item => (
            <div key={item.label} style={{
              background: '#fff', borderRadius: 12, padding: '1.25rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500, display: 'block', marginBottom: '0.25rem' }}>{item.label}</span>
                <span style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a' }}>{item.value}</span>
              </div>
              <div style={{ width: 48, height: 48, borderRadius: 10, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>{item.icon}</div>
            </div>
          ))}
        </div>

        <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
          <div style={adminCard}>
            <h3 style={kanbanTitle}>🎫 Ticket theo trạng thái</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(stats?.tickets_by_status || []).length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>Không có ticket</p>
              : [...statusOrder].map(s => {
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
                        padding: '0.6rem 1rem', borderRadius: 8, background: expandedStatus === s ? '#f1f5f9' : '#f8fafc',
                        border: `1px solid ${expandedStatus === s ? '#cbd5e1' : '#f1f5f9'}`,
                        cursor: 'pointer', transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{
                        fontSize: '0.85rem', fontWeight: 600, color: statusMap[s]?.color || '#475569',
                        background: statusMap[s]?.bg || '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: 6,
                      }}>{statusMap[s]?.label || s}</span>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>{item.count}</span>
                    </div>
                    {expandedStatus === s && (
                      <div style={{ marginTop: '0.4rem', padding: '0.5rem 0.75rem', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        {loadingStatus ? (
                          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>Đang tải...</p>
                        ) : statusTickets.length === 0 ? (
                          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>Không có ticket.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 300, overflowY: 'auto' }}>
                            {statusTickets.map(t => (
                              <div key={t.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '0.4rem 0.6rem', borderRadius: 6, background: '#f8fafc', fontSize: '0.8rem',
                              }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ fontWeight: 600, color: '#0f172a' }}>#{t.id}</span>
                                  <span style={{ color: '#475569', marginLeft: '0.3rem' }}>{t.title}</span>
                                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                                    👤 {t.full_name} · {t.department || 'N/A'} · {t.priority === 'Khan cap' ? '🔴' : t.priority === 'Quan trong' ? '🟡' : '🟢'} {t.priority}
                                  </div>
                                </div>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>📅 {formatDate(t.created_at)}</span>
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
              <span style={{ fontSize: '0.75rem', color: '#1e4fa8', background: '#eff6ff', padding: '0.2rem 0.5rem', borderRadius: 4, fontWeight: 500 }}>{stats?.bookings_today?.length || 0} lịch</span>
            </div>
            <BookingList bookings={stats?.bookings_today || []} />
          </div>
        </div>
      </div>
    )
  }

  // ── USER DASHBOARD ──
  const pendingTickets = myTickets.filter(t => t.status === 'Cho xu ly' || t.status === 'Dang xu ly')
  const resolvedTickets = myTickets.filter(t => t.status === 'Da xu ly')
  const todayBooking = stats?.bookings_today || []

  return (
    <div>
      <style>{`
        .kanban-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
        .kcard { transition: all 0.2s ease; }
        .kcard:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
        @media (max-width: 768px) { .kanban-grid { grid-template-columns: 1fr; } }
      `}</style>

      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        📊 Tổng quan
        {emp && <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#64748b' }}>— {emp.full_name} ({emp.department})</span>}
      </h1>

      <div className="kanban-grid">
        {/* Kanban: Booking hôm nay */}
        <div style={kanbanCol}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <h3 style={{ ...kanbanTitle, margin: 0 }}>📅 Lịch hôm nay</h3>
            <span style={countBadge(todayBooking.length, '#1e4fa8')}>{todayBooking.length}</span>
          </div>
          {todayBooking.length === 0 ? (
            <div style={emptyKanban}>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>Hôm nay không có lịch đặt.</p>
              <p style={{ color: '#cbd5e1', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>Xe và phòng họp đều trống.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {todayBooking.map(b => {
                const isCar = b.resource_type?.includes('car')
                const badge = bookingBadge(b)
                return (
                  <div key={b.id} className="kcard" style={{
                    ...bookingCard(isCar),
                    ...(badge.dot ? { borderLeft: '4px solid #22c55e' } : {}),
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {badge.dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px #22c55e' }} />}
                        {isCar ? '🚗' : '🚪'} {b.resource_name}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: badge.color, background: badge.bg, padding: '0.15rem 0.45rem', borderRadius: 4 }}>{badge.label}</span>
                        <span style={timeBadge}>{b.start_time} – {b.end_time}</span>
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.35rem', fontWeight: 500 }}>
                      <span style={{ color: '#64748b' }}>Mục đích:</span> {b.title || 'Sử dụng nội bộ'}
                    </div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontSize: '0.75rem', paddingTop: '0.35rem', borderTop: '1px dashed #f1f5f9', color: '#64748b',
                    }}>
                      <span>👤 {b.full_name}</span>
                      {b.department && <span style={deptTag}>{b.department}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Kanban: Ticket của tôi */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <h3 style={{ ...kanbanTitle, margin: 0 }}>🎫 Ticket của tôi</h3>
            <span style={countBadge(pendingTickets.length, '#d97706')}>chờ {pendingTickets.length}</span>
            {queuePos && queuePos.total_pending > 0 && queuePos.rank > 1 && (
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#fff',
                background: '#00468C',
                padding: '0.1rem 0.5rem',
                borderRadius: 20
              }}>
                📊 Hàng đợi: #{queuePos.rank} ({queuePos.pending_before} ticket trước)
              </span>
            )}
          </div>

          {/* Pending tickets */}
          {pendingTickets.length > 0 && (
            <>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.4rem', fontWeight: 500 }}>⏳ ĐANG CHỜ XỬ LÝ</div>
              {pendingTickets.map(t => {
                const st = statusMap[t.status] || {}
                return (
                  <div key={t.id} className="kcard" style={ticketCard}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#0f172a', marginBottom: '0.2rem' }}>
                      #{t.id} — {t.title}
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                      <span style={statusBadge(st.bg, st.color)}>{st.label}</span>
                      <span style={prioBadge}>{t.priority === 'Khan cap' ? '🔴' : t.priority === 'Quan trong' ? '🟡' : '🟢'} {t.priority}</span>
                    </div>
                    {t.description && <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.4 }}>{t.description}</div>}
                    {t.resolution && (
                      <div style={{ marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px solid #f1f5f9' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.8rem', marginBottom: '0.2rem' }}>📝 Phản hồi từ IT:</div>
                        <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>{t.resolution}</div>
                      </div>
                    )}
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.3rem' }}>📅 {formatDate(t.created_at)}</div>
                  </div>
                )
              })}
            </>
          )}

          {/* Resolved tickets (up to 2) */}
          {resolvedTickets.length > 0 && (
            <>
              <div style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.75rem 0 0.4rem', fontWeight: 500 }}>✅ ĐÃ XỬ LÝ</div>
              {resolvedTickets.slice(0, 2).map(t => (
                <div key={t.id} className="kcard" style={ticketCard}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#0f172a', marginBottom: '0.2rem' }}>
                    #{t.id} — {t.title}
                  </div>
                  <span style={statusBadge('#dcfce7', '#16a34a')}>✅ Đã xử lý</span>
                  {t.resolution && <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.3rem', lineHeight: 1.4 }}>📝 {t.resolution}</div>}
                </div>
              ))}
              {resolvedTickets.length > 2 && (
                <div style={{ fontSize: '0.8rem', color: '#1e4fa8', textAlign: 'center', padding: '0.5rem', cursor: 'pointer' }}
                  onClick={() => window.location.href = '/tickets'}>
                  +{resolvedTickets.length - 2} ticket đã xử lý khác →
                </div>
              )}
            </>
          )}

          {myTickets.length === 0 && (
            <div style={emptyKanban}>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>Bạn chưa gửi yêu cầu nào.</p>
              <p style={{ color: '#cbd5e1', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>Truy cập mục Tickets để gửi yêu cầu hỗ trợ.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function bookingBadge(b) {
  if (b.status === 'finished') return { label: '✅ Đã kết thúc', color: '#6b7280', bg: '#f3f4f6', dot: false }
  const now = new Date()
  const cur = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
  if (cur >= b.start_time && cur <= b.end_time) return { label: '🟢 Đang diễn ra', color: '#16a34a', bg: '#dcfce7', dot: true }
  if (cur < b.start_time) return { label: '⏳ Sắp diễn ra', color: '#d97706', bg: '#fef3c7', dot: false }
  return { label: '✅ Hoàn thành', color: '#16a34a', bg: '#dcfce7', dot: false }
}

// ── Sub-components for user Kanban ──

function BookingList({ bookings }) {
  if (bookings.length === 0) {
    return (
      <div style={emptyKanban}>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>Không có lịch đặt hôm nay.</p>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 320, overflowY: 'auto' }}>
      {bookings.map(b => {
        const isCar = b.resource_type?.includes('car')
        const badge = bookingBadge(b)
        return (
          <div key={b.id} style={{
            ...bookingCard(isCar),
            ...(badge.dot ? { borderLeft: '4px solid #22c55e' } : {}),
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.3rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                {badge.dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px #22c55e' }} />}
                {isCar ? '🚗' : '🚪'} {b.resource_name}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: badge.color, background: badge.bg, padding: '0.15rem 0.45rem', borderRadius: 4 }}>{badge.label}</span>
                <span style={timeBadge}>{b.start_time}–{b.end_time}</span>
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#475569' }}>
              <span style={{ color: '#64748b' }}>Mục đích:</span> {b.title}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>👤 {b.full_name}{b.department ? ` · ${b.department}` : ''}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Styles ──

const kanbanTitle = { fontSize: '1.05rem', fontWeight: 600, color: '#0f172a', marginBottom: '1rem' }
const adminCard = {
  background: '#fff', borderRadius: 12, padding: '1.5rem',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9',
}
const kanbanCol = {
  background: '#fff', borderRadius: 14, padding: '1.25rem',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9',
  height: 'fit-content',
}
const emptyKanban = {
  textAlign: 'center', padding: '2rem 1rem', border: '2px dashed #e2e8f0', borderRadius: 10,
}

function bookingCard(isCar) {
  return {
    padding: '0.75rem 1rem', borderRadius: 10,
    borderLeft: `4px solid ${isCar ? '#0284c7' : '#10b981'}`,
    background: '#fff', borderTop: '1px solid #f1f5f9',
    borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9',
  }
}

const ticketCard = {
  background: '#fff', borderRadius: 12, padding: '0.85rem 1rem',
  marginBottom: '0.5rem', border: '1px solid #f1f5f9',
  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
}

const timeBadge = {
  color: '#fff', background: '#1e293b', fontSize: '0.72rem',
  padding: '0.1rem 0.5rem', borderRadius: 4, fontWeight: 600,
  fontFamily: 'monospace', whiteSpace: 'nowrap',
}

function statusBadge(bg, color) {
  return {
    display: 'inline-block', padding: '0.1rem 0.45rem', borderRadius: 20,
    fontSize: '0.72rem', fontWeight: 600, background: bg, color,
  }
}

const prioBadge = {
  display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
  padding: '0.1rem 0.45rem', borderRadius: 20, fontSize: '0.72rem',
  fontWeight: 500, background: '#f8fafc', color: '#475569',
}

const deptTag = {
  background: '#f1f5f9', padding: '0.1rem 0.4rem', borderRadius: 4,
  fontSize: '0.7rem', color: '#475569',
}

function countBadge(count, color) {
  return {
    fontSize: '0.75rem', fontWeight: 600, color: '#fff',
    background: color, padding: '0.1rem 0.5rem', borderRadius: 20,
  }
}
