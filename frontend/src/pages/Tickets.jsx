import React, { useEffect, useState, useCallback } from 'react'
import '../styles/shared.css'
import {
  getEmployeeByCode, getTickets, createTicket, updateTicket,
} from '../services/api'
import { formatDate } from '../utils/formatters'

const statusOpts = ['Cho xu ly', 'Dang xu ly', 'Da xu ly', 'Da huy']
const statusMap = {
  'Cho xu ly': { label: '⏳ Chờ xử lý', color: '#d97706', bg: '#fef3c7' },
  'Dang xu ly': { label: '⚙️ Đang xử lý', color: '#2563eb', bg: '#dbeafe' },
  'Da xu ly': { label: '✅ Đã xử lý', color: '#16a34a', bg: '#dcfce7' },
  'Da huy': { label: '❌ Đã hủy', color: '#6b7280', bg: '#f3f4f6' },
}
const priorityMap = {
  'Binh thuong': { label: 'Bình thường', color: '#00468C', bg: '#e8f0fe' },
  'Quan trong': { label: 'Quan trọng', color: '#d97706', bg: '#fef3c7' },
  'Khan cap': { label: 'Khẩn cấp', color: '#dc2626', bg: '#fef2f2' },
}

export default function Tickets() {
  const userRole = sessionStorage.getItem('user_role')
  const userCode = sessionStorage.getItem('user_code')
  const isAdmin = userRole === 'admin'

  const [emp, setEmp] = useState(null)
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)

  const [toast, setToast] = useState(null)

  // User form
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [priority, setPriority] = useState('Binh thuong')
  const [sending, setSending] = useState(false)
  const [formMsg, setFormMsg] = useState(null)

  // Admin filters
  const [fStatus, setFStatus] = useState('Tất cả')
  const [fPriority, setFPriority] = useState('Tất cả')
  const [fSearch, setFSearch] = useState('')

  // Admin reply side panel
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [rStatus, setRStatus] = useState('')
  const [rResolution, setRResolution] = useState('')
  const [rNotes, setRNotes] = useState('')

  const loadTickets = useCallback(() => {
    getTickets(fStatus, fPriority, fSearch).then(r => {
      setTickets(r.data?.data || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [fStatus, fPriority, fSearch])

  useEffect(() => {
    if (!isAdmin) {
      getEmployeeByCode(userCode).then(r => {
        if (r.data.id) setEmp(r.data)
      }).catch(() => {})
    }
    loadTickets()
  }, [])

  useEffect(() => {
    if (isAdmin) loadTickets()
  }, [fStatus, fPriority, fSearch])

  // SSE with auto-reconnect
  useEffect(() => {
    let es = null
    let reconnectTimer = null
    
    function connect() {
      try {
        es = new EventSource('/api/events')
        
        if (isAdmin) {
          es.addEventListener('new_ticket', (e) => {
            const { id } = JSON.parse(e.data)
            setToast(`🎫 Ticket mới! (#${id})`)
            setTimeout(() => setToast(null), 5000)
            loadTickets()
          })
        }
        es.addEventListener('update_ticket', () => loadTickets())
        es.addEventListener('delete_ticket', () => loadTickets())
        
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
  }, [isAdmin, loadTickets])

  async function handleCreate(e) {
    e.preventDefault()
    if (!title.trim()) { setFormMsg({ type: 'error', text: 'Vui lòng nhập tiêu đề.' }); return }
    setFormMsg(null); setSending(true)
    try {
      await createTicket({
        employee_id: emp.id, full_name: emp.full_name,
        department: emp.department, title: title.trim(),
        description: desc.trim(), priority, employee_code: userCode,
      })
      setTitle(''); setDesc(''); setPriority('Binh thuong')
      setFormMsg({ type: 'success', text: '✅ Gửi yêu cầu thành công!' })
      setTimeout(() => setFormMsg(null), 3000)
      loadTickets()
    } catch { setFormMsg({ type: 'error', text: 'Lỗi kết nối' }) }
    finally { setSending(false) }
  }

  function openReply(t) {
    if (selectedTicket?.id === t.id) { setSelectedTicket(null); return }
    setSelectedTicket(t); setRStatus(t.status)
    setRResolution(t.resolution || ''); setRNotes(t.admin_notes || '')
  }

  async function handleReply() {
    if (!selectedTicket) return
    const finalStatus = rResolution.trim() ? 'Da xu ly' : rStatus
    try {
      await updateTicket(selectedTicket.id, { status: finalStatus, resolution: rResolution.trim(), admin_notes: rNotes.trim() })
      setSelectedTicket(null)
      if (finalStatus === 'Da xu ly') {
        setTickets(prev => prev.filter(t => t.id !== selectedTicket.id))
      } else {
        loadTickets()
      }
    } catch {}
  }

  const myTickets = isAdmin ? [] : tickets.filter(t => t.employee_id === emp?.id)

  // ── ADMIN VIEW ──
  if (isAdmin) {
    return (
      <div style={{ position: 'relative' }}>
        <style>{`
          @keyframes slideIn { from { opacity: 0; transform: translateX(50px); } to { opacity: 1; transform: translateX(0); } }
          .cell-id { font-weight: 600; color: #00468C; }
          .cell-dept { font-size: 0.75rem; color: #94a3b8; margin-top: 2px; }
          .tag { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.12rem 0.5rem; border-radius: 20px; font-size: 0.72rem; font-weight: 600; white-space: nowrap; }
        `}</style>

        <div className="module-header">
          <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a' }}>🎫 Quản lý Yêu cầu Hỗ trợ (IT)</h1>
          <span style={{ background: '#e8f0fe', color: '#00468C', padding: '0.3rem 0.8rem', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600 }}>
            {loading ? '...' : `${tickets.length} ticket`}
          </span>
        </div>

        {toast && (
          <div style={{
            position: 'fixed', top: 20, right: 20, zIndex: 9999,
            background: '#1e293b', color: '#fff', padding: '0.75rem 1.25rem',
            borderRadius: 12, fontSize: '0.9rem', fontWeight: 600,
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            animation: 'slideIn 0.3s ease',
          }}>
            <span style={{ fontSize: '1.2rem' }}>🚨</span> {toast}
            <button onClick={() => setToast(null)} style={{
              background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
              marginLeft: '0.5rem', fontSize: '1rem',
            }}>✕</button>
          </div>
        )}

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center', background: '#fff', padding: '0.6rem 0.8rem', borderRadius: 12, border: '1px solid #e6edf5' }}>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{
            padding: '0.4rem 0.65rem', background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: 8, fontSize: '0.82rem', outline: 'none', cursor: 'pointer',
            fontFamily: 'inherit', color: '#334155', minWidth: 150, flexShrink: 0,
          }}>
            <option value="Tất cả">Tất cả trạng thái</option>
            {statusOpts.map(s => <option key={s} value={s}>{statusMap[s]?.label || s}</option>)}
          </select>
          <select value={fPriority} onChange={e => setFPriority(e.target.value)} style={{
            padding: '0.4rem 0.65rem', background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: 8, fontSize: '0.82rem', outline: 'none', cursor: 'pointer',
            fontFamily: 'inherit', color: '#334155', minWidth: 150, flexShrink: 0,
          }}>
            <option value="Tất cả">Tất cả mức độ</option>
            {Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
            <input type="text" placeholder="Tìm kiếm..." value={fSearch}
              onChange={e => setFSearch(e.target.value)}
              style={{
                width: '100%', padding: '0.4rem 0.65rem 0.4rem 1.7rem', background: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.82rem',
                outline: 'none', fontFamily: 'inherit', color: '#334155', boxSizing: 'border-box',
              }} />
          </div>
        </div>

        {/* Data table */}
        <div className="tbl-wrap" style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 60 }}>ID</th>
                <th style={{ minWidth: 160 }}>Tiêu đề</th>
                <th style={{ minWidth: 150 }}>Người yêu cầu / Bộ phận</th>
                <th style={{ minWidth: 120 }}>Ngày / Giờ</th>
                <th style={{ width: 105 }}>Mức độ ưu tiên</th>
                <th style={{ width: 105 }}>Trạng thái</th>
                <th style={{ width: 36, textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={`s-${i}`}>
                    {[1,2,3,4,5,6,7].map(j => (
                      <td key={`c-${j}`}>
                        <div style={{ height: 12, background: '#f1f5f9', borderRadius: 4, width: '75%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
                    Không có ticket nào phù hợp.
                  </td>
                </tr>
              ) : tickets.map(t => {
                const st = statusMap[t.status] || {}
                const pr = priorityMap[t.priority] || {}
                const sel = selectedTicket?.id === t.id
                return (
                  <tr key={t.id} className={sel ? 'selected' : ''} onClick={() => openReply(t)}>
                    <td className="cell-id">#{t.id}</td>
                    <td style={{ fontWeight: 500 }}>{t.title}</td>
                    <td>
                      <div>{t.full_name}</div>
                      {t.department && <div className="cell-dept">{t.department}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{formatDate(t.created_at)}</td>
                    <td><span className="tag" style={{ background: pr.bg, color: pr.color }}>{pr.label}</span></td>
                    <td><span className="tag" style={{ background: st.bg, color: st.color }}>{st.label}</span></td>
                    <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>{sel ? '◀' : '▶'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Side panel */}
        <div className={`panel-overlay ${selectedTicket ? 'open' : ''}`} onClick={() => setSelectedTicket(null)} />
        <div className={`side-panel ${selectedTicket ? 'open' : ''}`}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>🎫 #{selectedTicket?.id} — {selectedTicket?.title}</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>👤 {selectedTicket?.full_name}{selectedTicket?.department ? ` — ${selectedTicket.department}` : ''}</div>
            </div>
            <button onClick={() => setSelectedTicket(null)} style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '1rem', color: '#64748b',
            }}>✕</button>
          </div>

          <div className="panel-body">
            {selectedTicket && (
              <>
                {/* Description */}
                {selectedTicket.description && (
                  <div style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.5, padding: '0.6rem 0.8rem', background: '#f8fafc', borderRadius: 8, marginBottom: '1rem' }}>
                    <strong style={{ color: '#0f172a' }}>📝 Mô tả:</strong> {selectedTicket.description}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem', fontWeight: 600, textTransform: 'uppercase' }}>Trạng thái</label>
                    <select value={rStatus} onChange={e => setRStatus(e.target.value)} style={{
                      width: '100%', padding: '0.4rem 0.65rem', background: '#f8fafc',
                      border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.82rem',
                      outline: 'none', cursor: 'pointer', fontFamily: 'inherit', color: '#334155',
                    }}>
                      {statusOpts.map(s => <option key={s} value={s}>{statusMap[s]?.label || s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem', fontWeight: 600, textTransform: 'uppercase' }}>Ghi chú nội bộ</label>
                    <input type="text" value={rNotes} onChange={e => setRNotes(e.target.value)}
                      placeholder="Ghi chú cho IT..." style={{
                        width: '100%', padding: '0.4rem 0.65rem', background: '#f8fafc',
                        border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.82rem',
                        outline: 'none', fontFamily: 'inherit', color: '#334155', boxSizing: 'border-box',
                      }} />
                  </div>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem', fontWeight: 600, textTransform: 'uppercase' }}>📝 Phản hồi cho người dùng</label>
                  <textarea value={rResolution} onChange={e => setRResolution(e.target.value)}
                    placeholder="Nhập giải pháp, hướng dẫn..."
                    rows={3} style={{
                      width: '100%', padding: '0.4rem 0.65rem', background: '#f8fafc',
                      border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.82rem',
                      outline: 'none', fontFamily: 'inherit', color: '#334155',
                      resize: 'vertical', minHeight: 60, boxSizing: 'border-box',
                    }} />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={handleReply} style={{
                    padding: '0.45rem 1.25rem', background: '#00468C', color: '#fff',
                    border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.82rem',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>💾 Lưu phản hồi</button>
                  <button onClick={() => setSelectedTicket(null)} style={{
                    padding: '0.45rem 1rem', background: '#f1f5f9', color: '#475569',
                    border: '1px solid #e2e8f0', borderRadius: 8, fontWeight: 500,
                    fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                  }}>Đóng</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── USER VIEW ──
  return (
    <div className="ticket-user-wrapper">
      <h1 className="ticket-user-title">🎫 Hệ thống Yêu cầu Hỗ trợ</h1>
      <div className="ticket-user-layout">
        <div className="ticket-form-card">
          <h2 className="ticket-section-title">📝 Gửi yêu cầu mới</h2>
          {emp && <div className="ticket-emp-info">
            Gửi bởi: <strong>{emp.full_name}</strong> — {emp.department}
          </div>}
          {formMsg && (
            <div className={`ticket-form-msg ${formMsg.type}`}>
              {formMsg.text}
            </div>
          )}
          <form onSubmit={handleCreate}>
            <input type="text" placeholder="Tiêu đề *" value={title}
              onChange={e => setTitle(e.target.value)}
              className="ticket-input" />
            <textarea placeholder="Mô tả chi tiết..." value={desc}
              onChange={e => setDesc(e.target.value)} rows={4}
              className="ticket-textarea" />
            <select value={priority} onChange={e => setPriority(e.target.value)}
              className="ticket-select">
              {Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button type="submit" disabled={sending} className="ticket-submit-btn">
              {sending ? 'Đang gửi...' : '📤 Gửi yêu cầu'}
            </button>
          </form>
        </div>

        <div className="ticket-list-wrapper">
          <h2 className="ticket-section-title">
            📋 Ticket của tôi
            {myTickets.length > 0 && <span className="ticket-count-badge"> ({myTickets.length})</span>}
          </h2>
          {loading ? <p className="ticket-loading">Đang tải...</p>
          : myTickets.length === 0 ? (
            <div className="ticket-empty">Bạn chưa gửi yêu cầu nào.</div>
          ) : myTickets.map(t => {
            const st = statusMap[t.status] || {}
            const pr = priorityMap[t.priority] || {}
            return (
              <div key={t.id} className="ticket-card">
                <div className="ticket-card-header">
                  <div className="ticket-card-title">#{t.id} — {t.title}</div>
                  <div className="ticket-card-tags">
                    <span className="tag" style={{ background: pr.bg, color: pr.color }}>{pr.label}</span>
                    <span className="tag" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                  </div>
                </div>
                <div className="ticket-card-date">
                  📅 {formatDate(t.created_at)}
                </div>
                {t.description && (
                  <div className="ticket-card-desc">{t.description}</div>
                )}
                {t.resolution && (
                  <div className="ticket-card-resolution">
                    <div className="ticket-card-res-title">
                      📝 Phản hồi từ IT:
                    </div>
                    <div className="ticket-card-res-body">{t.resolution}</div>
                  </div>
                )}
                {t.status === 'Da xu ly' && !t.resolution && (
                  <div className="ticket-card-resolved-msg">✅ Yêu cầu đã được xử lý.</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


