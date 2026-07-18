import React, { useMemo } from 'react'
import { formatDateDDMM } from '../../utils/bookingUtils'

const LABEL_W = 180
const HEADER_H = 38
const COL_W = 42
const BAR_H = 24
const LANE_H = 30
const DAY_MS = 86400000

const STATUS_COLORS = {
  active:    { bar: '#16a34a', bg: 'rgba(22,163,74,0.13)', text: '#16a34a' },
  finished:  { bar: '#94a3b8', bg: 'rgba(148,163,184,0.08)', text: '#64748b' },
  cancelled: { bar: '#ef4444', bg: 'rgba(239,68,68,0.07)', text: '#dc2626' },
}

const dayLabel = d => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()]

function isToday(d) {
  const t = new Date()
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
}

function isWeekend(d) {
  return d.getDay() === 0 || d.getDay() === 6
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / DAY_MS)
}

function assignLanes(trips) {
  const sorted = [...trips].sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
  const lanes = []
  for (const t of sorted) {
    const s = new Date(t.start_date).getTime()
    const e = new Date(t.end_date).getTime()
    let placed = false
    for (const lane of lanes) {
      const lastEnd = new Date(lane[lane.length - 1].end_date).getTime()
      if (s > lastEnd) { lane.push(t); placed = true; break }
    }
    if (!placed) lanes.push([t])
  }
  return lanes
}

export default function BusinessTripGrid({ trips, startDate, endDate, onTripClick }) {
  const isAdmin = sessionStorage.getItem('user_role') === 'admin'

  const dates = useMemo(() => {
    const arr = []
    let d = new Date(startDate)
    const end = new Date(endDate)
    while (d <= end) { arr.push(new Date(d)); d.setDate(d.getDate() + 1) }
    return arr
  }, [startDate, endDate])

  const rows = useMemo(() => {
    const map = {}
    trips.forEach(t => {
      const key = isAdmin ? (t.employee_code || t.full_name) : t.destination
      if (!map[key]) {
        map[key] = { key, full_name: t.full_name, department: t.department, employee_code: t.employee_code, destination: t.destination, lanes: [] }
      }
      map[key].lanes = assignLanes([...map[key].lanes.flat(), t])
    })
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key))
  }, [trips, isAdmin])

  const totalDays = dates.length
  const maxLanes = Math.max(1, ...rows.map(r => r.lanes.length))
  const rowH = Math.max(36, maxLanes * LANE_H + 6)

  const dayCls = (d) => {
    let c = 'btg-dc'
    if (isToday(d)) c += ' btg-dc-today'
    if (isWeekend(d)) c += ' btg-dc-weekend'
    return c
  }

  return (
    <div className="btg-wrap">
      <div className="btg-inner">
        <div className="btg-sidebar" style={{ width: LABEL_W }}>
          <div className="btg-sh" style={{ height: HEADER_H }}>
            {isAdmin ? 'Nhân viên' : 'Nơi đến'}
          </div>
          {rows.length === 0 ? null : rows.map((row, ri) => (
            <div key={ri} className={`btg-sr${ri % 2 === 1 ? ' btg-sr-alt' : ''}`} style={{ height: rowH }}>
              <div className="btg-sr-avatar">
                {row.full_name ? row.full_name.charAt(0).toUpperCase() : '?'}
              </div>
              <div className="btg-sr-info">
                <span className="btg-sr-name">{row.full_name}</span>
                {row.department && <span className="btg-sr-dept">{row.department}</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="btg-timeline">
          <div className="btg-th" style={{ height: HEADER_H }}>
            {dates.map((d, i) => (
              <div key={i} className={`btg-dc btg-dc-header${isToday(d) ? ' btg-dc-today' : ''}${isWeekend(d) ? ' btg-dc-weekend' : ''}`}
                style={{ width: COL_W }}>
                <div className="btg-dc-day">{dayLabel(d)}</div>
                <div className="btg-dc-num">{d.getDate()}</div>
              </div>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="btg-empty">Không có lịch công tác trong khoảng thời gian này.</div>
          ) : rows.map((row, ri) => (
            <div key={ri} className={`btg-tr${ri % 2 === 1 ? ' btg-tr-alt' : ''}`} style={{ height: rowH, position: 'relative' }}>
              <div className="btg-tr-bg">
                {dates.map((d, di) => (
                  <div key={di} className={dayCls(d)} style={{ width: COL_W }} />
                ))}
              </div>
              <div className="btg-bars">
                {row.lanes.map((lane, li) =>
                  lane.map((trip, ti) => {
                    const left = Math.max(0, daysBetween(dates[0], new Date(trip.start_date)))
                    const right = Math.min(totalDays - 1, daysBetween(dates[0], new Date(trip.end_date)))
                    const w = (right - left + 1) * COL_W - 2
                    const colors = STATUS_COLORS[trip.status] || STATUS_COLORS.active
                    const barTop = row.lanes.length > 1
                      ? li * LANE_H + Math.round((LANE_H - BAR_H) / 2) + 3
                      : Math.round((rowH - BAR_H) / 2)
                    return (
                      <div key={`${li}-${ti}`}
                        className={`btg-bar${trip.status === 'active' ? ' btg-bar-active' : ''}`}
                        style={{
                          left: left * COL_W,
                          width: Math.max(w, 4),
                          top: barTop,
                          height: BAR_H,
                          backgroundColor: colors.bg,
                          borderLeft: `3px solid ${colors.bar}`,
                          color: colors.text,
                        }}
                        onClick={() => onTripClick && onTripClick(trip)}
                        title={`${trip.destination} — ${trip.purpose}\n${formatDateDDMM(trip.start_date)} → ${formatDateDDMM(trip.end_date)} · ${trip.full_name}`}>
                        <span className="btg-bar-text">
                          {isAdmin ? `📍 ${trip.destination}` : trip.purpose}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
