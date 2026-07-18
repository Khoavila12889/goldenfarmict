import React, { useState, useCallback, useEffect, useMemo, useLayoutEffect } from 'react'
import '../../styles/booking.css'
import useScheduler from '../../hooks/useScheduler'
import useCurrentTime from '../../hooks/useCurrentTime'
import { isExpired, isUpcoming, getResourceIcon, resourceColor } from '../../utils/bookingUtils'
import { createResource, deleteResource, getResources } from '../../services/api'
import BookingSkeleton from '../../components/booking/BookingSkeleton'
import BookingToolbar from '../../components/booking/BookingToolbar'
import BookingGrid from '../../components/booking/BookingGrid'
import BookingContextMenu from '../../components/booking/BookingContextMenu'
import BookingDrawer from '../../components/booking/BookingDrawer'
import BookingDialog from '../../components/booking/BookingDialog'
import BusinessTripPanel from '../../components/booking/BusinessTripPanel'

export default function BookingPage() {
  const {
    employee, resources, filteredResources, dateSet,
    bookings, loading, filterDate, filterType, filterStatus,
    selectedBooking, setFilter, refresh, selectBooking,
    handleCreateBooking, handleFinishBooking,
  } = useScheduler()

  const { isWithinGrid, gridOffset } = useCurrentTime()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const [darkMode, setDarkMode] = useState(() => {
    return sessionStorage.getItem('bk_dark_mode') === 'true'
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [tab, setTab] = useState('bookings')

  // Resource management
  const userRole = sessionStorage.getItem('user_role')
  const isAdmin = userRole === 'admin'
  const [resDialogOpen, setResDialogOpen] = useState(false)
  const [allResources, setAllResources] = useState([])
  const [newResName, setNewResName] = useState('')
  const [newResType, setNewResType] = useState('car')
  const [newResDesc, setNewResDesc] = useState('')
  const [resMsg, setResMsg] = useState('')

  async function loadAllResources() {
    try {
      const r = await getResources()
      setAllResources(r.data?.data || [])
    } catch {}
  }

  async function handleCreateResource() {
    if (!newResName.trim()) { setResMsg('Vui lòng nhập tên tài nguyên.'); return }
    try {
      await createResource({ type: newResType, name: newResName.trim(), description: newResDesc.trim() })
      setNewResName(''); setNewResDesc(''); setResMsg('')
      await loadAllResources()
    } catch { setResMsg('Lỗi kết nối') }
  }

  async function handleDeleteResource(id) {
    if (!window.confirm('Xoá tài nguyên này?')) return
    try {
      const r = await deleteResource(id)
      if (r.data?.success === false) { setResMsg(r.data?.error || 'Không thể xoá'); return }
      await loadAllResources()
    } catch { setResMsg('Lỗi kết nối') }
  }

  const [hiddenResources, setHiddenResources] = useState(new Set())

  const toggleResource = useCallback((id) => {
    setHiddenResources(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const visibleResources = useMemo(() => {
    if (!hiddenResources.size) return filteredResources
    return filteredResources.filter(r => !hiddenResources.has(r.id))
  }, [filteredResources, hiddenResources])

  const isCar = (type) => type === 'car'

  useLayoutEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark-mode')
    } else {
      document.documentElement.classList.remove('dark-mode')
    }
    sessionStorage.setItem('bk_dark_mode', String(darkMode))
  }, [darkMode])

  const filteredBookings = useMemo(() => {
    if (!searchTerm.trim()) return bookings
    const q = searchTerm.toLowerCase().trim()
    return bookings.filter(b =>
      (b.title && b.title.toLowerCase().includes(q)) ||
      (b.full_name && b.full_name.toLowerCase().includes(q)) ||
      (b.department && b.department.toLowerCase().includes(q)) ||
      (b.notes && b.notes.toLowerCase().includes(q))
    )
  }, [bookings, searchTerm])

  const [tripDialogRequest, setTripDialogRequest] = useState(0)

  const handleNewBooking = useCallback(() => {
    setDialogOpen(true)
  }, [])

  const handleNewTrip = useCallback(() => {
    setTripDialogRequest(v => v + 1)
  }, [])

  const handleDialogSubmit = useCallback(async (data) => {
    return await handleCreateBooking(data)
  }, [handleCreateBooking])

  const handleContextMenu = useCallback((booking, x, y) => {
    selectBooking(booking)
    setContextMenu({ booking, position: { x, y } })
  }, [selectBooking])

  const handleFinishContext = useCallback(async (id) => {
    setContextMenu(null)
    await handleFinishBooking(id)
  }, [handleFinishBooking])

  const handleEditContext = useCallback((booking) => {
    setDialogOpen(true)
  }, [])

  useEffect(() => {
    function handleKeyDown(e) {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === 'Escape') {
        if (contextMenu) setContextMenu(null)
        else if (dialogOpen) setDialogOpen(false)
        else if (drawerOpen) setDrawerOpen(false)
        else if (selectedBooking) selectBooking(selectedBooking)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        if (tab === 'trips') {
          handleNewTrip()
        } else {
          setDialogOpen(true)
        }
        return
      }
      if (e.key === 'F5') {
        e.preventDefault()
        refresh()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault()
        if (selectedBooking && !isExpired(selectedBooking) && selectedBooking.status === 'active') {
          setDialogOpen(true)
        }
        return
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [contextMenu, dialogOpen, drawerOpen, refresh, selectedBooking, tab, handleNewTrip, selectBooking])

  return (
    <div className="booking-module">
      <div className={`bk-layout${drawerOpen ? ' bk-layout-drawer-open' : ''}`}>
        <div className="bk-layout-main">
          <div className="bk-tabs">
            <button className={`bk-tab${tab === 'bookings' ? ' active' : ''}`} onClick={() => setTab('bookings')}>
              📅 Đặt lịch
            </button>
            <button className={`bk-tab${tab === 'trips' ? ' active' : ''}`} onClick={() => setTab('trips')}>
              🧳 Công tác
            </button>
          </div>

          {tab === 'trips' ? (
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <BusinessTripPanel
                employee={employee}
                openDialog={tripDialogRequest}
              />
            </div>
          ) : loading && bookings.length === 0 ? (
            <BookingSkeleton />
          ) : (
            <>
              <BookingToolbar
                tab={tab}
                onNewBooking={handleNewBooking}
                onNewTrip={handleNewTrip}
                filterDate={filterDate}
                filterType={filterType}
                onFilterChange={(d, t, s) => setFilter(d, t, s)}
                bookings={filteredBookings}
                isAdmin={isAdmin}
                onManageResources={() => { setResDialogOpen(true); loadAllResources() }}
              />

              <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto' }}>
                  <BookingGrid
                    resources={resources}
                    bookings={filteredBookings}
                    filteredResources={filteredResources}
                    hiddenResources={hiddenResources}
                    visibleResources={visibleResources}
                    onToggleResource={toggleResource}
                    filterDate={filterDate}
                    selectedBooking={selectedBooking}
                    currentTimeMinutes={isWithinGrid ? gridOffset : -1}
                    onSelect={selectBooking}
                    onContextMenu={handleContextMenu}
                    refresh={refresh}
                  />
              </div>

              {selectedBooking && (
                <div className="bt-detail" onClick={() => selectBooking(selectedBooking)}>
                  <div className="bt-detail-card" onClick={e => e.stopPropagation()}>
                    <div className="bt-detail-header">
                      <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                        {getResourceIcon(selectedBooking.resource_type)} {selectedBooking.resource_name} — {selectedBooking.title}
                      </span>
                      <button className="bk-dialog-close" onClick={() => selectBooking(selectedBooking)}>✕</button>
                    </div>

                    <div className="bt-detail-body">
                      <div className="bt-detail-row">
                        <span className="bt-detail-label">Giờ</span>
                        <span className="bt-detail-value">🕐 {selectedBooking.start_time} → {selectedBooking.end_time}</span>
                      </div>
                      <div className="bt-detail-row">
                        <span className="bt-detail-label">Nhân viên</span>
                        <span className="bt-detail-value">👤 {selectedBooking.full_name} ({selectedBooking.department || 'N/A'})</span>
                      </div>
                      {selectedBooking.notes && (
                        <div className="bt-detail-row">
                          <span className="bt-detail-label">Ghi chú</span>
                          <span className="bt-detail-value">📎 {selectedBooking.notes}</span>
                        </div>
                      )}
                      {selectedBooking.status === 'finished' && selectedBooking.completed_at && (() => {
                        const expected = new Date(`${selectedBooking.book_date}T${selectedBooking.end_time}`)
                        const actual = new Date(selectedBooking.completed_at)
                        const diffMin = Math.round((actual - expected) / 60000)
                        const deltaText = diffMin < -1
                          ? `✓ hoàn thành sớm ${Math.abs(diffMin)} phút`
                          : diffMin > 1
                            ? `✗ trễ ${diffMin} phút`
                            : '✓ đúng giờ'
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
                          {(() => {
                            const expired = isExpired(selectedBooking)
                            const upcoming = isUpcoming(selectedBooking)
                            if (selectedBooking.status === 'finished') {
                              return <span className="bt-card-badge" style={{
                                background: 'rgba(100,116,139,0.15)', color: '#6b7280',
                              }}>✅ Đã kết thúc</span>
                            }
                            if (expired) {
                              return <span className="bt-card-badge" style={{
                                background: 'rgba(239,68,68,0.12)', color: '#dc2626',
                              }}>⏰ Đã hết giờ</span>
                            }
                            if (upcoming) {
                              return <span className="bt-card-badge" style={{
                                background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                              }}>🟡 Sắp diễn ra</span>
                            }
                            return <span className="bt-card-badge" style={{
                              background: 'rgba(34,197,94,0.15)', color: '#16a34a',
                            }}>🟢 Đang sử dụng</span>
                          })()}
                        </span>
                      </div>
                    </div>

                    <div className="bt-detail-actions">
                      {selectedBooking.status === 'active' && !isExpired(selectedBooking) && !isUpcoming(selectedBooking) && (
                        <button className="bk-btn bk-btn-sm" onClick={() => handleFinishBooking(selectedBooking.id)}>
                          ✅ Kết thúc
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <BookingDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          filterDate={filterDate}
          filterType={filterType}
          filterStatus={filterStatus}
          dateSet={dateSet}
          onFilterChange={(d, t, s) => setFilter(d, t, s)}
        />

        <BookingDialog
          isOpen={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSubmit={handleDialogSubmit}
          resources={resources}
          employee={employee}
          initialDate={filterDate}
          initialResourceId={selectedBooking?.resource_id}
        />

        {contextMenu && (
          <BookingContextMenu
            booking={contextMenu.booking}
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
            onEdit={handleEditContext}
            onFinish={handleFinishContext}
              onDelete={(b) => handleFinishContext(b.id)}
            />
          )}

          {/* Resource management modal */}
          {resDialogOpen && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 999,
              display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)',
            }} onClick={() => setResDialogOpen(false)}>
              <div style={{
                background: '#fff', borderRadius: 16, padding: '1.5rem', width: 520,
                maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto',
                boxShadow: '0 25px 50px rgba(0,0,0,0.15)',
              }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>⚙️ Quản lý tài nguyên</h3>
                  <button onClick={() => setResDialogOpen(false)} style={{
                    width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '1rem', color: '#64748b',
                  }}>✕</button>
                </div>

                {resMsg && (
                  <div style={{
                    background: resMsg.startsWith('Lỗi') || resMsg.startsWith('Không') ? '#fef2f2' : '#f0fdf4',
                    border: `1px solid ${resMsg.startsWith('Lỗi') || resMsg.startsWith('Không') ? '#fca5a5' : '#86efac'}`,
                    borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '0.82rem',
                    color: resMsg.startsWith('Lỗi') || resMsg.startsWith('Không') ? '#991b1b' : '#166534',
                    marginBottom: '0.75rem',
                  }}>{resMsg}</div>
                )}

                {/* Add new resource */}
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.5rem' }}>➕ Thêm tài nguyên mới</div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <select value={newResType} onChange={e => setNewResType(e.target.value)} style={{
                      padding: '0.4rem 0.6rem', background: '#fff', border: '1px solid #e2e8f0',
                      borderRadius: 8, fontSize: '0.82rem', outline: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', color: '#334155', width: 120,
                    }}>
                      <option value="car">🚗 Xe</option>
                      <option value="meeting_room">🏢 Phòng họp</option>
                    </select>
                    <input type="text" placeholder="Tên tài nguyên *" value={newResName}
                      onChange={e => setNewResName(e.target.value)}
                      style={{
                        flex: 1, minWidth: 160, padding: '0.4rem 0.6rem', background: '#fff',
                        border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.82rem',
                        outline: 'none', fontFamily: 'inherit', color: '#334155',
                      }} />
                    <button onClick={handleCreateResource} style={{
                      padding: '0.4rem 0.8rem', background: '#00468C', color: '#fff',
                      border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.82rem',
                      cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                    }}>➕ Thêm</button>
                  </div>
                  <input type="text" placeholder="Mô tả (không bắt buộc)" value={newResDesc}
                    onChange={e => setNewResDesc(e.target.value)}
                    style={{
                      width: '100%', padding: '0.4rem 0.6rem', marginTop: '0.4rem', background: '#fff',
                      border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.82rem',
                      outline: 'none', fontFamily: 'inherit', color: '#334155', boxSizing: 'border-box',
                    }} />
                </div>

                {/* Resource list */}
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.5rem' }}>
                  📋 Danh sách tài nguyên ({allResources.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {allResources.map((r, i) => (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: 8,
                      border: '1px solid #f1f5f9',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
                        <span style={{
                          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                          background: resourceColor(i),
                        }} />
                        <span>{isCar(r.type) ? '🚗' : '🏢'} <strong>{r.name}</strong></span>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>
                          ({isCar(r.type) ? 'Xe' : 'Phòng họp'})
                        </span>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem', marginLeft: 'auto', marginRight: '0.5rem' }}>
                          📅 {r.booking_count || 0}
                        </span>
                      </div>
                      <button onClick={() => handleDeleteResource(r.id)} style={{
                        background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6,
                        padding: '0.2rem 0.5rem', fontSize: '0.72rem', color: '#dc2626',
                        cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
                      }}>🗑️ Xoá</button>
                    </div>
                  ))}
                  {allResources.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8', fontSize: '0.85rem' }}>
                      Chưa có tài nguyên nào.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
