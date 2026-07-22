import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Folder, File, FolderOpen, Plus, Trash2,
  Server, Wifi, Cloud, RefreshCw, ChevronRight, Home, Shield,
  MoreVertical, FileText, Archive, Image, Eye,
  FileSpreadsheet, FileCode, Music, Video, FileCog,
  Download, LayoutGrid, List, Search, X
} from 'lucide-react'
import '../styles/shared.css'
import './Documents.css'
import FileViewer from '../components/FileViewer'
import { getStorageConfigs, browseStorage, getStoragePermissions, createStoragePermission, deleteStoragePermission, createStorageConfig, updateStorageConfig, deleteStorageConfig, testStorageConnection, testStorageConnectionDirect, getStorageDepartments } from '../services/api'

const INITIAL_CONFIG = { name: '', type: 'smb', host: '', port: 445, username: '', password: '', remote_path: '', domain: '' }

function getFileIcon(name, isDir) {
  if (isDir) return { icon: FolderOpen, color: '#f59e0b' }
  const ext = name.split('.').pop().toLowerCase()
  const map = {
    pdf:    { icon: FileText, color: '#dc2626' },
    doc:    { icon: FileText, color: '#2563eb' },
    docx:   { icon: FileText, color: '#2563eb' },
    xls:    { icon: FileSpreadsheet, color: '#16a34a' },
    xlsx:   { icon: FileSpreadsheet, color: '#16a34a' },
    ppt:    { icon: FileText, color: '#c026d3' },
    pptx:   { icon: FileText, color: '#c026d3' },
    txt:    { icon: FileCode, color: '#64748b' },
    csv:    { icon: FileSpreadsheet, color: '#16a34a' },
    zip:    { icon: Archive, color: '#64748b' },
    rar:    { icon: Archive, color: '#64748b' },
    '7z':   { icon: Archive, color: '#64748b' },
    tar:    { icon: Archive, color: '#64748b' },
    gz:     { icon: Archive, color: '#64748b' },
    exe:    { icon: FileCog, color: '#1e293b' },
    msi:    { icon: FileCog, color: '#1e293b' },
    jpg:    { icon: Image, color: '#16a34a' },
    jpeg:   { icon: Image, color: '#16a34a' },
    png:    { icon: Image, color: '#16a34a' },
    gif:    { icon: Image, color: '#16a34a' },
    svg:    { icon: Image, color: '#16a34a' },
    webp:   { icon: Image, color: '#16a34a' },
    mp4:    { icon: Video, color: '#7c3aed' },
    avi:    { icon: Video, color: '#7c3aed' },
    mov:    { icon: Video, color: '#7c3aed' },
    mkv:    { icon: Video, color: '#7c3aed' },
    mp3:    { icon: Music, color: '#7c3aed' },
    wav:    { icon: Music, color: '#7c3aed' },
    flac:   { icon: Music, color: '#7c3aed' },
  }
  return map[ext] || { icon: File, color: '#94a3b8' }
}

