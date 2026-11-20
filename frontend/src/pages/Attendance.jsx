import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, RefreshCw, Download, MapPin, UserRound, Users, Speaker, LogIn, LogOut, CalendarDays, ClipboardList, Clock3 } from 'lucide-react'
import { apiErrorMessage, getAttendanceGroups, getAttendanceEvents, getAttendanceSummary, exportAttendanceXLSX } from '../services/api'
import './Attendance.css'

const TYPE_META = {
  datlich: { label: 'Đặt lịch', cls: 'at-badge-datlich', Icon: CalendarDays },
  checkin: { label: 'Check-in', cls: 'at-badge-checkin', Icon: LogIn },
  baocao: { label: 'Báo cáo', cls: 'at-badge-baocao', Icon: ClipboardList },
  checkout: { label: 'Check-out', cls: 'at-badge-checkout', Icon: LogOut },
  thongbao: { label: 'Thông báo', cls: 'at-badge-thongbao', Icon: Speaker },
  vitri: { label: 'Vị trí', cls: 'at-badge-vitri', Icon: MapPin },
}

const STATUS_META = {
  moi: { label: 'Mới', cls: 'at-status-moi' },
  daxuly: { label: 'Đã xử lý', cls: 'at-status-daxuly' },
  huy: { label: 'Đã hủy', cls: 'at-status-huy' },
}

function TypeBadge({ type }) {
  const meta = TYPE_META[type] || TYPE_META.thongbao
  const Icon = meta.Icon
  return <span className={`at-badge ${meta.cls}`}><Icon size={13} /> {meta.label}</span>
}

function TypeChip({ type }) {
  const meta = TYPE_META[type]
  if (!meta) return null
  return <span className={`at-chip ${meta.cls}`}>{meta.label}</span>
}

const pad = n => String(n).padStart(2, '0')
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const fmtTime = value => value
  ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : '—'
const fmtDateTime = value => value
  ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : '—'
const fmtDay = day => {
  if (!day) return '—'
  const [y, m, d] = String(day).split('-')
  return d && m && y ? `${d}/${m}/${y}` : day
}

