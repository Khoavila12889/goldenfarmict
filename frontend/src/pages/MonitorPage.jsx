import React, { useState, useEffect } from 'react'
import {
  Activity, Database, Server, Clock, Layers, Ticket, CheckSquare,
  Calendar, ShieldCheck, Monitor as MonitorIcon, AlertTriangle, RefreshCw, Key as KeyIcon, UserCheck
} from 'lucide-react'
import { formatDate } from '../utils/date'
import { apiUrl } from '../services/api'
import './MonitorPage.css'

const POLL_INTERVAL = 5000

function fmtUptime(sec) {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function fmtTime(iso) {
  if (!iso) return '--'
  try {
    const d = new Date(iso)
    if (isNaN(d)) return iso
    return d.toLocaleTimeString('vi-VN')
  } catch {
    return iso
  }
}

const STATUS_LABELS = {
  ticket: { label: 'Ticket', color: '#fbbf24' },
  todo: { label: 'Todo', color: '#60a5fa' },
  approval: { label: 'Duyệt', color: '#4ade80' },
}

export default function MonitorPage() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState(null)
  const [log, setLog] = useState([])

  const fetchStats = async () => {
    try {
      const res = await fetch(apiUrl('/monitor/stats'))
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data = await res.json()
      setStats(data)
      setError('')
      setLastRefresh(new Date())
      setLog(prev => {
        const ts = new Date().toLocaleTimeString('vi-VN', { hour12: false })
        const line = `[${ts}] poll /api/monitor/stats → api.status="${data.api?.status}" db.status="${data.db?.status}"`
        return [line, ...prev].slice(0, 50)
      })
    } catch (err) {
      setError(err.message || 'Không thể kết nối monitor API')
      setLog(prev => {
        const ts = new Date().toLocaleTimeString('vi-VN', { hour12: false })
        return [`[${ts}] ERROR → ${error || err.message}`, ...prev].slice(0, 50)
      })
    }
  }

  useEffect(() => {
    fetchStats()
    const timer = setInterval(fetchStats, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [])

  const apiStatus = stats?.api?.status || '--'
  const dbStatus = stats?.db?.status || '--'
  const apiOk = apiStatus === 'OK'
  const dbOk = dbStatus === 'Connected'
  const uptime = fmtUptime(stats?.api?.uptime_sec || 0)

  const modules = stats?.modules || {}
  const onlineUsers = stats?.online_users || []
  const onlineCount = onlineUsers.length
  const moduleCards = [
    { key: 'tickets', label: 'Tickets', icon: Ticket, color: '#fbbf24' },
    { key: 'tickets_pending', label: 'Tickets chờ xử lý', icon: AlertTriangle, color: '#f87171' },
    { key: 'todos', label: 'Todos', icon: CheckSquare, color: '#60a5fa' },
    { key: 'todos_in_progress', label: 'Todos đang làm', icon: RefreshCw, color: '#38bdf8' },
    { key: 'bookings_active', label: 'Booking đang mở', icon: Calendar, color: '#a78bfa' },
    { key: 'approvals_pending', label: 'Duyệt chờ xử lý', icon: ShieldCheck, color: '#4ade80' },
    { key: 'equipment', label: 'Thiết bị', icon: MonitorIcon, color: '#f472b6' },
    { key: 'licenses', label: 'License', icon: KeyIcon, color: '#34d399' },
    { key: 'online_users', label: 'Người đang online', icon: UserCheck, color: '#22c55e' },
  ]

  return (
    <div className="monitor-page">
      <div className="monitor-header">
        <div className="monitor-title-section">
          <div className="monitor-title-icon"><Activity size={24} /></div>
          <div>
            <h1 className="monitor-title">Hệ thống giám sát (Admin)</h1>
            <div className="monitor-subtitle">
              Trạng thái API, Database & hoạt động gần đây — tự động làm mới mỗi {POLL_INTERVAL / 1000}s
            </div>
          </div>
        </div>
        <div className="monitor-header-actions">
          <span className={`monitor-pill ${apiOk ? 'ok' : 'degraded'}`}>
            <Server size={13} /> API {apiStatus}
          </span>
          <span className={`monitor-pill ${dbOk ? 'ok' : 'degraded'}`}>
            <Database size={13} /> DB {dbStatus}
          </span>
          <button className="monitor-refresh" onClick={fetchStats} title="Làm mới ngay">
            <RefreshCw size={15} /> Làm mới
          </button>
        </div>
      </div>

      {error && (
        <div className="monitor-error">
          <AlertTriangle size={15} /> Không thể kết nối endpoint giám sát: {error}
        </div>
      )}

      <div className="monitor-terminal">
        <div className="monitor-term-titlebar">
          <span className="monitor-dot red" />
          <span className="monitor-dot yellow" />
          <span className="monitor-dot green" />
          <span className="monitor-term-title">user@ops-station:~$ monitor --live</span>
        </div>

        <div className="monitor-term-body">
          <div className="monitor-line">
            <span className="monitor-tag-yellow">[SYS]</span>
            <span className="monitor-prompt">root@srv-hcmc-main:~$</span>
            <span className="monitor-text">goldenfarm-ict-monitor.service (active)</span>
          </div>
          <div className="monitor-line">
            <span className="monitor-tag-yellow">[API]</span>
            <span className="monitor-text">
              app={stats?.api?.app || '--'} ver={stats?.api?.version || '--'} status="{apiStatus}"
            </span>
            {!apiOk && <span className="monitor-text red"> ← DEGRADED</span>}
          </div>
          <div className="monitor-line">
            <span className="monitor-tag-yellow">[UPTIME]</span>
            <span className="monitor-text">uptime={uptime}</span>
            <span className="monitor-sep">|</span>
            <span className="monitor-text">started_at={fmtTime(stats?.api?.started_at)}</span>
          </div>
          <div className="monitor-line">
            <span className="monitor-tag-blue">[DB]</span>
            <span className="monitor-text">
              {dbStatus} — {stats?.db?.version || 'n/a'} · {stats?.db?.active_tables || 0} tables · {stats?.db?.total_employees || 0} employees
            </span>
            {!dbOk && <span className="monitor-text red"> ← DISCONNECTED</span>}
          </div>
          <div className="monitor-line">
            <span className="monitor-tag-yellow">[VER]</span>
            <span className="monitor-text">{stats?.api?.version || '--'}_stable</span>
            <span className="monitor-sep">|</span>
            <span className="monitor-tag-yellow">[LATENCY]</span>
            <span className="monitor-text">~{stats ? '<30ms' : '--'}</span>
          </div>
        </div>
      </div>

      <div className="monitor-grid">
        {moduleCards.map(card => {
          const IconComp = card.icon
          return (
            <div key={card.key} className="monitor-card">
              <div className="monitor-card-icon" style={{ color: card.color, background: `${card.color}18` }}>
                <IconComp size={18} />
              </div>
              <div className="monitor-card-info">
                <div className="monitor-card-val">{modules[card.key] ?? (card.key === 'online_users' ? onlineCount : '--')}</div>
                <div className="monitor-card-lbl">{card.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Người dùng trực tuyến (chẩn đoán user đang online) ── */}
      <div className="monitor-log-section">
        <div className="monitor-log-header">
          <UserCheck size={15} />
          <span>Người dùng trực tuyến</span>
          <span className="monitor-log-updated">{onlineCount} người · cập nhật mỗi {POLL_INTERVAL / 1000}s</span>
        </div>
        <div className="monitor-online-body">
          {onlineCount === 0 && <div className="monitor-log-empty">Không có ai đang trực tuyến.</div>}
          {onlineUsers.map(u => (
            <div key={u.employee_code} className="monitor-online-item">
              <span className="monitor-online-dot" title="Đang trực tuyến" />
              <div className="monitor-online-info">
                <span className="monitor-online-name">{u.full_name || u.employee_code}</span>
                <span className="monitor-online-meta">
                  {u.employee_code}
                  {u.department ? ` · ${u.department}` : ''}
                  {u.position ? ` · ${u.position}` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="monitor-log-section">
        <div className="monitor-log-header">
          <Layers size={15} />
          <span>Nhật ký thăm dò (Poll Log)</span>
          <span className="monitor-log-updated">
            {lastRefresh ? `cập nhật ${lastRefresh.toLocaleTimeString('vi-VN')}` : ''}
          </span>
        </div>
        <div className="monitor-log-body">
          {log.length === 0 && <div className="monitor-log-empty">Đang chờ dữ liệu...</div>}
          {log.map((line, i) => (
            <div key={i} className="monitor-log-line">{line}</div>
          ))}
        </div>
      </div>

      {stats?.activity?.length > 0 && (
        <div className="monitor-log-section">
          <div className="monitor-log-header">
            <Activity size={15} />
            <span>Hoạt động gần đây</span>
          </div>
          <div className="monitor-log-body">
            {stats.activity.map((a, i) => {
              const meta = STATUS_LABELS[a.type] || { label: a.type, color: '#94a3b8' }
              return (
                <div key={i} className="monitor-line">
                  <span className="monitor-tag" style={{ color: meta.color }}>[{meta.label}]</span>
                  <span className="monitor-text">{a.title || '(không tiêu đề)'}</span>
                  <span className="monitor-sep">|</span>
                  <span className="monitor-text">{a.status}</span>
                  <span className="monitor-sep">|</span>
                  <span className="monitor-text dim">{a.updated_at ? formatDate(a.updated_at) : '--'}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="monitor-cli-footer">
        <div className="cli-status-bar">
          <span className="cli-tag-yellow">[PROMPT]</span>
          <span className="cli-user">user@ops-station:~$</span>
          <span className="cli-tag-blue">[INFO]</span>
          <span className="cli-text">api.status="{apiStatus}"</span>
          <span className="cli-tag-yellow">[VER]</span>
          <span className="cli-text">{stats?.api?.version || '--'}_stable</span>
          <span className="cli-sep">|</span>
          <span className="cli-tag-yellow">[HOST]</span>
          <span className="cli-text">srv-hcmc-main</span>
          <span className="cli-sep">|</span>
          <span className="cli-tag-yellow">[LATENCY]</span>
          <span className="cli-text">~{stats ? '<30ms' : '--'}</span>
          <span className="cli-sep">|</span>
          <span className="cli-tag-yellow">[DB]</span>
          <span className="cli-text">{dbStatus}</span>
          <span className="cli-sep">|</span>
          <span className="cli-tag-yellow">[UPTIME]</span>
          <span className="cli-text">{uptime}</span>
          <span className="cli-sep">|</span>
          <span className="cli-tag-yellow">[CLOCK]</span>
          <span className="cli-text">{lastRefresh ? lastRefresh.toLocaleTimeString('vi-VN') : '--'}</span>
        </div>
      </div>
    </div>
  )
}
