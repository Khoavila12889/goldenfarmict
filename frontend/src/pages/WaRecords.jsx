import React, { useCallback, useEffect, useState } from 'react'
import { Search, RefreshCw, X, MapPin, CalendarClock, ClipboardList, Megaphone, LogOut, UserRound, Users, Clock3 } from 'lucide-react'
import { apiErrorMessage, getWaRecords, getWaRecord, updateWaRecordStatus } from '../services/api'
import './WaRecords.css'

const TYPE_META = {
  datlich: { label: 'Đặt lịch', icon: CalendarClock, cls: 'wa-badge-datlich' },
  checkin: { label: 'Check-in', icon: MapPin, cls: 'wa-badge-checkin' },
  checkout: { label: 'Check-out', icon: LogOut, cls: 'wa-badge-checkout' },
  baocao: { label: 'Báo cáo', icon: Megaphone, cls: 'wa-badge-baocao' },
}

const STATUS_META = {
  moi: { label: 'Mới', cls: 'wa-status-moi' },
  daxuly: { label: 'Đã xử lý', cls: 'wa-status-daxuly' },
  huy: { label: 'Đã hủy', cls: 'wa-status-huy' },
}

const fmtDateTime = value => value
  ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : '—'

function TypeBadge({ type }) {
  const meta = TYPE_META[type] || { label: type, icon: ClipboardList, cls: '' }
  const Icon = meta.icon
  return <span className={`wa-badge ${meta.cls}`}><Icon size={13} /> {meta.label}</span>
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, cls: '' }
  return <span className={`wa-status ${meta.cls}`}>{meta.label}</span>
}