export default function Attendance() {
  const [view, setView] = useState('summary')
  const [groups, setGroups] = useState([])
  const [source, setSource] = useState('')
  const [groupName, setGroupName] = useState('')
  const [query, setQuery] = useState('')
  const [serverQuery, setServerQuery] = useState('')
  const [dateFrom, setDateFrom] = useState(todayStr())
  const [dateTo, setDateTo] = useState(todayStr())
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => {
    getAttendanceGroups()
      .then(res => setGroups(res.data.data || []))
      .catch(() => setGroups([]))
  }, [])

  const groupOptions = useMemo(
    () => groups.filter(g => !source || g.src === source),
    [groups, source],
  )

  const filters = useMemo(() => ({
    source: source || undefined,
    group_name: groupName || undefined,
    q: serverQuery || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  }), [source, groupName, serverQuery, dateFrom, dateTo])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = view === 'summary'
        ? await getAttendanceSummary({ ...filters, page, page_size: pageSize })
        : await getAttendanceEvents({ ...filters, page, page_size: pageSize })
      setRows(res.data.data || [])
      setTotal(res.data.total || 0)
      setError('')
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [view, filters, page])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const t = setTimeout(() => { setServerQuery(query); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [query])

  const resetPage = fn => e => { fn(e.target.value); setPage(1) }

  const doExport = async () => {
    setExporting(true)
    try {
      const res = await exportAttendanceXLSX(filters)
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `cham-cong-${dateFrom || 'all'}-${dateTo || 'now'}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="at-page">
      <div className="at-header">
        <div>
          <h1>Chấm công Zalo & WhatsApp</h1>
          <p>Tổng hợp check-in, check-out và vị trí nhân viên gửi trong các group Zalo & WhatsApp — theo nhân viên × ngày, đúng group dữ liệu.</p>
        </div>
        <div className="at-header-actions">
          <button className="at-btn" onClick={load} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'at-spin' : ''} /> Làm mới
          </button>
          <button className="at-btn at-btn-primary" onClick={doExport} disabled={exporting}>
            <Download size={15} /> {exporting ? 'Đang xuất...' : 'Xuất .xlsx'}
          </button>
        </div>
      </div>

      <div className="at-filters">
        <div className="at-view-toggle">
          <button className={view === 'summary' ? 'at-toggle-on' : ''} onClick={() => { setView('summary'); setPage(1) }}>Tổng hợp chấm công</button>
          <button className={view === 'events' ? 'at-toggle-on' : ''} onClick={() => { setView('events'); setPage(1) }}>Chi tiết sự kiện</button>
        </div>
        <select value={source} onChange={e => { setSource(e.target.value); setGroupName(''); setPage(1) }}>
          <option value="">Tất cả nguồn</option>
          <option value="zalo">Zalo</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
        <select value={groupName} onChange={resetPage(setGroupName)}>
          <option value="">Tất cả group</option>
          {groupOptions.map(g => (
            <option key={`${g.src}-${g.group_name}`} value={g.group_name}>
              {g.src === 'zalo' ? 'Zalo' : 'WhatsApp'} · {g.group_name} ({g.records})
            </option>
          ))}
        </select>
        <label className="at-date">Từ <input type="date" value={dateFrom} onChange={resetPage(setDateFrom)} /></label>
        <label className="at-date">Đến <input type="date" value={dateTo} onChange={resetPage(setDateTo)} /></label>
        <div className="at-search">
          <Search size={15} />
          <input placeholder="Tìm nhân viên, nội dung, địa điểm..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="at-kpis">
        <div className="at-kpi">
          <span className="at-kpi-value">{total}</span>
          <span className="at-kpi-label">{view === 'summary' ? 'nhân viên-ngày' : 'sự kiện'}</span>
        </div>
        <div className="at-kpi">
          <span className="at-kpi-value">{groupOptions.length}</span>
          <span className="at-kpi-label">group trong bộ lọc</span>
        </div>
        <div className="at-kpi">
          <span className="at-kpi-value">{dateFrom || '...'} → {dateTo || '...'}</span>
          <span className="at-kpi-label">khoảng ngày đang xem</span>
        </div>
      </div>

      {error && <div className="at-error">{error}</div>}

      {loading ? (
        <div className="at-empty">Đang tải...</div>
      ) : rows.length === 0 ? (
        <div className="at-empty">Chưa có dữ liệu khớp bộ lọc.</div>
      ) : view === 'summary' ? (
        <div className="at-table-wrap">
          <table className="at-table">
            <thead>
              <tr>
                <th>Ngày</th><th>Nhân viên</th><th>Group</th><th>Nguồn</th>
                <th>Đầu ngày</th><th>Cuối ngày</th><th>Check-in</th><th>Check-out</th>
                <th>Sự kiện</th><th>Địa điểm</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.day}-${r.src}-${r.group_name}-${r.sender_key}`}>
                  <td className="at-nowrap">{fmtDay(r.day)}</td>
                  <td><UserRound size={13} /> {r.sender_name}</td>
                  <td>{r.group_name}</td>
                  <td>{r.src === 'zalo' ? 'Zalo' : 'WhatsApp'}</td>
                  <td className="at-nowrap">{fmtTime(r.first_at)} <TypeChip type={r.first_type} /></td>
                  <td className="at-nowrap">{fmtTime(r.last_at)} <TypeChip type={r.last_type} /></td>
                  <td className="at-nowrap">{r.checkin_at ? fmtTime(r.checkin_at) : '—'}</td>
                  <td className="at-nowrap">{r.checkout_at ? fmtTime(r.checkout_at) : '—'}</td>
                  <td className="at-nowrap">{r.events} <span className="at-sub">({r.checkins} CI · {r.checkouts} CO · {r.vitris} VT)</span></td>
                  <td>{r.places || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="at-list">
          {rows.map(r => (
            <article key={`${r.src}-${r.id}`} className="at-card">
              <div className="at-card-top">
                <TypeBadge type={r.record_type} />
                <span className={`at-status ${STATUS_META[r.status]?.cls || ''}`}>{STATUS_META[r.status]?.label || r.status}</span>
                <span className="at-card-time"><Clock3 size={13} /> {fmtDateTime(r.created_at)}</span>
              </div>
              <h3>{r.title || r.content?.slice(0, 90) || '(Không có tiêu đề)'}</h3>
              {r.title && r.content && <p className="at-card-content">{r.content}</p>}
              <div className="at-card-meta">
                {r.sender_name && <span><UserRound size={13} /> {r.sender_name}</span>}
                {r.group_name && <span><Users size={13} /> {r.src === 'zalo' ? 'Zalo' : 'WhatsApp'} · {r.group_name}</span>}
                {r.place && <span><MapPin size={13} /> {r.place}</span>}
                {(r.lat != null && r.lng != null) && (
                  <span><MapPin size={13} /> <a href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noreferrer">{r.lat}, {r.lng}</a></span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="at-pagination">
        <button className="at-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Trước</button>
        <span>Trang {page}/{totalPages} · {total} {view === 'summary' ? 'dòng' : 'sự kiện'}</span>
        <button className="at-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Sau →</button>
      </div>
    </div>
  )
}
