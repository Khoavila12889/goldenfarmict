import React, { useCallback, useEffect, useState } from 'react'
import { Search, RefreshCw, X, Speaker, UserRound, Users, Clock3, Hash } from 'lucide-react'
import { apiErrorMessage, getZaloRecords, getZaloRecord, updateZaloRecordStatus } from '../services/api'
import './ZaloRecords.css'

const STATUS_META = {
  moi: { label: 'Mới', cls: 'zl-status-moi' },
  daxuly: { label: 'Đã xử lý', cls: 'zl-status-daxuly' },
  huy: { label: 'Đã hủy', cls: 'zl-status-huy' },
}

const fmtDateTime = value => value
  ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : '—'

function TypeBadge() {
  return <span className="zl-badge zl-badge-thongbao"><Speaker size={13} /> Thông báo</span>
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, cls: '' }
  return <span className={`zl-status ${meta.cls}`}>{meta.label}</span>
}

export default function ZaloRecords() {
  const [records, setRecords] = useState([])
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
      const res = await getZaloRecords({
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
  }, [status, serverQuery, dateFrom, dateTo, page])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const t = setTimeout(() => { setServerQuery(query); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [query])

  const openDetail = async (id) => {
    setDetailLoading(true)
    try {
      const res = await getZaloRecord(id)
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
      const res = await updateZaloRecordStatus(id, newStatus)
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
    <div className="zl-page">
      <div className="zl-header">
        <div>
          <h1>Thông báo Zalo</h1>
          <p>Thông báo chính thức bot Zalo trích từ các group trong danh sách bắt tin, chờ admin xem và xử lý.</p>
        </div>
        <button className="zl-btn" onClick={load} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'zl-spin' : ''} /> Làm mới
        </button>
      </div>

      <div className="zl-filters">
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Tất cả trạng thái</option>
          <option value="moi">Mới</option>
          <option value="daxuly">Đã xử lý</option>
          <option value="huy">Đã hủy</option>
        </select>
        <label className="zl-date">Từ <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} /></label>
        <label className="zl-date">Đến <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} /></label>
        <div className="zl-search">
          <Search size={15} />
          <input placeholder="Tìm nội dung, người gửi, group..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </div>

      {error && <div className="zl-error">{error}</div>}

      {loading ? (
        <div className="zl-empty">Đang tải...</div>
      ) : records.length === 0 ? (
        <div className="zl-empty">Chưa có bản ghi nào khớp bộ lọc.</div>
      ) : (
        <div className="zl-list">
          {records.map(r => (
            <article key={r.id} className="zl-card" onClick={() => openDetail(r.id)}>
              <div className="zl-card-top">
                <TypeBadge />
                <StatusBadge status={r.status} />
                <span className="zl-card-time"><Clock3 size={13} /> {fmtDateTime(r.created_at)}</span>
              </div>
              <h3>{r.title || r.content?.slice(0, 90) || '(Không có tiêu đề)'}</h3>
              {r.title && r.content && <p className="zl-card-content">{r.content}</p>}
              <div className="zl-card-meta">
                {r.sender_name && <span><UserRound size={13} /> {r.sender_name}{r.sender_phone ? ` · ${r.sender_phone}` : ''}</span>}
                {r.group_name && <span><Users size={13} /> {r.group_name}</span>}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="zl-pagination">
        <button className="zl-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Trước</button>
        <span>Trang {page}/{totalPages} · {total} bản ghi</span>
        <button className="zl-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Sau →</button>
      </div>

      {(selected || detailLoading) && (
        <div className="zl-modal-backdrop" onClick={() => setSelected(null)}>
          <div className="zl-modal" onClick={e => e.stopPropagation()}>
            <button className="zl-modal-close" onClick={() => setSelected(null)}><X size={18} /></button>
            {detailLoading || !selected ? (
              <div className="zl-empty">Đang tải chi tiết...</div>
            ) : (
              <>
                <div className="zl-card-top">
                  <TypeBadge />
                  <StatusBadge status={selected.status} />
                  <span className="zl-card-time">{fmtDateTime(selected.created_at)}</span>
                </div>
                <h2>{selected.title || '(Không có tiêu đề)'}</h2>
                {selected.content && <p className="zl-detail-content">{selected.content}</p>}
                <dl className="zl-detail-grid">
                  <dt>Người gửi</dt>
                  <dd>{selected.sender_name || '—'}{selected.sender_phone ? ` (${selected.sender_phone})` : ''}</dd>
                  {selected.sender_id && (<><dt>Zalo ID</dt><dd>{selected.sender_id}</dd></>)}
                  <dt>Group</dt>
                  <dd>{selected.group_name || '—'}</dd>
                  {selected.group_id && (<><dt>Group ID</dt><dd>{selected.group_id}</dd></>)}
                  {selected.msg_id && (<><dt><Hash size={12} /> Msg ID</dt><dd>{selected.msg_id}</dd></>)}
                  <dt>Nguồn</dt>
                  <dd>{selected.source}</dd>
                </dl>
                <div className="zl-raw">
                  <div className="zl-raw-title">Tin nhắn gốc</div>
                  <pre>{selected.raw_message || '—'}</pre>
                </div>
                <div className="zl-actions">
                  {selected.status !== 'daxuly' && (
                    <button className="zl-btn zl-btn-primary" disabled={saving} onClick={() => changeStatus(selected.id, 'daxuly')}>Đánh dấu đã xử lý</button>
                  )}
                  {selected.status !== 'huy' && (
                    <button className="zl-btn zl-btn-danger" disabled={saving} onClick={() => changeStatus(selected.id, 'huy')}>Hủy bản ghi</button>
                  )}
                  {selected.status !== 'moi' && (
                    <button className="zl-btn" disabled={saving} onClick={() => changeStatus(selected.id, 'moi')}>Mở lại</button>
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
