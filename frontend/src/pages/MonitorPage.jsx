import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, Database, Server, Layers, Ticket, CheckSquare,
  Calendar, ShieldCheck, Monitor as MonitorIcon, AlertTriangle, RefreshCw,
  Key as KeyIcon, UserCheck,
} from 'lucide-react'
import { formatDate } from '../utils/date'
import { getMonitorStats } from '../services/api'
import { normalizeOnlineUsers } from './monitorUtils'
import './MonitorPage.css'

const POLL_INTERVAL = 5000
const REQUEST_TIMEOUT = 10000
const MAX_RETRY_INTERVAL = 60000

function fmtUptime(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return '--'
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds < 0) return '--'
  const wholeSeconds = Math.floor(seconds)
  const d = Math.floor(wholeSeconds / 86400)
  const h = Math.floor((wholeSeconds % 86400) / 3600)
  const m = Math.floor((wholeSeconds % 3600) / 60)
  const s = wholeSeconds % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function fmtTime(value) {
  if (value === null || value === undefined || value === '' || (typeof value !== 'string' && typeof value !== 'number')) return '--'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString('vi-VN')
}

function metric(value) {
  if (value === null || value === undefined || value === '') return '--'
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString('vi-VN') : '--'
}

function displayText(value) {
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return '--'
}

function normalizeStats(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Dữ liệu giám sát không đúng định dạng')
  }
  for (const key of ['api', 'db', 'modules']) {
    const value = payload[key]
    if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) {
      throw new Error(`Dữ liệu giám sát không hợp lệ (${key})`)
    }
  }
  if (payload.activity !== undefined && !Array.isArray(payload.activity)) {
    throw new Error('Danh sách hoạt động không đúng định dạng')
  }
  for (const [key, values] of [['online_users', payload.online_users], ['activity', payload.activity]]) {
    if (Array.isArray(values) && values.some(value => !value || typeof value !== 'object' || Array.isArray(value))) {
      throw new Error(`Phần tử dữ liệu không hợp lệ (${key})`)
    }
  }
  const onlineUsers = normalizeOnlineUsers(payload.online_users)
  return {
    ...payload,
    api: payload.api || {},
    db: payload.db || {},
    modules: payload.modules || {},
    online_users: onlineUsers,
    activity: Array.isArray(payload.activity) ? payload.activity : null,
  }
}

function safeErrorMessage(error, timedOut) {
  if (timedOut) return `Request quá thời gian ${REQUEST_TIMEOUT / 1000} giây`
  const status = error?.response?.status
  if (status === 401) return 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
  if (status === 403) return 'Tài khoản hiện tại không có quyền xem trang giám sát.'
  if (status) return `Endpoint giám sát trả về HTTP ${status}.`
  if (error?.code === 'ERR_NETWORK') return 'Không thể kết nối endpoint giám sát.'
  return error?.message || 'Không thể tải dữ liệu giám sát.'
}

