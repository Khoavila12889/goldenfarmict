import React, { useEffect, useMemo, useState } from 'react'
import { getApiBase } from '../services/api'
import './Reports.css'

// ─── Helpers ────────────────────────────────────────────────────────────────
function authParams() {
  return {
    employee_code: sessionStorage.getItem('user_code') || '',
    token: sessionStorage.getItem('token') || '',
    role: sessionStorage.getItem('user_role') || '',
  }
}

async function apiGet(path, extra = {}) {
  const qs = new URLSearchParams({ ...authParams(), ...extra })
  const res = await fetch(`${getApiBase()}${path}?${qs.toString()}`)
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`${res.status}: ${txt.slice(0, 160)}`)
  }
  return res.json()
}

function fmtNum(v) {
  if (typeof v !== 'number') return v
  if (Number.isInteger(v)) return v.toLocaleString('vi-VN')
  return v.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
}

function fmtKpi(k) {
  const v = k.value
  if (typeof v !== 'number') return String(v ?? '')
  if (k.unit === 'đ') {
    if (Math.abs(v) >= 1e9) return `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`
    return `${fmtNum(v)} đ`
  }
  return fmtNum(v)
}

function fmtCell(v) {
  if (typeof v === 'number') return fmtNum(v)
  return v ?? ''
}

const PALETTE = ['#d97706', '#059669', '#2563eb', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#9333ea']

// ─── Charts (SVG thuần, không thêm thư viện) ────────────────────────────────
function BarItems({ items }) {
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div className="rp-bars">
      {items.map((it, idx) => (
        <div key={idx} className="rp-bar-row">
          <div className="rp-bar-name" title={it.name}>{it.name}</div>
          <div className="rp-bar-track">
            <div className="rp-bar-fill" style={{ width: `${Math.max(2, (it.value / max) * 100)}%`, background: PALETTE[idx % PALETTE.length] }} />
          </div>
          <div className="rp-bar-val">{fmtNum(it.value)}</div>
        </div>
      ))}
      {items.length === 0 && <div className="rp-empty">Chưa có dữ liệu</div>}
    </div>
  )
}

