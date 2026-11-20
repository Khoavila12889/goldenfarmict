import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, RefreshCw, Download, MapPin, UserRound, Users, Speaker, LogIn, LogOut, CalendarDays, ClipboardList, Clock3, Link2, Unlink, Pencil } from 'lucide-react'
import { apiErrorMessage, getAttendanceGroups, getAttendanceVisitEvents, getAttendanceSummary, exportAttendanceXLSX, getAttendanceIdentities, updateAttendanceIdentity, updateAttendanceVisitPlace } from '../services/api'
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
const fmtDayInput = value => {
  if (!value) return '...'
  const [y, m, d] = String(value).split('-')
  return d && m && y ? `${d}/${m}/${y}` : value
}
const fmtDuration = mins => {
  if (mins == null) return '—'
  const m = parseInt(mins, 10)
  return `${Math.floor(m / 60)}g${pad(m % 60)}`
}
const eventBreakdown = r => {
  const parts = []
  if (r.checkins > 0) parts.push(`${r.checkins} check-in`)
  if (r.checkouts > 0) parts.push(`${r.checkouts} check-out`)
  if (r.vitris > 0) parts.push(`${r.vitris} vị trí`)
  return parts.join(' · ')
}
const displayName = r => r.employee_name || r.sender_name
const codeLine = r => r.employee_code
  ? `Mã ${r.employee_code}${r.employee_department ? ' · ' + r.employee_department : ''}`
  : 'Tên Zalo · chưa gán mã NV'
const empLabel = e => `${e.employee_code} — ${e.full_name}${e.department ? ' — ' + e.department : ''}`

