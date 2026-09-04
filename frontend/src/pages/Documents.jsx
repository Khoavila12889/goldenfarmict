import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  Folder, File, FolderOpen, Plus, Trash2,
  Server, Wifi, Cloud, RefreshCw, ChevronRight, Home, Shield,
  MoreVertical, FileText, Archive, Image, Eye,
  FileSpreadsheet, FileCode, Music, Video, FileCog,
  Download, LayoutGrid, List, Search, X, Upload, Share2, UploadCloud, FolderPlus,
  Settings, CheckCircle2
} from 'lucide-react'
import '../styles/shared.css'
import './Documents.css'
import FileViewer from '../components/FileViewer'
import OnlyOfficeViewer from '../components/OnlyOfficeViewer'
import DrawioViewer from '../components/DrawioViewer'
import PdfPagesViewer from '../components/PdfPagesViewer'
import ShareDocument from '../components/ShareDocument'
import ImageLightbox from '../components/ImageLightbox'
import { getStorageConfigs, browseStorage, getStoragePermissions, createStoragePermission, deleteStoragePermission, createStorageConfig, updateStorageConfig, deleteStorageConfig, exportStorageConfig, testStorageConnection, testStorageConnectionDirect, getStorageDepartments, apiUrl } from '../services/api'
import { formatDate } from '../utils/date'
const INITIAL_CONFIG = { name: '', type: 'smb', host: '', port: 445, username: '', password: '', remote_path: '', domain: '' }

// ─── Image helpers ────────────────────────────────────────────────
const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','svg','bmp','ico','avif','tif','tiff'])

function isImageFile(name) {
  return IMAGE_EXTS.has((name || '').split('.').pop().toLowerCase())
}

function buildThumbnailUrl(cfg, entry, currentPath, userCode, userRole) {
  if (!cfg || !entry || !isImageFile(entry.name)) return null
  const isGdrive = cfg.type === 'gdrive'
  const normalizedPath = currentPath === '/'
    ? entry.name
    : `${currentPath.replace(/\/$/, '')}/${entry.name}`
  
  if (isGdrive) {
    if (entry.thumbnailLink) {
      return entry.thumbnailLink.replace(/=s\d+(-c)?$/, '=s800')
    }
    return apiUrl(`/documents/thumbnail?config_id=${cfg.id}&file_path=${encodeURIComponent(normalizedPath)}&file_id=${encodeURIComponent(entry.id)}&user_code=${userCode}&user_role=${userRole}&size=800`)
  }
  return apiUrl(`/documents/thumbnail?config_id=${cfg.id}&file_path=${encodeURIComponent(normalizedPath)}&user_code=${userCode}&user_role=${userRole}&size=400`)
}

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
    drawio: { icon: FileCode, color: '#f97316' },
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