function LineItems({ items }) {
  const w = 640, h = 180, pad = 26
  const max = Math.max(...items.map(i => i.value), 1)
  const step = items.length > 1 ? (w - pad * 2) / (items.length - 1) : 0
  const pts = items.map((it, i) => [pad + i * step, h - pad - (it.value / max) * (h - pad * 2)])
  const line = pts.map(p => p.join(',')).join(' ')
  const area = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`
  const labelIdx = items.length > 10 ? items.map((_, i) => i).filter(i => i % Math.ceil(items.length / 6) === 0) : items.map((_, i) => i)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="rp-svg" role="img">
      <polygon points={area} fill="#d97706" opacity="0.12" />
      <polyline points={line} fill="none" stroke="#d97706" strokeWidth="2" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="#d97706" />)}
      {labelIdx.map(i => (
        <text key={i} x={pts[i][0]} y={h - 6} fontSize="9" textAnchor="middle" fill="#64748b">
          {String(items[i].name).slice(5)}
        </text>
      ))}
      <text x={pad} y={14} fontSize="10" fill="#64748b">max {fmtNum(max)}</text>
    </svg>
  )
}

function DonutItems({ items }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1
  const R = 62, C = 2 * Math.PI * R
  let off = 0
  const segs = items.map((it, idx) => {
    const frac = it.value / total
    const seg = { ...it, dash: `${frac * C} ${C}`, offset: -off * C, color: PALETTE[idx % PALETTE.length], pct: (frac * 100).toFixed(1) }
    off += frac
    return seg
  })
  return (
    <div className="rp-donut-wrap">
      <svg viewBox="0 0 160 160" className="rp-donut">
        {segs.map((s, i) => (
          <circle key={i} cx="80" cy="80" r={R} fill="none" stroke={s.color} strokeWidth="20"
            strokeDasharray={s.dash} strokeDashoffset={s.offset} transform="rotate(-90 80 80)" />
        ))}
        <text x="80" y="76" textAnchor="middle" fontSize="17" fontWeight="700" fill="#0f172a">{fmtNum(total)}</text>
        <text x="80" y="94" textAnchor="middle" fontSize="9" fill="#64748b">tổng</text>
      </svg>
      <div className="rp-legend">
        {segs.map((s, i) => (
          <div key={i} className="rp-legend-row">
            <span className="rp-dot" style={{ background: s.color }} />
            <span className="rp-legend-name">{s.name}</span>
            <span className="rp-legend-val">{fmtNum(s.value)} · {s.pct}%</span>
          </div>
        ))}
        {items.length === 0 && <div className="rp-empty">Chưa có dữ liệu</div>}
      </div>
    </div>
  )
}

function ChartView({ chart }) {
  if (!chart) return null
  return (
    <div className="rp-card">
      <div className="rp-card-title">{chart.title}</div>
      {chart.kind === 'donut' ? <DonutItems items={chart.items || []} />
        : chart.kind === 'line' ? <LineItems items={chart.items || []} />
        : <BarItems items={chart.items || []} />}
    </div>
  )
}

function ReportTable({ table, onRow }) {
  if (!table) return null
  return (
    <div className="rp-card">
      <div className="rp-card-title">{table.title}</div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr>{table.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
          <tbody>
            {table.rows.map((r, i) => {
              const id = table.ids?.[i]
              return (
                <tr key={i} className={onRow && id ? 'rp-click' : undefined}
                  onClick={onRow && id ? () => onRow(id) : undefined}
                  title={onRow && id ? 'Bấm để xem nội dung công việc' : undefined}>
                  {r.map((c, j) => <td key={j}>{fmtCell(c)}</td>)}
                </tr>
              )
            })}
            {table.rows.length === 0 && (
              <tr><td colSpan={table.columns.length} className="rp-empty-cell">Chưa có dữ liệu</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const TODO_STATUS = { todo: 'Chưa làm', in_progress: 'Đang thực hiện', review: 'Chờ duyệt', completed: 'Hoàn thành', cancelled: 'Đã hủy' }

// ─── Page ───────────────────────────────────────────────────────────────────
export default function Reports() {
  const [index, setIndex] = useState([])
  const [active, setActive] = useState('dieuhanh')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 29)
    return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [dept, setDept] = useState('')
  const [depts, setDepts] = useState([])
  const [isFull, setIsFull] = useState(false)
  const [todo, setTodo] = useState(null)

  const openTodo = (id) => {
    setTodo({ loading: true })
    apiGet(`/reports/todo/${id}`)
      .then(d => setTodo(d.data))
      .catch(e => setTodo({ error: e.message }))
  }

  useEffect(() => {
    apiGet('/reports')
      .then(d => {
        const allowed = (d.data || []).filter(x => x.allowed)
        setIndex(allowed)
        setDepts(d.departments || [])
        setIsFull(!!d.full)
        setActive(prev => (allowed.some(x => x.key === prev) ? prev : (allowed[0]?.key || '')))
      })
      .catch(e => setError(e.message))
  }, [])

  const activeItem = index.find(x => x.key === active)
  const deptParam = isFull && activeItem?.scopable ? dept : ''

  useEffect(() => {
    if (!active) return
    setLoading(true); setError('')
    apiGet(`/reports/${active}`, { from, to, ...(deptParam ? { dept: deptParam } : {}) })
      .then(setData)
      .catch(e => { setError(e.message); setData(null) })
      .finally(() => setLoading(false))
  }, [active, from, to, deptParam])

  const charts = useMemo(() => {
    if (!data) return []
    const list = [...(data.charts || [])]
    if (data.chart) list.unshift(data.chart)
    return list
  }, [data])

  return (
    <div className="rp-page">

      <div className="rp-head">
        <h1 className="page-title" style={{ margin: 0 }}>Báo cáo</h1>
        <div className="rp-dates">
          {isFull && activeItem?.scopable && (
            <label>Phòng ban
              <select className="rp-deptsel" value={dept} onChange={e => setDept(e.target.value)}>
                <option value="">Toàn công ty</option>
                {depts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          )}
          <label>Từ ngày<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label>Đến ngày<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        </div>
      </div>

      <div className="rp-tabs">
        {index.map(it => (
          <button key={it.key} className={`rp-tab ${active === it.key ? 'on' : ''} ${it.built ? '' : 'off'}`}
            onClick={() => setActive(it.key)}>
            {it.title}
          </button>
        ))}
      </div>

      {error && <div className="rp-err">Không tải được báo cáo. {error.includes('403') ? 'Báo cáo chỉ dành cho trưởng phòng và quản trị viên.' : error}</div>}
      {loading && <div className="rp-loading">Đang tải số liệu…</div>}

      {data && !loading && (
        <>
          <div className="rp-scope">{data.scope ? `Phạm vi số liệu: phòng ${data.scope}` : 'Phạm vi số liệu: toàn công ty'}</div>
          {data.kpis.length > 0 && (
            <div className="rp-kpis">
              {data.kpis.map((k, i) => (
                <div key={i} className="rp-kpi">
                  <div className="rp-kpi-lb">{k.label}</div>
                  <div className="rp-kpi-v">{fmtKpi(k)}{k.unit && k.unit !== 'đ' ? <small> {k.unit}</small> : null}</div>
                  {k.delta !== null && k.delta !== undefined && (
                    <span className={`rp-delta ${k.delta >= 0 ? 'up' : 'down'}`}>
                      {k.delta >= 0 ? '▲' : '▼'} {Math.abs(k.delta).toLocaleString('vi-VN')}% so với kỳ trước
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {charts.length > 0 && (
            <div className="rp-grid">
              {charts.map((c, i) => <ChartView key={i} chart={c} />)}
            </div>
          )}

          {data.actions && <ReportTable table={data.actions} onRow={openTodo} />}
          {data.details && <ReportTable table={data.details} />}

          {data.notes && data.notes.length > 0 && (
            <div className="rp-notes">
              {data.notes.map((n, i) => <div key={i}>• {n}</div>)}
            </div>
          )}
        </>
      )}

      {todo && (
        <div className="rp-modal-back" onClick={() => setTodo(null)}>
          <div className="rp-modal" onClick={e => e.stopPropagation()}>
            {todo.loading ? <p className="rp-modal-load">Đang tải nội dung công việc…</p>
              : todo.error ? <p className="rp-err">Không mở được công việc. {todo.error}</p>
              : (
                <>
                  <div className="rp-modal-head">
                    <h3>{todo.title}</h3>
                    <button className="rp-modal-x" onClick={() => setTodo(null)}>✕</button>
                  </div>
                  <div className="rp-modal-meta">
                    <div><span>Phòng ban</span><b>{todo.department || '—'}</b></div>
                    <div><span>Người thực hiện</span><b>{todo.assignee_name || '—'}</b></div>
                    <div><span>Người giao</span><b>{todo.creator_name || '—'}</b></div>
                    <div><span>Trạng thái</span><b>{TODO_STATUS[todo.status] || todo.status || '—'}</b></div>
                    <div><span>Ưu tiên</span><b>{todo.priority || '—'}</b></div>
                    <div><span>Hạn</span><b>{todo.due || '—'}</b></div>
                    <div><span>Ngày tạo</span><b>{todo.created || '—'}</b></div>
                    {todo.completed && <div><span>Hoàn thành</span><b>{todo.completed}</b></div>}
                  </div>
                  <div className="rp-modal-lb">Nội dung công việc</div>
                  <div className="rp-modal-desc">{todo.description || '(Chưa có nội dung mô tả)'}</div>
                  {todo.tags ? <div className="rp-modal-tags">Tags: {String(todo.tags)}</div> : null}
                </>
              )}
          </div>
        </div>
      )}
    </div>
  )
}