export default function Attendance() {
  const [view, setView] = useState('summary')
  const [groups, setGroups] = useState([])
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

  // Gán mã nhân viên
  const [identities, setIdentities] = useState([])
  const [employees, setEmployees] = useState([])
  const [picks, setPicks] = useState({})
  const [savingKey, setSavingKey] = useState('')
  const [mapMsg, setMapMsg] = useState('')
  const [mapLoading, setMapLoading] = useState(false)

  // Sua ten cua hang cua luot ghe
  const [editingPlace, setEditingPlace] = useState('')
  const [placeDraft, setPlaceDraft] = useState('')
  const [savingPlace, setSavingPlace] = useState(false)

  useEffect(() => {
    getAttendanceGroups()
      .then(res => setGroups(res.data.data || []))
      .catch(() => setGroups([]))
  }, [])

  const filters = useMemo(() => ({
    group_name: groupName || undefined,
    q: serverQuery || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  }), [groupName, serverQuery, dateFrom, dateTo])

  const load = useCallback(async () => {
    if (view === 'mapping') return
    setLoading(true)
    try {
      const res = view === 'summary'
        ? await getAttendanceSummary({ ...filters, page, page_size: pageSize })
        : await getAttendanceVisitEvents({ ...filters, page, page_size: pageSize })
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

  const loadIdentities = useCallback(async () => {
    setMapLoading(true)
    try {
      const res = await getAttendanceIdentities()
      setIdentities(res.data.data || [])
      setEmployees(res.data.employees || [])
      setError('')
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setMapLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view === 'mapping') loadIdentities()
  }, [view, loadIdentities])

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

  const saveIdentity = async (row, code) => {
    const key = `${row.src}|${row.sender_key}`
    setSavingKey(key)
    setMapMsg('')
    try {
      await updateAttendanceIdentity({ source: row.src, sender_key: row.sender_key, employee_code: code || null })
      setMapMsg(code ? `Đã gán ${row.sender_name} → mã ${code}` : `Đã xoá gán mã của ${row.sender_name}`)
      await loadIdentities()
    } catch (err) {
      setMapMsg(apiErrorMessage(err))
    } finally {
      setSavingKey('')
    }
  }

  const savePick = row => {
    const key = `${row.src}|${row.sender_key}`
    const raw = (picks[key] || '').trim()
    const code = raw.split('—')[0].trim()
    if (!employees.some(e => e.employee_code === code)) {
      setMapMsg('Mã nhân viên chưa đúng — hãy chọn từ danh sách gợi ý.')
      return
    }
    saveIdentity(row, code)
  }

  const savePlace = async r => {
    setSavingPlace(true)
    try {
      await updateAttendanceVisitPlace({ source: r.src, record_id: r.first_record_id, place: placeDraft })
      setEditingPlace('')
      await load()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSavingPlace(false)
    }
  }

  const renderPlace = r => {
    const key = `${r.day}|${r.src}|${r.sender_key}|${r.visit_no}`
    if (editingPlace === key) {
      return (
        <span className="at-place-edit">
          <input value={placeDraft} onChange={e => setPlaceDraft(e.target.value)} placeholder="Tên cửa hàng (để trống = tên tự trích)" />
          <button className="at-btn" disabled={savingPlace} onClick={() => savePlace(r)}>Lưu</button>
          <button className="at-btn" disabled={savingPlace} onClick={() => setEditingPlace('')}>Huỷ</button>
        </span>
      )
    }
    return (
      <span className="at-place-view">
        {r.places
          ? <span>{r.places}{r.place_edited ? ' · đã sửa' : ''}</span>
          : (r.lat != null && r.lng != null)
            ? <a href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noreferrer">Xem vị trí</a>
            : <span className="at-sub">Chưa có tên cửa hàng</span>}
        <button className="at-icon-btn" title="Bổ sung / sửa tên cửa hàng" onClick={() => { setEditingPlace(key); setPlaceDraft(r.places || '') }}>
          <Pencil size={13} />
        </button>
      </span>
    )
  }

  const switchView = v => { setView(v); setPage(1) }

  return (
    <div className="at-page">
      <div className="at-header">
        <div>
          <h1>Chấm công Zalo & WhatsApp</h1>
          <p>Tổng hợp check-in, check-out và vị trí nhân viên gửi trong các group — theo nhân viên × ngày.</p>
        </div>
        <div className="at-header-actions">
          <button className="at-btn" onClick={view === 'mapping' ? loadIdentities : load} disabled={loading || mapLoading}>
            <RefreshCw size={15} className={loading || mapLoading ? 'at-spin' : ''} /> Làm mới
          </button>
          {view !== 'mapping' && (
            <button className="at-btn at-btn-primary" onClick={doExport} disabled={exporting}>
              <Download size={15} /> {exporting ? 'Đang xuất...' : 'Xuất .xlsx'}
            </button>
          )}
        </div>
      </div>

      <div className="at-filters">
        <div className="at-view-toggle">
          <button className={view === 'summary' ? 'at-toggle-on' : ''} onClick={() => switchView('summary')}>Tổng hợp chấm công</button>
          <button className={view === 'events' ? 'at-toggle-on' : ''} onClick={() => switchView('events')}>Chi tiết sự kiện</button>
          <button className={view === 'mapping' ? 'at-toggle-on' : ''} onClick={() => switchView('mapping')}>Gán mã NV</button>
        </div>
        {view !== 'mapping' && (
          <>
            <select value={groupName} onChange={resetPage(setGroupName)}>
              <option value="">Tất cả group</option>
              {groups.map(g => (
                <option key={`${g.src}-${g.group_name}`} value={g.group_name}>
                  {g.group_name} ({g.records})
                </option>
              ))}
            </select>
            <label className="at-date">Từ <input type="date" value={dateFrom} onChange={resetPage(setDateFrom)} /></label>
            <label className="at-date">Đến <input type="date" value={dateTo} onChange={resetPage(setDateTo)} /></label>
            <div className="at-search">
              <Search size={15} />
              <input placeholder="Tìm nhân viên, mã NV, nội dung, địa điểm..." value={query} onChange={e => setQuery(e.target.value)} />
            </div>
          </>
        )}
      </div>

      {view === 'mapping' ? (
        <>
          <div className="at-context">
            <div className="at-context-group">Gán mã nhân viên</div>
            <div className="at-rule">Tên hiển thị trên Zalo thường thiếu họ tên đầy đủ. Gán 1 lần theo tài khoản người gửi — từ đó trang chấm công và file xuất dùng họ tên chuẩn + mã NV, và ô tìm kiếm lọc được theo mã NV / họ tên chuẩn.</div>
          </div>
          {mapMsg && <div className="at-map-msg">{mapMsg}</div>}
          {error && <div className="at-error">{error}</div>}
          {mapLoading ? (
            <div className="at-empty">Đang tải...</div>
          ) : (
            <div className="at-map-list">
              <datalist id="at-emp-list">
                {employees.map(e => <option key={e.employee_code} value={empLabel(e)} />)}
              </datalist>
              {identities.map(row => {
                const key = `${row.src}|${row.sender_key}`
                const busy = savingKey === key
                return (
                  <article key={key} className="at-map-row">
                    <div className="at-map-head">
                      <span className="at-sum-name"><UserRound size={16} /> {row.sender_name}</span>
                      <span className="at-sub">{row.groups} · {row.records} tin</span>
                    </div>
                    {row.employee_code ? (
                      <div className="at-map-current">
                        <span className="at-map-assigned"><Link2 size={14} /> {row.employee_code} · {row.employee_name}{row.employee_department ? ' · ' + row.employee_department : ''} <span className="at-sub">({row.origin === 'auto' ? 'tự khớp' : 'thủ công'})</span></span>
                        <button className="at-btn" disabled={busy} onClick={() => saveIdentity(row, null)}><Unlink size={14} /> Xoá gán</button>
                      </div>
                    ) : (
                      <>
                        {row.suggestions?.length > 0 && (
                          <div className="at-chips">
                            <span className="at-sub">Ứng viên:</span>
                            {row.suggestions.map(sug => (
                              <button key={sug.employee_code} className="at-chip-btn" disabled={busy} onClick={() => saveIdentity(row, sug.employee_code)}>
                                {sug.employee_code} · {sug.full_name}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="at-map-form">
                          <input
                            list="at-emp-list"
                            placeholder="Gõ mã NV hoặc họ tên để tìm..."
                            value={picks[key] || ''}
                            onChange={e => setPicks(prev => ({ ...prev, [key]: e.target.value }))}
                          />
                          <button className="at-btn at-btn-primary" disabled={busy} onClick={() => savePick(row)}>Lưu gán</button>
                        </div>
                      </>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="at-context">
            <div className="at-context-group">{groupName || 'Tất cả group'}</div>
            <div className="at-context-sub">
              {fmtDayInput(dateFrom)} → {fmtDayInput(dateTo)} · {total} {view === 'summary' ? 'lượt ghé' : 'mục'}
            </div>
            {view === 'summary' && (
              <div className="at-rule">Mỗi lượt ghé cửa hàng = 1 box: các tin cách nhau dưới 45 phút gộp chung 1 lượt. Giờ IN = tín hiệu đầu lượt (vị trí 1), giờ OUT = tín hiệu cuối lượt (vị trí 2). Tên cửa hàng bấm nút bút chì để bổ sung/sửa.</div>
            )}
          </div>

          {error && <div className="at-error">{error}</div>}

          {loading ? (
            <div className="at-empty">Đang tải...</div>
          ) : rows.length === 0 ? (
            <div className="at-empty">Chưa có dữ liệu khớp bộ lọc.</div>
          ) : view === 'summary' ? (
            <>
              <div className="at-table-wrap">
                <table className="at-table">
                  <thead>
                    <tr>
                      <th>Ngày</th><th>Nhân viên</th>
                      <th>Giờ IN</th><th>Giờ OUT</th><th>Thời gian</th>
                      <th>Số tin</th><th>Địa điểm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={`${r.day}-${r.src}-${r.group_name}-${r.sender_key}-${r.visit_no}`}>
                        <td className="at-nowrap">{fmtDay(r.day)}</td>
                        <td>
                          <div><UserRound size={13} /> {displayName(r)}</div>
                          <div className="at-sub">{codeLine(r)}</div>
                        </td>
                        <td className="at-nowrap">{fmtTime(r.first_at)} <TypeChip type={r.first_type} /></td>
                        <td className="at-nowrap">{fmtTime(r.last_at)} <TypeChip type={r.last_type} /></td>
                        <td className="at-nowrap">{fmtDuration(r.duration_minutes)}</td>
                        <td className="at-nowrap">{r.events} tin <span className="at-sub">({eventBreakdown(r)})</span></td>
                        <td>{renderPlace(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="at-cards">
                {rows.map(r => (
                  <article key={`${r.day}-${r.src}-${r.group_name}-${r.sender_key}-${r.visit_no}`} className="at-sum-card">
                    <div className="at-sum-head">
                      <div>
                        <span className="at-sum-name"><UserRound size={16} /> {displayName(r)}</span>
                        <div className="at-sub">{codeLine(r)}</div>
                      </div>
                      <span className="at-sum-date">{fmtDay(r.day)}{r.visit_total > 1 ? ` · Lượt ${r.visit_no}/${r.visit_total}` : ''}</span>
                    </div>
                    <div className="at-sum-times">
                      <div><label>Giờ IN</label><strong>{fmtTime(r.first_at)}</strong><TypeChip type={r.first_type} /></div>
                      <div><label>Giờ OUT</label><strong>{fmtTime(r.last_at)}</strong><TypeChip type={r.last_type} /></div>
                      <div><label>Thời gian</label><strong>{fmtDuration(r.duration_minutes)}</strong></div>
                    </div>
                    <div className="at-sum-foot">
                      <span>{r.events} tin ghi nhận: {eventBreakdown(r)}</span>
                      <span><MapPin size={13} /> {renderPlace(r)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="at-list">
              {rows.map(item => item.kind === 'visit' ? (
                <article key={`v-${item.day}-${item.src}-${item.sender_key}-${item.visit_no}`} className="at-card at-visit-box">
                  <div className="at-visit-head">
                    <span className="at-sum-name"><UserRound size={16} /> {displayName(item)}</span>
                    <span className="at-card-time">{fmtDay(item.day)}{item.visit_total > 1 ? ` · Lượt ${item.visit_no}/${item.visit_total}` : ''}</span>
                  </div>
                  <div className="at-sub">{codeLine(item)}</div>
                  <div className="at-visit-io">
                    <span>IN <strong>{fmtTime(item.first_at)}</strong> <TypeChip type={item.first_type} /></span>
                    <span>→</span>
                    <span>OUT <strong>{fmtTime(item.last_at)}</strong> <TypeChip type={item.last_type} /></span>
                    <span className="at-sub">{fmtDuration(item.duration_minutes)}</span>
                  </div>
                  <div className="at-visit-place"><MapPin size={13} /> {renderPlace(item)}</div>
                  <div className="at-signals">
                    {item.signals.map(sig => (
                      <div key={sig.id} className="at-signal">
                        <TypeBadge type={sig.record_type} />
                        <span className="at-signal-time">{fmtTime(sig.created_at)}</span>
                        <span className="at-signal-text">
                          {sig.record_type === 'vitri'
                            ? (sig.lat != null && sig.lng != null
                              ? <a href={`https://www.google.com/maps?q=${sig.lat},${sig.lng}`} target="_blank" rel="noreferrer">{sig.lat}, {sig.lng}</a>
                              : (sig.content || sig.title || ''))
                            : (sig.title || sig.content || '')}
                          {sig.place && sig.record_type !== 'vitri' ? <span className="at-sub"> · {sig.place}</span> : null}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              ) : (
                <article key={`s-${item.record.src}-${item.record.id}`} className="at-card">
                  <div className="at-card-top">
                    <TypeBadge type={item.record.record_type} />
                    <span className={`at-status ${STATUS_META[item.record.status]?.cls || ''}`}>{STATUS_META[item.record.status]?.label || item.record.status}</span>
                    <span className="at-card-time"><Clock3 size={13} /> {fmtDateTime(item.record.created_at)}</span>
                  </div>
                  <h3>{item.record.title || item.record.content?.slice(0, 90) || '(Không có tiêu đề)'}</h3>
                  {item.record.title && item.record.content && item.record.record_type !== 'vitri' && <p className="at-card-content">{item.record.content}</p>}
                  <div className="at-card-meta">
                    {item.record.sender_name && <span><UserRound size={13} /> {displayName(item.record)}{item.record.employee_code ? ` · Mã ${item.record.employee_code}` : ''}</span>}
                    {item.record.place && <span><MapPin size={13} /> {item.record.place}</span>}
                    {(item.record.lat != null && item.record.lng != null) && (
                      <span><MapPin size={13} /> <a href={`https://www.google.com/maps?q=${item.record.lat},${item.record.lng}`} target="_blank" rel="noreferrer">{item.record.lat}, {item.record.lng}</a></span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="at-pagination">
            <button className="at-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Trước</button>
            <span>Trang {page}/{totalPages} · {total} {view === 'summary' ? 'dòng' : 'mục'}</span>
            <button className="at-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Sau →</button>
          </div>
        </>
      )}
    </div>
  )
}