function buildFileDownloadUrl(cfg, entry, currentPath, userCode, userRole, inline = false) {
  const isGdrive = cfg?.type === 'gdrive'
  const normalizedPath = currentPath === '/'
    ? entry.name
    : `${currentPath.replace(/\/$/, '')}/${entry.name}`
  let url = apiUrl(`/documents/download?config_id=${cfg.id}&file_path=${encodeURIComponent(normalizedPath)}`)
  if (isGdrive && entry.id) url += `&file_id=${encodeURIComponent(entry.id)}`
  url += `&user_code=${userCode}&user_role=${userRole}`
  if (inline) url += '&inline=true'
  return url
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
  
  // ROOT represents the top-level where configs are displayed as folders
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: 'ROOT', name: 'Home' }])
  
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
  const [permForm, setPermForm] = useState({ folder_path: '/', role: '', employee_code: '', department: '', permission: 'read', can_upload: false })
  const [foldersList, setFoldersList] = useState([])
  const [loadingFolders, setLoadingFolders] = useState(false)

  const [viewerFile, setViewerFile] = useState(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [ooFile, setOoFile] = useState(null)
  const [ooOpen, setOoOpen] = useState(false)
  const [ooConfigId, setOoConfigId] = useState(null)
  // Draw.io viewer state
  const [drawioFile, setDrawioFile] = useState(null)
  const [drawioOpen, setDrawioOpen] = useState(false)
  const [drawioConfigId, setDrawioConfigId] = useState(null)
  // Xem PDF dạng trang ảnh WebP (thay OnlyOffice — giảm tải Document Server)
  const [pdfPagesFile, setPdfPagesFile] = useState(null)
  const [shareFile, setShareFile] = useState(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, file: null })

  // Upload state
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatusText, setUploadStatusText] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [canUploadCurrent, setCanUploadCurrent] = useState(false)
  const [canDeleteCurrent, setCanDeleteCurrent] = useState(false)

  const uploadCloseTimerRef = useRef(null)

  // Create folder state
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Lightbox state
  const [showLightbox, setShowLightbox] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const fileInputRef = useRef(null)

  // View mode & search
  const [viewMode, setViewMode] = useState('grid')
  const [searchQuery, setSearchQuery] = useState('')

  const loadConfigs = useCallback(() => {
    getStorageConfigs(userCode, userRole).then(r => setConfigs(r.data?.data || [])).catch(() => {})
  }, [userCode, userRole])

  useEffect(() => { loadConfigs() }, [loadConfigs])

  useEffect(() => {
    getStorageDepartments().then(r => setDepartments(r.data?.data || [])).catch(() => {})
  }, [])

  useEffect(() => () => clearTimeout(uploadCloseTimerRef.current), [])

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const q = searchQuery.toLowerCase()
    return entries.filter(e => e.name.toLowerCase().includes(q))
  }, [entries, searchQuery])

  const imageEntries = useMemo(() => {
    return entries.filter(e => !e.is_dir && isImageFile(e.name))
  }, [entries])

  const lightboxSlides = useMemo(() => {
    if (!activeConfig) return []
    const currentPath = breadcrumbs.at(-1)?.id || '/'
    return imageEntries.map(e => {
      const thumbUrlSmall = buildThumbnailUrl(activeConfig, e, currentPath, userCode, userRole)
      const thumbUrlLarge = thumbUrlSmall ? thumbUrlSmall.replace('size=400', 'size=1920') : null
      const downloadUrl = buildFileDownloadUrl(activeConfig, e, currentPath, userCode, userRole, false)
      return {
        src: thumbUrlLarge || thumbUrlSmall,
        thumbnail: thumbUrlSmall,
        downloadUrl: downloadUrl,
        alt: e.name,
        title: e.name,
        description: e.size ? formatDate(e.modified) : undefined,
      }
    })
  }, [imageEntries, activeConfig, breadcrumbs, userCode, userRole])

  function selectConfig(cfg) {
    setActiveConfig(cfg)
    setBrowseError('')
    setSearchQuery('')
    const isGdrive = cfg?.type === 'gdrive'
    const rootId = isGdrive ? (cfg.remote_path || 'root') : '/'
    
    // Breadcrumbs starts with ROOT, then the Config name
    setBreadcrumbs([{ id: 'ROOT', name: 'Home' }, { id: rootId, name: cfg.name }])
    setEntries([])
    if (cfg) browseFolder(cfg.id, rootId)
  }

  function browseFolder(configId, folderId) {
    setLoading(true)
    setBrowseError('')
    setSearchQuery('')
    browseStorage(configId, folderId, userCode, userRole)
      .then(r => { 
        setEntries(r.data?.data || [])
        const canUpload = r.data?.can_upload ?? (isAdmin || false)
        setCanUploadCurrent(canUpload)
        const canDelete = r.data?.can_delete ?? (isAdmin || false)
        setCanDeleteCurrent(canDelete)
      })
      .catch(err => {
        setEntries([])
        const msg = err.response?.data?.detail || err.message || 'Không thể kết nối storage'
        if (err.response?.status === 403 && /No permission to access this storage/i.test(msg)) {
          // Không có quyền → ẩn storage khỏi danh sách và quay về Home, không hiện lỗi
          setConfigs(prev => prev.filter(c => c.id !== configId))
          setActiveConfig(null)
          setBreadcrumbs([{ id: 'ROOT', name: 'Home' }])
          setBrowseError('')
          return
        }
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
      'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
      'drawio',
    ]
    return previewable.includes(ext)
  }

  const officeExts = new Set(['docx','xlsx','pptx','doc','xls','ppt','odt','ods','odp','csv','txt','rtf','pdf'])

  function isOfficeFile(name) {
    return officeExts.has(name.split('.').pop().toLowerCase())
  }

  async function handlePreviewFile(entry) {
    if (entry.is_dir) return
    const currentPath = breadcrumbs.at(-1).id

    if (isImageFile(entry.name)) {
      const idx = imageEntries.findIndex(e => e.name === entry.name)
      setLightboxIndex(idx >= 0 ? idx : 0)
      setShowLightbox(true)
      return
    }

    // PDF → xem bằng các trang ảnh WebP đã convert trên server (nhanh, không cần OnlyOffice)
    const ext = entry.name.split('.').pop().toLowerCase()
    if (ext === 'pdf') {
      const isGdrive = activeConfig?.type === 'gdrive'
      const normalizedPath = currentPath === '/' ? entry.name : `${currentPath.replace(/\/$/, '')}/${entry.name}`
      setPdfPagesFile({
        name: entry.name,
        url: buildFileDownloadUrl(activeConfig, entry, currentPath, userCode, userRole),
        doc: {
          configId: activeConfig.id,
          filePath: normalizedPath,
          fileId: isGdrive && entry.id ? entry.id : '',
          size: entry.size || 0,
          userCode,
          userRole,
        },
      })
      return
    }

    if (isOfficeFile(entry.name)) {
      setOoFile({ ...entry, browsePath: currentPath, storageType: activeConfig.type })
      setOoConfigId(activeConfig.id)
      setOoOpen(true)
      return
    }

    // Draw.io files (.drawio, .xml)
    const drawioExts = ['drawio', 'xml']
    if (drawioExts.includes(ext)) {
      setDrawioFile({ ...entry, browsePath: currentPath, storageType: activeConfig.type })
      setDrawioConfigId(activeConfig.id)
      setDrawioOpen(true)
      return
    }

    const fileUrl = buildFileDownloadUrl(activeConfig, entry, currentPath, userCode, userRole)
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
    const fileUrl = buildFileDownloadUrl(activeConfig, entry, currentPath, userCode, userRole)
    const isImg = isImageFile(entry.name)

    const triggerBlobDownload = (blob, fileName) => {
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000)
    }

    try {
      const response = await fetch(fileUrl, {
        headers: {
          'Authorization': 'Bearer ' + sessionStorage.getItem('token')
        }
      })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      const blob = await response.blob()
      triggerBlobDownload(blob, entry.name)
    } catch (err) {
      if (isImg) {
        try {
          const thumbUrlLarge = buildThumbnailUrl(activeConfig, entry, currentPath, userCode, userRole)?.replace('size=400', 'size=1920')
          if (thumbUrlLarge) {
            const fallbackRes = await fetch(thumbUrlLarge)
            if (fallbackRes.ok) {
              const blob = await fallbackRes.blob()
              triggerBlobDownload(blob, entry.name)
              setContextMenu({ visible: false })
              return
            }
          }
        } catch (_) {}
      }
      alert('Tải file thất bại: ' + (err.message || ''))
    }
    setContextMenu({ visible: false })
  }

  function handleShareEntry(entry) {
    const currentPath = breadcrumbs.at(-1).id
    const isGdrive = activeConfig?.type === 'gdrive'
    const isFolder = !!entry.is_dir
    let normalizedPath
    let fileId = ''
    if (isFolder && isGdrive) {
      normalizedPath = entry.id
      fileId = entry.id
    } else {
      normalizedPath = currentPath === '/'
        ? entry.name
        : `${currentPath.replace(/\/$/, '')}/${entry.name}`
      fileId = isGdrive ? entry.id : ''
    }
    setShareFile({
      entry,
      configId: activeConfig.id,
      filePath: normalizedPath,
      fileId,
      fileName: entry.name,
      itemType: isFolder ? 'folder' : 'file',
      isDir: isFolder,
    })
    setShareOpen(true)
  }

  function browseBreadcrumb(idx) {
    const target = breadcrumbs[idx]
    if (!target) return
    
    // Nếu bấm vào HOME (ROOT)
    if (target.id === 'ROOT') {
      setActiveConfig(null)
      setBreadcrumbs([{ id: 'ROOT', name: 'Home' }])
      setEntries([])
      setSearchQuery('')
      return
    }

    // Normal folder browse
    setBreadcrumbs(prev => prev.slice(0, idx + 1))
    browseFolder(activeConfig.id, target.id)
  }

  function goBack() {
    if (breadcrumbs.length <= 1) return
    browseBreadcrumb(breadcrumbs.length - 2)
  }

  // ── Upload & Create Folder Functions (OPTIMIZED PROGRESS) ─────────
  async function handleUploadFiles(files) {
    if (!activeConfig || !files || files.length === 0) return
    const currentPath = breadcrumbs.at(-1).id
    const filesList = Array.from(files)
    const totalBytes = filesList.reduce((sum, f) => sum + (f.size || 0), 0)

    setUploading(true)
    setUploadError('')
    setUploadProgress(1)
    setUploadSuccess(false)
    setUploadStatusText(`Chuẩn bị tải lên ${filesList.length} file...`)
    clearTimeout(uploadCloseTimerRef.current)

    let uploadedBytes = 0
    let lastPercent = 0
    const errors = []

    // Cập nhật thanh tiến trình tổng: tăng dần (không thụt lùi),
    // chặn tối đa 99% cho tới khi server xác nhận hoàn tất.
    const applyProgress = (currentLoaded, index) => {
      let ratio
      if (totalBytes > 0) {
        ratio = (uploadedBytes + currentLoaded) / totalBytes
      } else {
        // File rỗng / không biết kích thước -> chạy theo số lượng file
        ratio = filesList.length > 0 ? (index + 1) / filesList.length : 1
      }
      const percent = Math.min(99, Math.max(1, Math.round(ratio * 100)))
      if (percent >= lastPercent) {
        lastPercent = percent
        setUploadProgress(percent)
      }
    }

    for (let index = 0; index < filesList.length; index++) {
      const file = filesList[index]
      setUploadStatusText(`Đang tải lên (${index + 1}/${filesList.length}): ${file.name}`)

      try {
        await new Promise((resolve, reject) => {
          const formData = new FormData()
          formData.append('file', file)

          const xhr = new XMLHttpRequest()
          xhr.open('POST', apiUrl(`/documents/upload?config_id=${activeConfig.id}&folder_path=${encodeURIComponent(currentPath)}&user_code=${userCode}&user_role=${userRole}`))
          xhr.setRequestHeader('Authorization', 'Bearer ' + sessionStorage.getItem('token'))

          xhr.upload.onprogress = (e) => {
            let currentLoaded
            if (e.lengthComputable && e.total > 0) {
              currentLoaded = e.loaded
            } else if (file.size > 0) {
              // Không có thông tin byte (chunked/stream) -> ước lượng giữa chừng
              // để thanh vẫn di chuyển thay vì đứng yên.
              currentLoaded = file.size * 0.5
            } else {
              currentLoaded = 0
            }
            applyProgress(currentLoaded, index)
          }

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve()
              return
            }
            let errorMsg = `HTTP ${xhr.status}`
            try {
              const errData = JSON.parse(xhr.responseText || '{}')
              if (errData.detail) errorMsg = errData.detail
            } catch (_) {}
            if (activeConfig.type === 'gdrive' && (errorMsg.includes('quota') || errorMsg.includes('dung lượng'))) {
              errorMsg = "Google Drive không đủ dung lượng. Vui lòng dùng Shared Drive hoặc liên hệ admin."
            }
            reject(new Error(errorMsg))
          }

          xhr.onerror = () => reject(new Error('Lỗi mạng, không thể tải file lên'))
          xhr.onabort = () => reject(new Error('Upload bị hủy'))
          xhr.send(formData)
        })

        uploadedBytes += file.size || 0
        applyProgress(file.size || 0, index)
      } catch (err) {
        errors.push(`${file.name}: ${err.message}`)
        uploadedBytes += file.size || 0
        applyProgress(file.size || 0, index)
      }
    }

    setUploading(false)

    if (errors.length > 0) {
      setUploadError(errors.join('\n'))
      return
    }

    // Hoàn tất tải file -> đặt tiến trình 100% và hiện thành công
    setUploadProgress(100)
    setUploadStatusText('Tải lên hoàn tất!')
    setUploadSuccess(true)

    uploadCloseTimerRef.current = setTimeout(() => {
      setShowUpload(false)
      setUploadProgress(0)
      setUploadStatusText('')
      setUploadSuccess(false)
      browseFolder(activeConfig.id, currentPath)
    }, 1200)
  }

  function closeUploadPanel() {
    clearTimeout(uploadCloseTimerRef.current)
    setShowUpload(false)
    setUploadError('')
    setUploadProgress(0)
    setUploadStatusText('')
    setUploadSuccess(false)
  }

  function handleDragOver(e) { e.preventDefault(); e.stopPropagation() }
  function handleDrop(e) {
    e.preventDefault(); e.stopPropagation()
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) handleUploadFiles(files)
  }
  function handleFileSelect(e) {
    const files = Array.from(e.target.files)
    if (files.length > 0) handleUploadFiles(files)
    e.target.value = ''
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim() || !activeConfig) return
    const currentPath = breadcrumbs.at(-1).id
    setUploading(true)
    setUploadError('')
    try {
      const response = await fetch(
        apiUrl(`/documents/create-folder?config_id=${activeConfig.id}&parent_path=${encodeURIComponent(currentPath)}&user_code=${userCode}&user_role=${userRole}`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + sessionStorage.getItem('token')
          },
          body: JSON.stringify({ folder_name: newFolderName.trim() })
        }
      )
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.detail || `HTTP ${response.status}`)
      }
      
      setShowCreateFolder(false)
      setNewFolderName('')
      browseFolder(activeConfig.id, currentPath)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteEntry(entry) {
    if (!activeConfig || !confirm(`Xóa ${entry.is_dir ? 'thư mục' : 'file'} "${entry.name}"?`)) return
    const currentPath = breadcrumbs.at(-1).id
    const fullPath = entry.is_dir 
      ? (currentPath === '/' ? entry.name : `${currentPath}/${entry.name}`)
      : (currentPath === '/' ? entry.name : `${currentPath}/${entry.name}`)
    
    setUploading(true)
    setUploadError('')
    try {
      let file_id = ''
      if (activeConfig.type === 'gdrive' && !entry.is_dir) {
        file_id = entry.id || ''
      }
      const response = await fetch(
        apiUrl(`/documents/delete?config_id=${activeConfig.id}&item_path=${encodeURIComponent(fullPath)}&is_dir=${entry.is_dir}&file_id=${encodeURIComponent(file_id)}&user_code=${userCode}&user_role=${userRole}`),
        {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + sessionStorage.getItem('token') }
        }
      )
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.detail || `HTTP ${response.status}`)
      }
      browseFolder(activeConfig.id, currentPath)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  // ── Config Functions ─────────────────────────────────────────────
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
      if (activeConfig?.id === id) {
        setActiveConfig(null)
        setBreadcrumbs([{ id: 'ROOT', name: 'Home' }])
      }
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
    setLoadingFolders(true)
    Promise.all([
      fetch(apiUrl(`/documents/folders?config_id=${storageId}&user_code=${userCode}&user_role=${userRole}`)).then(r => r.json()),
      getStoragePermissions(storageId)
    ]).then(([foldersRes, permsRes]) => {
      setFoldersList(foldersRes.data?.data || [])
      setPerms(permsRes.data?.data || [])
      setShowPerms(true)
    }).catch(() => {
      setFoldersList([])
      setPerms([])
      setShowPerms(true)
    }).finally(() => setLoadingFolders(false))
  }

  async function exportConfigToFile() {
    let payload = { ...configForm }
    if (editingConfig) {
      try {
        const r = await exportStorageConfig(editingConfig.id)
        const d = r.data?.data
        if (d) {
          payload = {
            name: d.name || '',
            type: d.type || '',
            host: d.host || '',
            port: d.port || 0,
            username: d.username || '',
            password: d.password || '',
            remote_path: d.remote_path || '',
            domain: d.domain || '',
          }
        }
      } catch (err) {
        console.warn('Không tải được cấu hình đầy đủ, xuất theo form hiện tại:', err)
      }
    }
    const json = JSON.stringify(payload, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName = (payload.name || 'storage_config').replace(/[^a-zA-Z0-9_\-]/g, '_')
    link.href = url
    link.download = `storage_config_${safeName}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  function importConfigFromFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        setConfigForm({ ...INITIAL_CONFIG, ...data })
        setTestMsg(''); setTestOk(false)
      } catch { alert('File JSON không hợp lệ') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function addPerm() {
    if (!permForm.folder_path.trim()) return
    if (!permForm.role && !permForm.employee_code && !permForm.department) { alert('Chọn ít nhất Role, Mã NV hoặc Bộ phận'); return }
    try {
      const body = { ...permForm, storage_id: activeConfig.id }
      if (body.department === '__all__') body.department = ''
      await createStoragePermission(body)
      setPermForm({ folder_path: '/', role: '', employee_code: '', department: '', permission: 'read', can_upload: false })
      loadPerms(activeConfig.id)
    } catch (e) { alert('Thêm phân quyền thất bại') }
  }

  async function removePerm(id) {
    try { await deleteStoragePermission(id); loadPerms(activeConfig.id) }
    catch (e) { alert('Xóa thất bại') }
  }


  // ── Render ───────────────────────────────────────────────────────
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
              <Plus size={15} /> <span>Thêm Storage (Ổ đĩa)</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Toolbar ──────────────────────────────────────────── */}
      <div className="doc-toolbar">
        <div className="doc-breadcrumb">
          <span className="doc-breadcrumb-home" onClick={() => browseBreadcrumb(0)} title="Home">
            <Home size={14} />
          </span>
          {breadcrumbs.map((b, i) => {
            // Không render chữ Home nữa vì đã dùng Icon, bắt đầu render từ ổ đĩa (index > 0)
            if (i === 0) return null 
            return (
              <React.Fragment key={b.id + i}>
                <ChevronRight size={11} className="doc-bc-sep" />
                <span
                  className={`doc-bc-item${i === breadcrumbs.length - 1 ? ' active' : ''}`}
                  onClick={() => browseBreadcrumb(i)}
                >
                  {b.name}
                </span>
              </React.Fragment>
            )
          })}
        </div>
        
        <div className="doc-toolbar-actions">
          {/* Các nút này chỉ hiện khi đã chui vào 1 ổ đĩa (activeConfig != null) */}
          {activeConfig && (
            <>
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
              {(isAdmin || canUploadCurrent) && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="doc-btn doc-btn-primary" onClick={() => setShowUpload(true)} title="Upload file">
                    <UploadCloud size={15} /> <span>Upload</span>
                  </button>
                  <button className="doc-btn doc-btn-secondary" onClick={() => setShowCreateFolder(true)} title="Tạo thư mục">
                    <FolderPlus size={15} /> <span>Thư mục</span>
                  </button>
                </div>
              )}
              {isAdmin && (
                <button className="doc-btn doc-btn-ghost" onClick={() => loadPerms(activeConfig.id)} title="Phân quyền ổ đĩa">
                  <Shield size={15} />
                </button>
              )}
            </>
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
          <button className="doc-btn doc-btn-ghost doc-btn-icon" onClick={() => {
            if (activeConfig) browseFolder(activeConfig.id, breadcrumbs.at(-1).id)
            else loadConfigs()
          }} title="Làm mới">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* ─── ROOT VIEW: Xem danh sách Storage như thư mục gốc ───── */}
      {!activeConfig && (
        <div className="doc-root-view" style={{ flex: 1, overflow: 'auto' }}>
          {configs.length === 0 ? (
            <div className="doc-grid-state doc-grid-empty">
              <Server size={48} />
              <p>Chưa có ổ đĩa lưu trữ nào được cấu hình.</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="doc-card-grid">
              {configs.map(cfg => {
                const IconComp = cfg.type === 'gdrive' ? Cloud : (cfg.type === 'smb' ? Server : Wifi)
                return (
                  <div key={cfg.id} className="doc-card doc-card-dir" onClick={() => selectConfig(cfg)}>
                    <div className="doc-card-icon">
                      <IconComp size={40} color="#3b82f6" />
                    </div>
                    <div className="doc-card-name" title={cfg.name}>{cfg.name}</div>
                    <div className="doc-card-meta">
                      {cfg.type.toUpperCase()} Storage
                    </div>
                    {isAdmin && (
                      <>
                        <button className="doc-card-preview" style={{right: '2.5rem'}}
                          onClick={(e) => { e.stopPropagation(); openConfigForm(cfg); }} title="Cài đặt">
                          <Settings size={14} />
                        </button>
                        <button className="doc-card-share" style={{right: '0.5rem', color: '#dc2626'}}
                          onClick={(e) => { e.stopPropagation(); removeConfig(cfg.id); }} title="Xóa ổ đĩa">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="doc-grid">
              <div className="doc-grid-header">
                <span className="doc-col-name">Tên Ổ đĩa</span>
                <span className="doc-col-size">Loại Storage</span>
                <span className="doc-col-date"></span>
                <span className="doc-col-actions"></span>
              </div>
              <div className="doc-grid-body">
                {configs.map(cfg => {
                  const IconComp = cfg.type === 'gdrive' ? Cloud : (cfg.type === 'smb' ? Server : Wifi)
                  return (
                    <div key={cfg.id} className="doc-grid-row" onClick={() => selectConfig(cfg)} style={{ cursor: 'pointer' }}>
                      <div className="doc-col-name">
                        <IconComp size={18} style={{ color: '#3b82f6', flexShrink: 0 }} />
                        <span className="doc-entry-name" style={{ fontWeight: 600 }}>{cfg.name}</span>
                      </div>
                      <div className="doc-col-size">{cfg.type.toUpperCase()}</div>
                      <div className="doc-col-date"></div>
                      <div className="doc-col-actions">
                        {isAdmin && (
                          <>
                            <button className="doc-row-action" title="Cài đặt" onClick={(e) => { e.stopPropagation(); openConfigForm(cfg) }}>
                              <Settings size={14} />
                            </button>
                            <button className="doc-row-action" title="Xóa" style={{color: '#dc2626'}} onClick={(e) => { e.stopPropagation(); removeConfig(cfg.id) }}>
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── FILE BROWSER VIEW ──────────────────────────────────── */}
      {activeConfig && (
        <>
          {browseError && !loading && (
            <div className="doc-grid-state doc-grid-error">
              <Folder size={40} />
              <p>{browseError}</p>
              <button className="doc-btn doc-btn-secondary" onClick={() => browseFolder(activeConfig.id, breadcrumbs.at(-1).id)}>Thử lại</button>
            </div>
          )}

          {!loading && !browseError && filteredEntries.length === 0 && (
            <div className="doc-grid-state doc-grid-empty">
              <FolderOpen size={48} />
              <p>{searchQuery ? 'Không tìm thấy file nào' : 'Thư mục này đang trống'}</p>
            </div>
          )}

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

          {/* Grid View */}
          {!loading && !browseError && viewMode === 'grid' && filteredEntries.length > 0 && (
            <div className="doc-card-grid">
              {breadcrumbs.length > 2 && (
                <div className="doc-card doc-card-back" onClick={goBack}>
                  <div className="doc-card-icon"><FolderOpen size={32} color="#94a3b8" /></div>
                  <div className="doc-card-name">.. / Quay lại</div>
                </div>
              )}
              {filteredEntries.map((e, i) => {
                const { icon: IconComp, color: iconColor } = getFileIcon(e.name, e.is_dir)
                const currentPath = breadcrumbs.at(-1).id
                const isImg = !e.is_dir && isImageFile(e.name)
                const thumbUrl = isImg ? buildThumbnailUrl(activeConfig, e, currentPath, userCode, userRole) : null
                return (
                  <div key={i} className={`doc-card${e.is_dir ? ' doc-card-dir' : ''}${isImg ? ' doc-card-image' : ''}`}
                    onClick={() => e.is_dir ? openFolder(e) : handlePreviewFile(e)}
                    onContextMenu={(ev) => handleContextMenu(ev, e)}>
                    <div className="doc-card-icon">
                      {isImg && thumbUrl ? (
                        <img src={thumbUrl} alt={e.name} loading="lazy" className="doc-card-thumb"
                          onError={(ev) => {
                            ev.currentTarget.style.display = 'none'
                            ev.currentTarget.nextSibling.style.display = 'flex'
                          }}
                        />
                      ) : null}
                      <span className="doc-card-icon-fallback" style={{ display: isImg && thumbUrl ? 'none' : 'flex' }}>
                        <IconComp size={36} style={{ color: iconColor }} />
                      </span>
                    </div>
                    <div className="doc-card-name" title={e.name}>{e.name}</div>
                    <div className="doc-card-meta">
                      {e.is_dir ? '' : formatSize(e.size)}
                      {!e.is_dir && e.modified ? ` · ${formatDate(e.modified)}` : ''}
                    </div>
                    {!e.is_dir && canPreviewFile(e.name) && (
                      <button className="doc-card-preview" onClick={(ev) => { ev.stopPropagation(); handlePreviewFile(e) }} title="Xem trước">
                        <Eye size={14} />
                      </button>
                    )}
                    <button className="doc-card-share" onClick={(ev) => { ev.stopPropagation(); handleShareEntry(e) }} title={e.is_dir ? 'Chia sẻ thư mục' : 'Chia sẻ'}>
                      <Share2 size={14} />
                    </button>
                    {!e.is_dir && (
                      <button className="doc-card-download" onClick={(ev) => { ev.stopPropagation(); handleDownloadFile(e) }} title="Tải xuống">
                        <Download size={14} />
                      </button>
                    )}
                    {canDeleteCurrent && (
                      <button className="doc-card-delete" onClick={(ev) => { ev.stopPropagation(); handleDeleteEntry(e) }} title="Xóa">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* List View */}
          {!loading && !browseError && viewMode === 'list' && filteredEntries.length > 0 && (
            <div className="doc-grid">
              <div className="doc-grid-header">
                <span className="doc-col-name">Tên</span>
                <span className="doc-col-size">Kích thước</span>
                <span className="doc-col-date">Cập nhật</span>
                <span className="doc-col-actions" />
              </div>
              <div className="doc-grid-body">
                {breadcrumbs.length > 2 && (
                  <div className="doc-grid-row doc-back-row" onClick={goBack} style={{ cursor: 'pointer' }}>
                    <div className="doc-col-name"><span className="doc-back-link">.. / Quay lại</span></div>
                    <div className="doc-col-size" />
                    <div className="doc-col-date" />
                    <div className="doc-col-actions" />
                  </div>
                )}
                {filteredEntries.map((e, i) => {
                  const { icon: IconComp, color: iconColor } = getFileIcon(e.name, e.is_dir)
                  const currentPath = breadcrumbs.at(-1).id
                  const isImg = !e.is_dir && isImageFile(e.name)
                  const thumbUrl = isImg ? buildThumbnailUrl(activeConfig, e, currentPath, userCode, userRole) : null
                  return (
                    <div key={i} className="doc-grid-row"
                      onClick={() => e.is_dir ? openFolder(e) : (isImg ? handlePreviewFile(e) : undefined)}
                      onContextMenu={(ev) => handleContextMenu(ev, e)}
                      style={{ cursor: (e.is_dir || isImg) ? 'pointer' : 'default' }}>
                      <div className="doc-col-name">
                        {isImg && thumbUrl ? (
                          <div className="doc-list-thumb-wrap">
                            <img src={thumbUrl} alt={e.name} loading="lazy" className="doc-list-thumb"
                              onError={(ev) => {
                                ev.currentTarget.style.display = 'none'
                                ev.currentTarget.parentElement.nextSibling?.removeAttribute('style')
                                const fallback = ev.currentTarget.closest('.doc-col-name')?.querySelector('.doc-list-icon-fallback')
                                if (fallback) fallback.style.display = 'flex'
                              }}
                            />
                          </div>
                        ) : (
                          <IconComp size={18} style={{ color: iconColor, flexShrink: 0 }} />
                        )}
                        {isImg && thumbUrl && (
                          <IconComp size={18} className="doc-list-icon-fallback" style={{ color: iconColor, flexShrink: 0, display: 'none' }} />
                        )}
                        <span className="doc-entry-name">{e.name}</span>
                      </div>
                      <div className="doc-col-size">{e.is_dir ? '' : formatSize(e.size)}</div>
                      <div className="doc-col-date">{formatDate(e.modified)}</div>
                      <div className="doc-col-actions">
                        {!e.is_dir && canPreviewFile(e.name) && (
                          <button className="doc-row-action" title="Xem trước" onClick={(ev) => { ev.stopPropagation(); handlePreviewFile(e); }}>
                            <Eye size={14} />
                          </button>
                        )}
                        <button className="doc-row-action" title={e.is_dir ? 'Chia sẻ thư mục' : 'Chia sẻ'} onClick={(ev) => { ev.stopPropagation(); handleShareEntry(e); }}>
                          <Share2 size={14} />
                        </button>
                        {!e.is_dir && (
                          <button className="doc-row-action" title="Tải xuống" onClick={(ev) => { ev.stopPropagation(); handleDownloadFile(e); }}>
                            <Download size={14} />
                          </button>
                        )}
                        {canDeleteCurrent && (
                          <button className="doc-row-action" title="Xóa" style={{ color: '#dc2626' }} onClick={(ev) => { ev.stopPropagation(); handleDeleteEntry(e); }}>
                            <Trash2 size={14} />
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
            <h3>{editingConfig ? 'Sửa cấu hình' : 'Thêm Ổ đĩa Storage'}</h3>
            <p className="panel-subtitle">Cấu hình kết nối tới máy chủ file qua SMB, FTP, hoặc Google Drive.</p>

            <div className="btn-import-export">
              <button className="btn-ie" onClick={() => fileInputRef.current?.click()}><Upload size={13} /> Import JSON</button>
              <button className="btn-ie" onClick={exportConfigToFile}><Download size={13} /> Export JSON</button>
            </div>
            <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importConfigFromFile} />

            <div className="form-group">
              <label className="doc-label">Tên</label>
              <input className="salary-pwd-input" value={configForm.name} onChange={e => setConfigForm({ ...configForm, name: e.target.value })} placeholder="VD: File Server Sản xuất" />
            </div>
            <div className="form-group">
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
                <div className="form-group">
                  <label className="doc-label">Host</label>
                  <input className="salary-pwd-input" value={configForm.host} onChange={e => setConfigForm({ ...configForm, host: e.target.value })} placeholder="10.0.0.1" />
                </div>
                <div className="form-row">
                  <div>
                    <label className="doc-label">Port</label>
                    <input className="salary-pwd-input" type="number" value={configForm.port} onChange={e => setConfigForm({ ...configForm, port: parseInt(e.target.value) || (configForm.type === 'smb' ? 445 : 21) })} />
                  </div>
                  <div>
                    <label className="doc-label">Username</label>
                    <input className="salary-pwd-input" value={configForm.username} onChange={e => setConfigForm({ ...configForm, username: e.target.value })} placeholder={configForm.type === 'smb' ? 'goldenfarm\\user' : 'anonymous'} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="doc-label">Password</label>
                  <input className="salary-pwd-input" type="password" value={configForm.password} onChange={e => setConfigForm({ ...configForm, password: e.target.value })} placeholder="********" />
                </div>
                <div className="form-group">
                  <label className="doc-label">Remote Path / Share</label>
                  <input className="salary-pwd-input" value={configForm.remote_path} onChange={e => setConfigForm({ ...configForm, remote_path: e.target.value })} placeholder={configForm.type === 'smb' ? 'Tên Share (VD: goldenfarm)' : '/'} />
                </div>
                {configForm.type === 'smb' && (
                  <div className="form-group">
                    <label className="doc-label">Domain (tùy chọn)</label>
                    <input className="salary-pwd-input" value={configForm.domain} onChange={e => setConfigForm({ ...configForm, domain: e.target.value })} placeholder="WORKGROUP" />
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="form-group">
                  <label className="doc-label">Service Account Email</label>
                  <input className="salary-pwd-input" value={configForm.username} onChange={e => setConfigForm({ ...configForm, username: e.target.value })} placeholder="ict-service@goldenfarm.iam.gserviceaccount.com" />
                </div>
                <div className="form-group">
                  <label className="doc-label">Service Account JSON</label>
                  <textarea className="salary-pwd-input" style={{ minHeight: 120, resize: 'vertical' }} value={configForm.password} onChange={e => setConfigForm({ ...configForm, password: e.target.value })} placeholder='{ "type": "service_account", "project_id": "...", "private_key": "..." }' />
                </div>
                <div className="form-group">
                  <label className="doc-label">Folder ID (Thư mục gốc)</label>
                  <input className="salary-pwd-input" value={configForm.remote_path} onChange={e => setConfigForm({ ...configForm, remote_path: e.target.value })} placeholder="1A2B3C4D5E6F7G8H9I0J" />
                </div>
              </>
            )}
            {testMsg && <div className={`doc-test-msg ${testOk ? 'ok' : 'err'}`}>{testMsg}</div>}
            <div className="form-actions">
              <button className="salary-btn salary-btn-secondary" onClick={testConn}>Test Connection</button>
              <button className="salary-btn salary-btn-primary" onClick={saveConfig}>Lưu</button>
              <button className="salary-btn salary-btn-secondary" onClick={() => setShowConfig(false)}>Hủy</button>
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
              <select className="salary-pwd-input" value={permForm.folder_path} onChange={e => setPermForm({ ...permForm, folder_path: e.target.value })}>
                <option value="/">Root (/)</option>
                {foldersList.map(f => (
                  <option key={f.path || f.full_path} value={f.full_path || f.path}>
                    {f.full_path || f.path} {f.name && f.name !== f.full_path ? `(${f.name})` : ''}
                  </option>
                ))}
              </select>
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
                <option value="read">Chỉ xem</option>
                <option value="write">Đọc/Ghi</option>
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                <input type="checkbox" checked={permForm.can_upload || false} onChange={e => setPermForm({ ...permForm, can_upload: e.target.checked })} />
                Upload
              </label>
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
                  <th>Upload</th>
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
                    <td>{p.permission === 'write' ? 'Đọc/Ghi' : 'Chỉ xem'}</td>
                    <td>{p.can_upload ? '✓' : '-'}</td>
                    <td><button className="salary-btn" style={{ padding: '2px 6px', fontSize: '0.7rem', color: '#dc2626' }} onClick={() => removePerm(p.id)}><Trash2 size={12} /></button></td>
                  </tr>
                ))}
                {perms.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8' }}>Chưa có phân quyền (mặc định tất cả được truy cập)</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu.visible && (
        <div className="doc-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          {!contextMenu.file.is_dir && (
            <div className="doc-context-menu-item" onClick={() => { handlePreviewFile(contextMenu.file); setContextMenu({ visible: false }) }}>
              <Eye size={15} /> Xem trước
            </div>
          )}
          <div className="doc-context-menu-item" onClick={() => { handleShareEntry(contextMenu.file); setContextMenu({ visible: false }) }}>
            <Share2 size={15} /> {contextMenu.file.is_dir ? 'Chia sẻ thư mục' : 'Chia sẻ'}
          </div>
          {!contextMenu.file.is_dir && (
            <div className="doc-context-menu-item" onClick={() => handleDownloadFile(contextMenu.file)}>
              <Download size={15} /> Tải xuống
            </div>
          )}
          {canDeleteCurrent && (
            <div className="doc-context-menu-item doc-context-menu-danger" onClick={() => { handleDeleteEntry(contextMenu.file); setContextMenu({ visible: false }) }}>
              <Trash2 size={15} /> Xóa
            </div>
          )}
        </div>
      )}

      {/* Upload Modal & Tối ưu Thanh Tiến Trình (Progress Bar) */}
      {showUpload && (
        <>
          <div className="panel-overlay open" onClick={() => !uploading && closeUploadPanel()} />
          <div className="side-panel open panel-upload">
            <div className="panel-body">
              <h3 style={{ marginBottom: '0.5rem' }}>Upload File</h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>Thư mục đích: {breadcrumbs.at(-1)?.name || '/'}</p>

              <div className="upload-dropzone" onDragOver={handleDragOver} onDrop={handleDrop} onClick={() => !uploading && document.getElementById('file-input-upload')?.click()}
                style={{ border: '2px dashed #cbd5e1', borderRadius: 12, padding: '2rem', textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer', background: '#f8fafc', transition: 'all 0.2s', opacity: uploading ? 0.6 : 1 }}>
                <UploadCloud size={48} style={{ color: '#94a3b8', marginBottom: '0.5rem' }} />
                <p style={{ color: '#64748b', marginBottom: '0.5rem' }}>{uploading ? 'Đang upload...' : 'Kéo thả file vào đây hoặc click để chọn'}</p>
              </div>
              <input id="file-input-upload" type="file" multiple style={{ display: 'none' }} onChange={handleFileSelect} disabled={uploading} />

              {/* Progress Bar UI được tinh chỉnh hiển thị mượt mà hơn */}
              {(uploading || uploadProgress > 0) && (
                <div style={{ marginTop: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#475569', marginBottom: '0.4rem', fontWeight: 500 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                      {uploadStatusText || 'Đang tiến hành upload...'}
                    </span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div style={{ height: 10, background: '#e2e8f0', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${uploadProgress}%`,
                      background: uploadSuccess ? '#16a34a' : 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                      transition: 'width 0.2s ease-in-out'
                    }} />
                  </div>
                </div>
              )}

              {uploadSuccess && !uploading && (
                <div className="doc-upload-success" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 0' }}>
                  <CheckCircle2 size={48} color="#16a34a" />
                  <p style={{ margin: 0, color: '#16a34a', fontSize: '0.95rem', fontWeight: 600 }}>Upload thành công!</p>
                </div>
              )}

              {uploadError && <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{uploadError}</div>}

              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="salary-btn salary-btn-secondary" onClick={closeUploadPanel} disabled={uploading}>Đóng</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Create Folder */}
      {showCreateFolder && (
        <>
          <div className="panel-overlay open" onClick={() => !uploading && setShowCreateFolder(false)} />
          <div className="side-panel open panel-create-folder">
            <div className="panel-body">
              <h3 style={{ marginBottom: '0.5rem' }}>Tạo thư mục mới</h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>
                Thư mục đích: {breadcrumbs.at(-1)?.name || '/'}
              </p>

              <div className="form-group">
                <label className="doc-label">Tên thư mục</label>
                <input
                  className="salary-pwd-input"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder() }}
                  placeholder="VD: Hợp đồng 2026"
                  autoFocus
                  disabled={uploading}
                />
              </div>

              {uploadError && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                  {uploadError}
                </div>
              )}

              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  className="salary-btn salary-btn-secondary"
                  onClick={() => { setShowCreateFolder(false); setNewFolderName(''); setUploadError(''); }}
                  disabled={uploading}
                >
                  Hủy
                </button>
                <button
                  className="salary-btn salary-btn-primary"
                  onClick={handleCreateFolder}
                  disabled={uploading || !newFolderName.trim()}
                >
                  Tạo thư mục
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <FileViewer file={viewerFile} isOpen={viewerOpen} onClose={() => { setViewerOpen(false); setViewerFile(null) }} />
      <PdfPagesViewer file={pdfPagesFile} isOpen={!!pdfPagesFile} onClose={() => setPdfPagesFile(null)} />
      <OnlyOfficeViewer file={ooFile} configId={ooConfigId} isOpen={ooOpen} onClose={() => { setOoOpen(false); setOoFile(null); setOoConfigId(null) }} />
      <DrawioViewer file={drawioFile} configId={drawioConfigId} isOpen={drawioOpen} onClose={() => { setDrawioOpen(false); setDrawioFile(null); setDrawioConfigId(null) }} />
      <ShareDocument file={shareFile} isOpen={shareOpen} onClose={() => { setShareOpen(false); setShareFile(null) }} />
      <ImageLightbox open={showLightbox} onClose={() => setShowLightbox(false)} slides={lightboxSlides} index={lightboxIndex} />
    </div>
  )
}