function formatSize(bytes) {
  if (bytes == null || bytes === 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return (i === 0 ? size.toFixed(0) : size.toFixed(1)) + ' ' + units[i]
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}/${month}/${year}`
  } catch { return '' }
}

function SkeletonRows({ count = 5 }) {
  return (
    <div className="doc-grid-body">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="doc-grid-row doc-skeleton-row">
          <div className="doc-col-name"><span className="skeleton skeleton-icon" /><span className="skeleton skeleton-text" style={{ width: `${40 + Math.random() * 40}%` }} /></div>
          <div className="doc-col-size"><span className="skeleton" style={{ width: 50 }} /></div>
          <div className="doc-col-date"><span className="skeleton" style={{ width: 70 }} /></div>
          <div className="doc-col-actions"><span className="skeleton skeleton-icon" /></div>
        </div>
      ))}
    </div>
  )
}

function SkeletonCards({ count = 8 }) {
  return (
    <div className="doc-card-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="doc-card doc-card-skeleton">
          <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 12 }} />
          <div className="skeleton" style={{ width: '70%', height: 14, marginTop: 8 }} />
          <div className="skeleton" style={{ width: '40%', height: 11, marginTop: 4 }} />
        </div>
      ))}
    </div>
  )
}

export default function Documents() {
  const userRole = sessionStorage.getItem('user_role') || 'user'
  const userCode = sessionStorage.getItem('user_code') || ''
  const isAdmin = userRole === 'admin' || userRole === 'head'

  const [configs, setConfigs] = useState([])
  const [activeConfig, setActiveConfig] = useState(null)
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: '/', name: 'Home' }])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [browseError, setBrowseError] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const [configForm, setConfigForm] = useState({ ...INITIAL_CONFIG })
  const [editingConfig, setEditingConfig] = useState(null)
  const [testMsg, setTestMsg] = useState('')
  const [testOk, setTestOk] = useState(false)
  const [perms, setPerms] = useState([])
  const [showPerms, setShowPerms] = useState(false)
  const [departments, setDepartments] = useState([])
  const [permForm, setPermForm] = useState({ folder_path: '/', role: '', employee_code: '', department: '', permission: 'read' })

  const [viewerFile, setViewerFile] = useState(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, file: null })

  // View mode & search
  const [viewMode, setViewMode] = useState('grid')
  const [searchQuery, setSearchQuery] = useState('')

  const loadConfigs = useCallback(() => {
    getStorageConfigs(userCode, userRole).then(r => setConfigs(r.data?.data || [])).catch(() => {})
  }, [])

  useEffect(() => { loadConfigs() }, [loadConfigs])

  useEffect(() => {
    getStorageDepartments().then(r => setDepartments(r.data?.data || [])).catch(() => {})
  }, [])

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const q = searchQuery.toLowerCase()
    return entries.filter(e => e.name.toLowerCase().includes(q))
  }, [entries, searchQuery])

  function selectConfig(cfg) {
    setActiveConfig(cfg)
    setBrowseError('')
    setSearchQuery('')
    const isGdrive = cfg?.type === 'gdrive'
    const rootId = isGdrive ? (cfg.remote_path || 'root') : '/'
    setBreadcrumbs([{ id: rootId, name: 'Home' }])
    setEntries([])
    if (cfg) browseFolder(cfg.id, rootId)
  }

  function browseFolder(configId, folderId) {
    setLoading(true)
    setBrowseError('')
    setSearchQuery('')
    browseStorage(configId, folderId, userCode, userRole)
      .then(r => { setEntries(r.data?.data || []) })
      .catch(err => {
        setEntries([])
        const msg = err.response?.data?.detail || err.message || 'Không thể kết nối storage'
        setBrowseError(msg)
      })
      .finally(() => setLoading(false))
  }

  function openFolder(entry) {
    if (!entry.is_dir || !activeConfig) return
    const isGdrive = activeConfig.type === 'gdrive'
    if (isGdrive) {
      setBreadcrumbs(prev => [...prev, { id: entry.id, name: entry.name }])
      browseFolder(activeConfig.id, entry.id)
    } else {
      const newPath = (breadcrumbs.at(-1).id === '/' ? '' : breadcrumbs.at(-1).id) + '/' + entry.name
      setBreadcrumbs(prev => [...prev, { id: newPath, name: entry.name }])
      browseFolder(activeConfig.id, newPath)
    }
  }

  function canPreviewFile(fileName) {
    const ext = fileName.split('.').pop().toLowerCase()
    const previewable = [
      'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico',
      'pdf', 'txt', 'log', 'md', 'json', 'xml', 'csv',
      'html', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'sql',
      'mp4', 'webm', 'ogg', 'mp3', 'wav', 'm4a',
      'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'
    ]
    return previewable.includes(ext)
  }

  async function handlePreviewFile(entry) {
    if (entry.is_dir) return
    const currentPath = breadcrumbs.at(-1).id
    const normalizedPath = currentPath === '/'
      ? entry.name
      : `${currentPath.replace(/\/$/, '')}/${entry.name}`
    const fileUrl = `/api/documents/download?config_id=${activeConfig.id}&file_path=${encodeURIComponent(normalizedPath)}&user_code=${userCode}&user_role=${userRole}`
    setViewerFile({
      name: entry.name,
      url: fileUrl,
      size: entry.size,
      type: entry.name.split('.').pop().toLowerCase()
    })
    setViewerOpen(true)
  }

  useEffect(() => {
    if (!contextMenu.visible) return
    const close = () => setContextMenu({ visible: false })
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu.visible])

  function handleContextMenu(e, entry) {
    e.preventDefault()
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, file: entry })
  }

  async function handleDownloadFile(entry) {
    if (entry.is_dir) return
    const currentPath = breadcrumbs.at(-1).id
    const normalizedPath = currentPath === '/'
      ? entry.name
      : `${currentPath.replace(/\/$/, '')}/${entry.name}`
    const fileUrl = `/api/documents/download?config_id=${activeConfig.id}&file_path=${encodeURIComponent(normalizedPath)}&user_code=${userCode}&user_role=${userRole}`
    try {
      const response = await fetch(fileUrl, {
        headers: {
          'Authorization': 'Bearer ' + sessionStorage.getItem('token')
        }
      })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = entry.name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000)
    } catch (err) {
      alert('Tải file thất bại: ' + (err.message || ''))
    }
    setContextMenu({ visible: false })
  }

  function browseBreadcrumb(idx) {
    const target = breadcrumbs[idx]
    if (!target) return
    setBreadcrumbs(prev => prev.slice(0, idx + 1))
    browseFolder(activeConfig.id, target.id)
  }

  function goBack() {
    if (breadcrumbs.length <= 1) return
    browseBreadcrumb(breadcrumbs.length - 2)
  }

  function openConfigForm(cfg) {
    setTestMsg('')
    setTestOk(false)
    if (cfg) {
      setEditingConfig(cfg)
      setConfigForm({ name: cfg.name, type: cfg.type, host: cfg.host || '', port: cfg.port || 0, username: cfg.username || '', password: '', remote_path: cfg.remote_path || '', domain: cfg.domain || '' })
    } else {
      setEditingConfig(null)
      setConfigForm({ ...INITIAL_CONFIG })
    }
    setShowConfig(true)
  }

  async function saveConfig() {
    if (!configForm.name.trim()) { alert('Vui lòng nhập Tên'); return }
    if (configForm.type !== 'gdrive' && !configForm.host.trim()) { alert('Vui lòng nhập Host'); return }
    if (configForm.type === 'smb' && !configForm.remote_path.trim()) { alert('Vui lòng nhập Share name (VD: goldenfarm, shared, documents)'); return }
    if (configForm.type === 'gdrive' && !configForm.remote_path.trim()) { alert('Vui lòng nhập Folder ID'); return }
    try {
      const payload = { ...configForm }
      if (configForm.type === 'ftp' && !payload.remote_path.trim()) payload.remote_path = '/'
      if (editingConfig) { await updateStorageConfig(editingConfig.id, payload) }
      else { await createStorageConfig(configForm) }
      setShowConfig(false)
      loadConfigs()
    } catch (e) { alert('Lưu thất bại') }
  }

  async function removeConfig(id) {
    if (!confirm('Xóa cấu hình storage này?')) return
    try {
      await deleteStorageConfig(id)
      if (activeConfig?.id === id) setActiveConfig(null)
      loadConfigs()
    } catch (e) { alert('Xóa thất bại') }
  }

  async function testConn() {
    setTestMsg(''); setTestOk(false)
    try {
      const r = editingConfig ? await testStorageConnection(editingConfig.id) : await testStorageConnectionDirect(configForm)
      const data = r.data || {}
      setTestMsg(data.message || (data.success ? 'OK' : 'Failed'))
      setTestOk(!!data.success)
    } catch (e) { setTestMsg('Lỗi kết nối'); setTestOk(false) }
  }

  function loadPerms(storageId) {
    getStoragePermissions(storageId).then(r => setPerms(r.data?.data || [])).catch(() => {})
    setShowPerms(true)
  }

  async function addPerm() {
    if (!permForm.folder_path.trim()) return
    if (!permForm.role && !permForm.employee_code && !permForm.department) { alert('Chọn ít nhất Role, Mã NV hoặc Bộ phận'); return }
    try {
      const body = { ...permForm, storage_id: activeConfig.id }
      if (body.department === '__all__') body.department = ''
      await createStoragePermission(body)
      setPermForm({ folder_path: '/', role: '', employee_code: '', department: '', permission: 'read' })
      loadPerms(activeConfig.id)
    } catch (e) { alert('Thêm phân quyền thất bại') }
  }

  async function removePerm(id) {
    try { await deleteStoragePermission(id); loadPerms(activeConfig.id) }
    catch (e) { alert('Xóa thất bại') }
  }

  return (
    <div className="doc-wrap">
      {/* ─── Header ───────────────────────────────────────────── */}
      <div className="doc-header">
        <div className="doc-header-left">
          <Folder size={22} />
          <h2>Tài liệu</h2>
        </div>
        <div className="doc-header-right">
          {isAdmin && (
            <button className="doc-btn doc-btn-secondary" onClick={() => openConfigForm(null)}>
              <Plus size={15} /> <span>Cấu hình Storage</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Storage Tabs ─────────────────────────────────────── */}
      {configs.length > 0 && (
        <div className="doc-tabs">
          {configs.map(cfg => {
            const IconComp = cfg.type === 'gdrive' ? Cloud : cfg.type === 'smb' ? Server : Wifi
            return (
              <div
                key={cfg.id}
                className={`doc-tab${activeConfig?.id === cfg.id ? ' active' : ''}`}
                onClick={() => selectConfig(cfg)}
              >
                <IconComp size={14} />
                <span className="doc-tab-label">{cfg.name}</span>
                <span className="doc-tab-meta">{cfg.type === 'gdrive' ? cfg.remote_path : cfg.host}</span>
                {isAdmin && (
                  <button className="doc-tab-close" onClick={e => { e.stopPropagation(); removeConfig(cfg.id) }} title="Xóa">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {configs.length === 0 && (
        <div className="doc-empty-config">
          <Folder size={48} />
          <p>Chưa có cấu hình storage nào.</p>
          {isAdmin && <button className="doc-btn doc-btn-primary" onClick={() => openConfigForm(null)}><Plus size={15} /> Thêm cấu hình</button>}
        </div>
      )}

      {/* ─── File Browser ────────────────────────────────────── */}
      {activeConfig && (
        <>
          {/* Toolbar */}
          <div className="doc-toolbar">
            <div className="doc-breadcrumb">
              <span className="doc-breadcrumb-home" onClick={() => browseBreadcrumb(0)}><Home size={14} /></span>
              {breadcrumbs.map((b, i) => (
                <React.Fragment key={b.id}>
                  <ChevronRight size={11} className="doc-bc-sep" />
                  <span
                    className={`doc-bc-item${i === breadcrumbs.length - 1 ? ' active' : ''}`}
                    onClick={() => browseBreadcrumb(i)}
                  >
                    {b.name}
                  </span>
                </React.Fragment>
              ))}
            </div>
            <div className="doc-toolbar-actions">
              <div className="doc-search-wrap-mini">
                <Search size={13} className="doc-search-mini-icon" />
                <input type="text" className="doc-search-mini-input"
                  placeholder="Tìm file..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                {searchQuery && (
                  <button className="doc-search-mini-clear" onClick={() => setSearchQuery('')}>
                    <X size={13} />
                  </button>
                )}
              </div>
              {isAdmin && (
                <button className="doc-btn doc-btn-ghost" onClick={() => loadPerms(activeConfig.id)} title="Phân quyền">
                  <Shield size={15} />
                </button>
              )}
              <div className="doc-view-toggle">
                <button className={`doc-view-btn${viewMode === 'list' ? ' active' : ''}`}
                  onClick={() => setViewMode('list')} title="Xem dạng danh sách">
                  <List size={15} />
                </button>
                <button className={`doc-view-btn${viewMode === 'grid' ? ' active' : ''}`}
                  onClick={() => setViewMode('grid')} title="Xem dạng lưới">
                  <LayoutGrid size={15} />
                </button>
              </div>
              <button className="doc-btn doc-btn-ghost doc-btn-icon" onClick={() => browseFolder(activeConfig.id, breadcrumbs.at(-1).id)} title="Làm mới">
                <RefreshCw size={15} />
              </button>
            </div>
          </div>

          {/* Error State */}
          {browseError && !loading && (
            <div className="doc-grid-state doc-grid-error">
              <Folder size={40} />
              <p>{browseError}</p>
              <button className="doc-btn doc-btn-secondary" onClick={() => browseFolder(activeConfig.id, breadcrumbs.at(-1).id)}>Thử lại</button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !browseError && filteredEntries.length === 0 && (
            <div className="doc-grid-state doc-grid-empty">
              <FolderOpen size={48} />
              <p>{searchQuery ? 'Không tìm thấy file nào' : 'Thư mục này đang trống'}</p>
            </div>
          )}

          {/* Loading Skeleton */}
          {loading && (
            viewMode === 'grid' ? <SkeletonCards count={8} /> : (
              <div className="doc-grid">
                <div className="doc-grid-header">
                  <span className="doc-col-name">Tên</span>
                  <span className="doc-col-size">Kích thước</span>
                  <span className="doc-col-date">Cập nhật</span>
                  {isAdmin && <span className="doc-col-actions" />}
                </div>
                <SkeletonRows count={6} />
              </div>
            )
          )}

          {/* ─── Grid View (Cards) ───────────────────────────── */}
          {!loading && !browseError && viewMode === 'grid' && filteredEntries.length > 0 && (
            <div className="doc-card-grid">
              {breadcrumbs.length > 1 && (
                <div className="doc-card doc-card-back" onClick={goBack}>
                  <div className="doc-card-icon"><FolderOpen size={32} color="#94a3b8" /></div>
                  <div className="doc-card-name">.. / Quay lại</div>
                </div>
              )}
              {filteredEntries.map((e, i) => {
                const { icon: IconComp, color: iconColor } = getFileIcon(e.name, e.is_dir)
                return (
                  <div
                    key={i}
                    className={`doc-card${e.is_dir ? ' doc-card-dir' : ''}`}
                    onClick={() => e.is_dir ? openFolder(e) : handlePreviewFile(e)}
                    onContextMenu={(ev) => handleContextMenu(ev, e)}
                  >
                    <div className="doc-card-icon">
                      <IconComp size={36} style={{ color: iconColor }} />
                    </div>
                    <div className="doc-card-name" title={e.name}>{e.name}</div>
                    <div className="doc-card-meta">
                      {e.is_dir ? '' : formatSize(e.size)}
                      {!e.is_dir && e.modified ? ` · ${formatDate(e.modified)}` : ''}
                    </div>
                    {!e.is_dir && canPreviewFile(e.name) && (
                      <button className="doc-card-preview"
                        onClick={(ev) => { ev.stopPropagation(); handlePreviewFile(e) }}
                        title="Xem trước">
                        <Eye size={14} />
                      </button>
                    )}
                    {!e.is_dir && (
                      <button className="doc-card-download"
                        onClick={(ev) => { ev.stopPropagation(); handleDownloadFile(e) }}
                        title="Tải xuống">
                        <Download size={14} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ─── List View ───────────────────────────────────── */}
          {!loading && !browseError && viewMode === 'list' && filteredEntries.length > 0 && (
            <div className="doc-grid">
              <div className="doc-grid-header">
                <span className="doc-col-name">Tên</span>
                <span className="doc-col-size">Kích thước</span>
                <span className="doc-col-date">Cập nhật</span>
                <span className="doc-col-actions" />
              </div>
              <div className="doc-grid-body">
                {breadcrumbs.length > 1 && (
                  <div className="doc-grid-row doc-back-row" onClick={goBack}>
                    <div className="doc-col-name"><span className="doc-back-link">.. / Quay lại</span></div>
                    <div className="doc-col-size" />
                    <div className="doc-col-date" />
                    <div className="doc-col-actions" />
                  </div>
                )}
                {filteredEntries.map((e, i) => {
                  const { icon: IconComp, color: iconColor } = getFileIcon(e.name, e.is_dir)
                  return (
                    <div
                      key={i}
                      className="doc-grid-row"
                      onClick={() => e.is_dir && openFolder(e)}
                      onContextMenu={(ev) => handleContextMenu(ev, e)}
                      style={{ cursor: e.is_dir ? 'pointer' : 'default' }}
                    >
                      <div className="doc-col-name">
                        <IconComp size={18} style={{ color: iconColor, flexShrink: 0 }} />
                        <span className="doc-entry-name">{e.name}</span>
                      </div>
                      <div className="doc-col-size">{e.is_dir ? '' : formatSize(e.size)}</div>
                      <div className="doc-col-date">{formatDate(e.modified)}</div>
                      <div className="doc-col-actions">
                        {!e.is_dir && canPreviewFile(e.name) && (
                          <button className="doc-row-action" title="Xem trước"
                            onClick={(ev) => { ev.stopPropagation(); handlePreviewFile(e); }}>
                            <Eye size={14} />
                          </button>
                        )}
                        {!e.is_dir && (
                          <button className="doc-row-action" title="Tải xuống"
                            onClick={(ev) => { ev.stopPropagation(); handleDownloadFile(e); }}>
                            <Download size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Config Panel ────────────────────────────────────── */}
      {showConfig && <div className="panel-overlay open" onClick={() => setShowConfig(false)} />}
      {showConfig && (
        <div className="side-panel open panel-config">
          <div className="panel-body">
            <h3 style={{ marginBottom: '1rem' }}>{editingConfig ? 'Sửa cấu hình' : 'Thêm cấu hình Storage'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label className="doc-label">Tên</label>
                <input className="salary-pwd-input" value={configForm.name} onChange={e => setConfigForm({ ...configForm, name: e.target.value })} placeholder="VD: File Server Sản xuất" />
              </div>
              <div>
                <label className="doc-label">Loại Storage</label>
                <select className="salary-pwd-input" value={configForm.type}
                  onChange={e => {
                    const t = e.target.value
                    setConfigForm({ ...configForm, type: t, port: t === 'smb' ? 445 : (t === 'ftp' ? 21 : 0), host: t === 'gdrive' ? '' : configForm.host, remote_path: t === 'gdrive' ? '' : (t === 'smb' ? '' : '/'), username: '', password: '', domain: '' })
                  }}>
                  <option value="smb">SMB (Windows Share)</option>
                  <option value="ftp">FTP</option>
                  <option value="gdrive">Google Drive</option>
                </select>
              </div>

              {configForm.type !== 'gdrive' ? (
                <>
                  <div>
                    <label className="doc-label">Host</label>
                    <input className="salary-pwd-input" value={configForm.host} onChange={e => setConfigForm({ ...configForm, host: e.target.value })} placeholder="10.0.0.1" />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ flex: 1 }}>
                      <label className="doc-label">Port</label>
                      <input className="salary-pwd-input" type="number" value={configForm.port} onChange={e => setConfigForm({ ...configForm, port: parseInt(e.target.value) || (configForm.type === 'smb' ? 445 : 21) })} />
                    </div>
                    <div style={{ flex: 2 }}>
                      <label className="doc-label">Username</label>
                      <input className="salary-pwd-input" value={configForm.username} onChange={e => setConfigForm({ ...configForm, username: e.target.value })} placeholder={configForm.type === 'smb' ? 'goldenfarm\\user' : 'anonymous'} />
                    </div>
                  </div>
                  <div>
                    <label className="doc-label">Password</label>
                    <input className="salary-pwd-input" type="password" value={configForm.password} onChange={e => setConfigForm({ ...configForm, password: e.target.value })} placeholder="********" />
                  </div>
                  <div>
                    <label className="doc-label">Remote Path / Share</label>
                    <input className="salary-pwd-input" value={configForm.remote_path} onChange={e => setConfigForm({ ...configForm, remote_path: e.target.value })} placeholder={configForm.type === 'smb' ? 'Tên Share (VD: goldenfarm)' : '/'} />
                  </div>
                  {configForm.type === 'smb' && (
                    <div>
                      <label className="doc-label">Domain (tùy chọn)</label>
                      <input className="salary-pwd-input" value={configForm.domain} onChange={e => setConfigForm({ ...configForm, domain: e.target.value })} placeholder="WORKGROUP" />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="doc-label">Service Account Email (Tùy chọn ghi chú)</label>
                    <input className="salary-pwd-input" value={configForm.username} onChange={e => setConfigForm({ ...configForm, username: e.target.value })} placeholder="ict-service@goldenfarm.iam.gserviceaccount.com" />
                  </div>
                  <div>
                    <label className="doc-label">Service Account JSON (Dán toàn bộ nội dung file JSON vào đây)</label>
                    <textarea className="salary-pwd-input" style={{ minHeight: 120, fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }} value={configForm.password} onChange={e => setConfigForm({ ...configForm, password: e.target.value })} placeholder='{ "type": "service_account", "project_id": "...", "private_key": "..." }' />
                  </div>
                  <div>
                    <label className="doc-label">Folder ID (Thư mục gốc)</label>
                    <input className="salary-pwd-input" value={configForm.remote_path} onChange={e => setConfigForm({ ...configForm, remote_path: e.target.value })} placeholder="1A2B3C4D5E6F7G8H9I0J" />
                  </div>
                </>
              )}
              {testMsg && <div className={`doc-test-msg ${testOk ? 'ok' : 'err'}`}>{testMsg}</div>}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="salary-btn salary-btn-secondary" onClick={testConn} style={{ flex: 1 }}>Test Connection</button>
                <button className="salary-btn salary-btn-primary" onClick={saveConfig} style={{ flex: 1 }}>Lưu</button>
                <button className="salary-btn salary-btn-secondary" onClick={() => setShowConfig(false)}>Hủy</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Permissions Panel ───────────────────────────────── */}
      {showPerms && activeConfig && <div className="panel-overlay open" onClick={() => setShowPerms(false)} />}
      {showPerms && activeConfig && (
        <div className="side-panel open panel-perms">
          <div className="panel-body">
            <h3 style={{ marginBottom: '0.5rem' }}>Phân quyền thư mục</h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>Cấu hình ai có quyền truy cập thư mục nào.</p>

            <div className="perm-form-row">
              <input className="salary-pwd-input" value={permForm.folder_path} onChange={e => setPermForm({ ...permForm, folder_path: e.target.value })} placeholder="/thumuc" />
              <select className="salary-pwd-input" value={permForm.role} onChange={e => setPermForm({ ...permForm, role: e.target.value })}>
                <option value="">-- Role --</option>
                <option value="admin">Admin</option>
                <option value="head">Trưởng phòng</option>
                <option value="user">User</option>
              </select>
              <input className="salary-pwd-input" value={permForm.employee_code} onChange={e => setPermForm({ ...permForm, employee_code: e.target.value })} placeholder="Mã NV" />
              <select className="salary-pwd-input" value={permForm.department} onChange={e => setPermForm({ ...permForm, department: e.target.value })}>
                <option value="">-- Bộ phận --</option>
                <option value="__all__">Tất cả user</option>
                {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
              <select className="salary-pwd-input" value={permForm.permission} onChange={e => setPermForm({ ...permForm, permission: e.target.value })}>
                <option value="read">Xem</option>
                <option value="write">Ghi</option>
              </select>
              <button className="salary-btn salary-btn-primary" onClick={addPerm}><Plus size={15} /></button>
            </div>

            <table className="tbl" style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th>Thư mục</th>
                  <th>Role</th>
                  <th>Mã NV</th>
                  <th>Bộ phận</th>
                  <th>Quyền</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {perms.map(p => (
                  <tr key={p.id}>
                    <td>{p.folder_path}</td>
                    <td>{p.role || '--'}</td>
                    <td>{p.employee_code || '--'}</td>
                    <td>{!p.department && !p.role && !p.employee_code ? 'Tất cả' : p.department || '--'}</td>
                    <td>{p.permission === 'write' ? 'Ghi' : 'Xem'}</td>
                    <td><button className="salary-btn" style={{ padding: '2px 6px', fontSize: '0.7rem', color: '#dc2626' }} onClick={() => removePerm(p.id)}><Trash2 size={12} /></button></td>
                  </tr>
                ))}
                {perms.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8' }}>Chưa có phân quyền (mặc định tất cả được truy cập)</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Context Menu ───────────────────────────────────────── */}
      {contextMenu.visible && (
        <div
          className="doc-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {!contextMenu.file.is_dir && (
            <div className="doc-context-menu-item" onClick={() => { handlePreviewFile(contextMenu.file); setContextMenu({ visible: false }) }}>
              <Eye size={15} /> Xem trước
            </div>
          )}
          {!contextMenu.file.is_dir && (
            <div className="doc-context-menu-item" onClick={() => handleDownloadFile(contextMenu.file)}>
              <Download size={15} /> Tải xuống
            </div>
          )}
        </div>
      )}

      {/* ─── File Viewer ────────────────────────────────────────── */}
      <FileViewer
        file={viewerFile}
        isOpen={viewerOpen}
        onClose={() => {
          setViewerOpen(false)
          setViewerFile(null)
        }}
      />
    </div>
  )
}