export default function WaRecords() {
  const [records, setRecords] = useState([])
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const [serverQuery, setServerQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getWaRecords({
        record_type: type || undefined,
        status: status || undefined,
        q: serverQuery || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        page_size: pageSize,
      })
      setRecords(res.data.data || [])
      setTotal(res.data.total || 0)
      setError('')
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [type, status, serverQuery, dateFrom, dateTo, page])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const t = setTimeout(() => { setServerQuery(query); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [query])

  const openDetail = async (id) => {
    setDetailLoading(true)
    try {
      const res = await getWaRecord(id)
      setSelected(res.data.data)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setDetailLoading(false)
    }
  }

  const changeStatus = async (id, newStatus) => {
    setSaving(true)
    try {
      const res = await updateWaRecordStatus(id, newStatus)
      const updated = res.data.data
      setSelected(updated)
      setRecords(prev => prev.map(r => (r.id === updated.id ? updated : r)))
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="wa-page">
      <div className="wa-header">
        <div>
          <h1>Thông báo WhatsApp</h1>
          <p>Bản ghi bot Hermes trích từ group WhatsApp: đặt lịch, check-in vị trí và báo cáo.</p>
        </div>
        <button className="wa-btn" onClick={load} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'wa-spin' : ''} /> Làm mới
        </button>
      </div>

      <div className="wa-filters">
        <select value={type} onChange={e => { setType(e.target.value); setPage(1) }}>
          <option value="">Tất cả loại</option>
          <option value="datlich">Đặt lịch</option>
          <option value="checkin">Check-in</option>
          <option value="checkout">Check-out</option>
          <option value="baocao">Báo cáo</option>
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Tất cả trạng thái</option>
          <option value="moi">Mới</option>
          <option value="daxuly">Đã xử lý</option>
          <option value="huy">Đã hủy</option>
        </select>
        <label className="wa-date">Từ <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} /></label>
        <label className="wa-date">Đến <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} /></label>
        <div className="wa-search">
          <Search size={15} />
          <input placeholder="Tìm nội dung, người gửi, địa điểm..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </div>

      {error && <div className="wa-error">{error}</div>}

      {loading ? (
        <div className="wa-empty">Đang tải...</div>
      ) : records.length === 0 ? (
        <div className="wa-empty">Chưa có bản ghi nào khớp bộ lọc.</div>
      ) : (
        <div className="wa-list">
          {records.map(r => (
            <article key={r.id} className="wa-card" onClick={() => openDetail(r.id)}>
              <div className="wa-card-top">
                <TypeBadge type={r.record_type} />
                <StatusBadge status={r.status} />
                <span className="wa-card-time"><Clock3 size={13} /> {fmtDateTime(r.created_at)}</span>
              </div>
              <h3>{r.title || r.content?.slice(0, 90) || '(Không có tiêu đề)'}</h3>
              {r.title && r.content && <p className="wa-card-content">{r.content}</p>}
              <div className="wa-card-meta">
                {r.sender_name && <span><UserRound size={13} /> {r.sender_name}{r.sender_phone ? ` · ${r.sender_phone}` : ''}</span>}
                {r.group_name && <span><Users size={13} /> {r.group_name}</span>}
                {r.record_type === 'datlich' && r.scheduled_at && (
                  <span><CalendarClock size={13} /> Hẹn: {fmtDateTime(r.scheduled_at)}</span>
                )}
                {r.place && <span><MapPin size={13} /> {r.place}</span>}
                {r.record_type === 'checkin' && r.lat != null && r.lng != null && (
                  <a
                    className="wa-map-link"
                    href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                  >
                    <MapPin size={13} /> Xem bản đồ
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="wa-pagination">
        <button className="wa-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Trước</button>
        <span>Trang {page}/{totalPages} · {total} bản ghi</span>
        <button className="wa-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Sau →</button>
      </div>

      {(selected || detailLoading) && (
        <div className="wa-modal-backdrop" onClick={() => setSelected(null)}>
          <div className="wa-modal" onClick={e => e.stopPropagation()}>
            <button className="wa-modal-close" onClick={() => setSelected(null)}><X size={18} /></button>
            {detailLoading || !selected ? (
              <div className="wa-empty">Đang tải chi tiết...</div>
            ) : (
              <>
                <div className="wa-card-top">
                  <TypeBadge type={selected.record_type} />
                  <StatusBadge status={selected.status} />
                  <span className="wa-card-time">{fmtDateTime(selected.created_at)}</span>
                </div>
                <h2>{selected.title || '(Không có tiêu đề)'}</h2>
                {selected.content && <p className="wa-detail-content">{selected.content}</p>}
                <dl className="wa-detail-grid">
                  <dt>Người gửi</dt>
                  <dd>{selected.sender_name || '—'}{selected.sender_phone ? ` (${selected.sender_phone})` : ''}</dd>
                  <dt>Group</dt>
                  <dd>{selected.group_name || '—'}</dd>
                  {selected.record_type === 'datlich' && (<><dt>Giờ hẹn</dt><dd>{fmtDateTime(selected.scheduled_at)}</dd></>)}
                  {selected.place && (<><dt>Địa điểm</dt><dd>{selected.place}</dd></>)}
                  {selected.lat != null && selected.lng != null && (
                    <>
                      <dt>Tọa độ</dt>
                      <dd>
                        {selected.lat}, {selected.lng}{' '}
                        <a href={`https://www.google.com/maps?q=${selected.lat},${selected.lng}`} target="_blank" rel="noreferrer">Xem bản đồ</a>
                      </dd>
                    </>
                  )}
                  <dt>Nguồn</dt>
                  <dd>{selected.source}</dd>
                </dl>
                <div className="wa-raw">
                  <div className="wa-raw-title">Tin nhắn gốc</div>
                  <pre>{selected.raw_message || '—'}</pre>
                </div>
                <div className="wa-actions">
                  {selected.status !== 'daxuly' && (
                    <button className="wa-btn wa-btn-primary" disabled={saving} onClick={() => changeStatus(selected.id, 'daxuly')}>Đánh dấu đã xử lý</button>
                  )}
                  {selected.status !== 'huy' && (
                    <button className="wa-btn wa-btn-danger" disabled={saving} onClick={() => changeStatus(selected.id, 'huy')}>Hủy bản ghi</button>
                  )}
                  {selected.status !== 'moi' && (
                    <button className="wa-btn" disabled={saving} onClick={() => changeStatus(selected.id, 'moi')}>Mở lại</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