const MODULE_CARDS = [
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

const ACTIVITY_COLORS = {
  ticket: { label: 'Ticket', color: '#fbbf24' },
  todo: { label: 'Todo', color: '#60a5fa' },
  approval: { label: 'Duyệt', color: '#4ade80' },
}

export default function MonitorPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [requestFailed, setRequestFailed] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [latencyMs, setLatencyMs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authStopped, setAuthStopped] = useState(false)
  const [log, setLog] = useState([])

  const mountedRef = useRef(false)
  const requestRef = useRef(null)
  const requestSequenceRef = useRef(0)
  const inFlightRef = useRef(false)
  const timerRef = useRef(null)
  const resumeWhenIdleRef = useRef(false)
  const failuresRef = useRef(0)
  const authStoppedRef = useRef(false)
  const logIdRef = useRef(0)
  const fetchRef = useRef(null)

  const addLog = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString('vi-VN', { hour12: false })
    const id = ++logIdRef.current
    setLog(previous => [{ id, text: `[${timestamp}] ${message}` }, ...previous].slice(0, 50))
  }, [])

  const fetchStats = useCallback(async () => {
    if (!mountedRef.current || document.hidden || authStoppedRef.current || inFlightRef.current) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    inFlightRef.current = true
    const requestId = ++requestSequenceRef.current
    const controller = new AbortController()
    requestRef.current = controller
    let timedOut = false
    let retryDelay = POLL_INTERVAL
    const startedAt = performance.now()
    const timeoutId = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, REQUEST_TIMEOUT)

    setLoading(true)
    try {
      const response = await getMonitorStats({ signal: controller.signal })
      const nextStats = normalizeStats(response?.data)
      const elapsed = Math.max(0, performance.now() - startedAt)
      if (!mountedRef.current || requestId !== requestSequenceRef.current) return

      setStats(nextStats)
      setError('')
      setRequestFailed(false)
      setLastRefresh(new Date())
      setLatencyMs(elapsed)
      failuresRef.current = 0
      const apiStatus = nextStats.api.status ?? '--'
      const dbStatus = nextStats.db.status ?? '--'
      addLog(`poll /api/monitor/stats → API=${apiStatus} DB=${dbStatus} browser=${Math.round(elapsed)}ms`)
    } catch (requestError) {
      const wasCancelled = controller.signal.aborted && !timedOut
      if (wasCancelled || !mountedRef.current || requestId !== requestSequenceRef.current) return

      const status = requestError?.response?.status
      const message = safeErrorMessage(requestError, timedOut)
      setLatencyMs(Math.max(0, performance.now() - startedAt))
      setError(message)
      setRequestFailed(true)
      addLog(`ERROR /api/monitor/stats → ${message}`)
      failuresRef.current += 1
      retryDelay = Math.min(POLL_INTERVAL * (2 ** Math.min(failuresRef.current, 4)), MAX_RETRY_INTERVAL)

      if (status === 401 || status === 403) {
        authStoppedRef.current = true
        setAuthStopped(true)
        if (status === 401) {
          sessionStorage.clear()
          navigate('/login', { replace: true })
        }
      }
    } finally {
      window.clearTimeout(timeoutId)
      if (requestId === requestSequenceRef.current) {
        inFlightRef.current = false
        requestRef.current = null
        if (mountedRef.current) setLoading(false)
      }
      if (mountedRef.current && !document.hidden && !authStoppedRef.current && requestId === requestSequenceRef.current) {
        const delay = resumeWhenIdleRef.current ? 0 : retryDelay
        resumeWhenIdleRef.current = false
        timerRef.current = window.setTimeout(() => fetchRef.current?.(), delay)
      }
    }
  }, [addLog, navigate])

  useEffect(() => {
    fetchRef.current = fetchStats
  }, [fetchStats])

  useEffect(() => {
    mountedRef.current = true
    authStoppedRef.current = false

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = null
        requestRef.current?.abort()
      } else if (!authStoppedRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current)
        if (inFlightRef.current) {
          resumeWhenIdleRef.current = true
        } else {
          timerRef.current = window.setTimeout(() => fetchRef.current?.(), 0)
        }
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    if (!document.hidden) fetchRef.current?.()

    return () => {
      mountedRef.current = false
      requestSequenceRef.current += 1
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      requestRef.current?.abort()
      requestRef.current = null
      inFlightRef.current = false
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  const apiStatus = requestFailed ? 'Mất kết nối' : displayText(stats?.api?.status)
  const dbStatus = requestFailed ? 'Chưa xác định' : displayText(stats?.db?.status)
  const apiOk = !requestFailed && apiStatus === 'OK'
  const dbOk = !requestFailed && dbStatus === 'Connected'
  const uptime = fmtUptime(stats?.api?.uptime_sec)
  const onlineUsers = Array.isArray(stats?.online_users) ? stats.online_users : null
  const onlineCount = onlineUsers === null ? null : onlineUsers.length
  const modules = stats?.modules || {}
  const dataState = loading && !stats
    ? 'Đang tải lần đầu'
    : requestFailed && stats
      ? 'Dữ liệu cũ'
      : requestFailed
        ? 'Chưa có dữ liệu'
        : stats
          ? 'Dữ liệu mới'
          : 'Chưa có dữ liệu'

  const getModuleValue = key => key === 'online_users'
    ? metric(onlineCount)
    : metric(modules[key])

  const serverVersion = displayText(stats?.db?.version)
  const apiHost = displayText(stats?.api?.host)
  const serviceStatus = displayText(stats?.api?.service_status)

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
          <span className={`monitor-pill ${requestFailed ? 'degraded' : apiOk ? 'ok' : stats ? 'degraded' : 'unknown'}`}>
            <Server size={13} /> API {apiStatus}
          </span>
          <span className={`monitor-pill ${requestFailed ? 'unknown' : dbOk ? 'ok' : stats ? 'degraded' : 'unknown'}`}>
            <Database size={13} /> DB {dbStatus}
          </span>
          <button
            className="monitor-refresh"
            onClick={() => fetchRef.current?.()}
            disabled={loading || authStopped}
            title={authStopped ? 'Polling đã dừng do lỗi xác thực/quyền' : 'Làm mới ngay'}
          >
            <RefreshCw size={15} className={loading ? 'monitor-spin' : ''} />
            {loading ? 'Đang tải' : 'Làm mới'}
          </button>
        </div>
      </div>

      <div className={`monitor-data-state ${requestFailed ? 'stale' : !stats ? 'pending' : ''}`} role="status" aria-live="polite">
        <span className={`monitor-state-dot ${requestFailed ? 'error' : stats ? 'fresh' : 'pending'}`} />
        <strong>{dataState}</strong>
        <span>
          {lastRefresh
            ? `Cập nhật thành công cuối: ${fmtTime(lastRefresh)}`
            : loading ? 'Đang lấy dữ liệu từ backend.' : 'Chưa nhận được phản hồi thành công.'}
        </span>
        {latencyMs !== null && <span>Thời gian phản hồi từ trình duyệt: {Math.round(latencyMs)} ms</span>}
      </div>

      {error && (
        <div className="monitor-error">
          <AlertTriangle size={15} /> {error}
          {requestFailed && stats && <span>Đang giữ số liệu của lần cập nhật thành công gần nhất.</span>}
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
          {(apiHost || serviceStatus) && (
            <div className="monitor-line">
              <span className="monitor-tag-yellow">[SYS]</span>
              <span className="monitor-prompt">ops@monitor:~$</span>
              <span className="monitor-text">{apiHost || '--'}{serviceStatus ? ` · ${serviceStatus}` : ''}</span>
            </div>
          )}
          <div className="monitor-line">
            <span className="monitor-tag-yellow">[API]</span>
            <span className="monitor-text">
              app={displayText(stats?.api?.app)} ver={displayText(stats?.api?.version)} status="{apiStatus}"
            </span>
            {requestFailed && <span className="monitor-text red"> ← REQUEST FAILED</span>}
            {!requestFailed && stats?.api?.status && stats.api.status !== 'OK' && <span className="monitor-text red"> ← DEGRADED</span>}
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
              {dbStatus} — {serverVersion} · {metric(stats?.db?.active_tables)} tables · {metric(stats?.db?.total_employees)} employees
            </span>
            {!requestFailed && stats?.db?.status === 'Disconnected' && <span className="monitor-text red"> ← DISCONNECTED</span>}
          </div>
          <div className="monitor-line">
            <span className="monitor-tag-yellow">[LATENCY]</span>
            <span className="monitor-text">{latencyMs === null ? '--' : `${Math.round(latencyMs)} ms (trình duyệt)`}</span>
            {apiHost && <><span className="monitor-sep">|</span><span className="monitor-tag-yellow">[HOST]</span><span className="monitor-text">{apiHost}</span></>}
          </div>
        </div>
      </div>

      <div className="monitor-grid">
        {MODULE_CARDS.map(card => {
          const IconComp = card.icon
          return (
            <div key={card.key} className="monitor-card">
              <div className="monitor-card-icon" style={{ color: card.color, background: `${card.color}18` }}>
                <IconComp size={18} />
              </div>
              <div className="monitor-card-info">
                <div className="monitor-card-val">{getModuleValue(card.key)}</div>
                <div className="monitor-card-lbl">{card.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="monitor-log-section">
        <div className="monitor-log-header monitor-online-header">
          <UserCheck size={15} />
          <span>Người dùng trực tuyến</span>
          <span className="monitor-online-count" aria-label={onlineCount === null ? 'Chưa có tổng số online' : `Tổng cộng ${onlineCount} người online`}>
            <strong>{onlineCount === null ? '--' : onlineCount.toLocaleString('vi-VN')}</strong>
            <span>online</span>
          </span>
          <span className="monitor-log-updated">
            {requestFailed ? 'Dữ liệu cũ' : `Cập nhật mỗi ${POLL_INTERVAL / 1000}s`}
          </span>
        </div>
        <div className="monitor-online-hint">Đếm user có kết nối Chat đang hoạt động; danh sách bên dưới là toàn bộ user online.</div>
        <div className="monitor-online-body">
          {onlineUsers === null && <div className="monitor-log-empty">Danh sách online chưa có dữ liệu.</div>}
          {onlineUsers?.length === 0 && !requestFailed && <div className="monitor-log-empty">Không có ai đang trực tuyến.</div>}
          {onlineUsers?.map(user => {
            const code = user.employee_code
            const key = code
            return (
              <div key={key} className="monitor-online-item">
                <span className="monitor-online-dot" title="Đang trực tuyến" />
                <div className="monitor-online-info">
                  <span className="monitor-online-name">{displayText(user.full_name) !== '--' ? displayText(user.full_name) : displayText(code)}</span>
                  <span className="monitor-online-meta">
                    {displayText(code)}
                    {displayText(user.department) !== '--' ? ` · ${displayText(user.department)}` : ''}
                    {displayText(user.position) !== '--' ? ` · ${displayText(user.position)}` : ''}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="monitor-log-section">
        <div className="monitor-log-header">
          <Layers size={15} />
          <span>Nhật ký thăm dò (Poll Log)</span>
          <span className="monitor-log-updated">{lastRefresh ? `cập nhật ${fmtTime(lastRefresh)}` : ''}</span>
        </div>
        <div className="monitor-log-body">
          {log.length === 0 && <div className="monitor-log-empty">Đang chờ dữ liệu...</div>}
          {log.map(entry => <div key={entry.id} className="monitor-log-line">{entry.text}</div>)}
        </div>
      </div>

      {stats?.activity?.length > 0 && (
        <div className="monitor-log-section">
          <div className="monitor-log-header">
            <Activity size={15} />
            <span>Hoạt động gần đây</span>
          </div>
          <div className="monitor-log-body">
            {stats.activity.map((activity, index) => {
              const type = displayText(activity?.type) === '--' ? '' : displayText(activity.type)
              const meta = ACTIVITY_COLORS[type] || { label: type || '--', color: '#94a3b8' }
              const key = activity?.id || `${type}-${activity?.updated_at || ''}-${activity?.title || ''}-${index}`
              let updatedAt = '--'
              if (activity?.updated_at) {
                try { updatedAt = formatDate(activity.updated_at) || '--' } catch { updatedAt = '--' }
              }
              return (
                <div key={key} className="monitor-line">
                  <span className="monitor-tag" style={{ color: meta.color }}>[{meta.label}]</span>
                  <span className="monitor-text">{displayText(activity?.title) === '--' ? '(không tiêu đề)' : displayText(activity.title)}</span>
                  <span className="monitor-sep">|</span>
                  <span className="monitor-text">{displayText(activity?.status)}</span>
                  <span className="monitor-sep">|</span>
                  <span className="monitor-text dim">{updatedAt}</span>
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
          <span className="cli-tag-yellow">[HOST]</span>
          <span className="cli-text">{apiHost || '--'}</span>
          <span className="cli-sep">|</span>
          <span className="cli-tag-yellow">[LATENCY]</span>
          <span className="cli-text">{latencyMs === null ? '--' : `${Math.round(latencyMs)} ms (browser)`}</span>
          <span className="cli-sep">|</span>
          <span className="cli-tag-yellow">[DB]</span>
          <span className="cli-text">{dbStatus}</span>
          <span className="cli-sep">|</span>
          <span className="cli-tag-yellow">[UPTIME]</span>
          <span className="cli-text">{uptime}</span>
          <span className="cli-sep">|</span>
          <span className="cli-tag-yellow">[CLOCK]</span>
          <span className="cli-text">{lastRefresh ? fmtTime(lastRefresh) : '--'}</span>
        </div>
      </div>
    </div>
  )
}
