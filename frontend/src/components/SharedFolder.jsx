import React, { useEffect, useState, useCallback } from 'react'
import {
  FolderOpen, Folder, File, FileText, FileSpreadsheet, Image, Archive,
  ChevronRight, Home, Download, Loader2, AlertCircle, ArrowLeft
} from 'lucide-react'
import { getShareContents, getShareDownloadUrl, getShareArchiveUrl } from '../services/api'
import { useShareOnlyOffice } from '../hooks/useShareOnlyOffice'
import './SharedFolder.css'

const OFFICE_EXTS = new Set(['docx','xlsx','pptx','doc','xls','ppt','odt','ods','odp','csv','txt','rtf','pdf'])
const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','svg','bmp','ico'])

function getExt(name) {
  return name.split('.').pop().toLowerCase()
}

function getFileIcon(name, isDir) {
  if (isDir) return { icon: FolderOpen, color: '#f59e0b' }
  const ext = getExt(name)
  const map = {
    pdf:    { icon: FileText, color: '#dc2626' },
    doc:    { icon: FileText, color: '#2563eb' },
    docx:   { icon: FileText, color: '#2563eb' },
    xls:    { icon: FileSpreadsheet, color: '#16a34a' },
    xlsx:   { icon: FileSpreadsheet, color: '#16a34a' },
    ppt:    { icon: FileText, color: '#c026d3' },
    pptx:   { icon: FileText, color: '#c026d3' },
    jpg:    { icon: Image, color: '#16a34a' },
    jpeg:   { icon: Image, color: '#16a34a' },
    png:    { icon: Image, color: '#16a34a' },
    gif:    { icon: Image, color: '#16a34a' },
    svg:    { icon: Image, color: '#16a34a' },
    webp:   { icon: Image, color: '#16a34a' },
    zip:    { icon: Archive, color: '#64748b' },
    rar:    { icon: Archive, color: '#64748b' },
    '7z':   { icon: Archive, color: '#64748b' },
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

export default function SharedFolder({ token, info }) {
  const [crumbs, setCrumbs] = useState([{ id: '', name: info?.file_name || 'Thư mục' }])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [zipBusy, setZipBusy] = useState(false)
  const [zipError, setZipError] = useState('')

  const currentPath = crumbs.at(-1).id

  const loadContents = useCallback((path) => {
    setLoading(true)
    setError('')
    getShareContents(token, path || '')
      .then(r => setEntries(r.data?.data || []))
      .catch(err => setError(err.response?.data?.detail || err.message || 'Không thể tải nội dung thư mục'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => { loadContents('') }, [loadContents])

  const officePlaceholder = 'shared-folder-office-placeholder'
  const { error: ooError } = useShareOnlyOffice({
    enabled: !!selected && OFFICE_EXTS.has(getExt(selected.name)),
    token,
    filePath: selected?.path || '',
    fileId: selected?.id || '',
    fileName: selected?.name || '',
    placeholderId: officePlaceholder,
    scriptId: 'shared-folder-docsapi-script',
  })

  function openFolder(entry) {
    setCrumbs(prev => [...prev, { id: entry.path, name: entry.name }])
    loadContents(entry.path)
  }

  function browseCrumb(idx) {
    setCrumbs(prev => prev.slice(0, idx + 1))
    loadContents(crumbs[idx].id)
  }

  function openFile(entry) {
    setSelected({ name: entry.name, path: entry.path, id: entry.id || '', size: entry.size })
  }

  async function downloadZip() {
    setZipBusy(true)
    setZipError('')
    try {
      const res = await fetch(getShareArchiveUrl(token, currentPath))
      if (!res.ok) {
        let msg = 'Không thể nén thư mục (.zip)'
        try {
          const j = await res.json()
          if (j.detail) msg = j.detail
        } catch (_) {}
        setZipError(msg)
        return
      }
      const blob = await res.blob()
      if (!blob || blob.size === 0) {
        setZipError('File .zip rỗng hoặc không thể tải xuống')
        return
      }
      let fileName = `${(info?.file_name || 'folder').replace(/[\\/:*?"<>|]/g, '_')}.zip`
      const cd = res.headers?.get('Content-Disposition') || ''
      if (cd) {
        const mStar = /filename\*=UTF-8''([^;]+)/i.exec(cd)
        if (mStar) {
          fileName = decodeURIComponent(mStar[1])
        } else {
          const m = /filename="?([^";]+)"?/i.exec(cd)
          if (m) fileName = m[1]
        }
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 3000)
    } catch (e) {
      setZipError('Lỗi tải xuống: ' + (e?.message || ''))
    } finally {
      setZipBusy(false)
    }
  }

  // ─── File view (OnlyOffice / preview / download) ───
  if (selected) {
    const ext = getExt(selected.name)
    const isOffice = OFFICE_EXTS.has(ext)
    const isImage = IMAGE_EXTS.has(ext)
    const isPdf = ext === 'pdf'
    const downloadUrl = getShareDownloadUrl(token, selected.path, selected.id)
    return (
      <div className="sf-file-view">
        <div className="sf-file-bar">
          <button className="psp-btn psp-btn-ghost" onClick={() => setSelected(null)}>
            <ArrowLeft size={15} /> Quay lại thư mục
          </button>
          <div className="sf-file-name" title={selected.name}>{selected.name}</div>
          <a className="psp-btn psp-btn-primary" href={downloadUrl} download>
            <Download size={15} /> Tải xuống
          </a>
        </div>
        <div className="sf-file-body">
          {isOffice && (
            <div className="sf-editor-wrap">
              {ooError && (
                <div className="psp-error"><AlertCircle size={18} /> {ooError}</div>
              )}
              <div id={officePlaceholder} className="psp-editor" style={{ visibility: ooError ? 'hidden' : 'visible' }} />
            </div>
          )}
          {!isOffice && isImage && <img src={downloadUrl} alt={selected.name} className="psp-image" />}
          {!isOffice && isPdf && (
            <object data={downloadUrl} type="application/pdf" className="psp-pdf">
              <p>Trình duyệt không hỗ trợ xem PDF. <a href={downloadUrl} target="_blank" rel="noopener noreferrer">Nhấn để tải xuống</a>.</p>
            </object>
          )}
          {!isOffice && !isImage && !isPdf && (
            <div className="psp-file-body psp-unknown">
              <File size={40} />
              <p className="psp-unknown-title">{selected.name}</p>
              <p className="psp-unknown-desc">Loại tệp này không thể xem trực tuyến.</p>
              <a className="psp-btn psp-btn-primary" href={downloadUrl} download>
                <Download size={15} /> Tải xuống
              </a>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── Folder browse view ───
  return (
    <div className="sf-browse">
      <div className="sf-toolbar">
        <div className="sf-breadcrumb">
          <span className="sf-breadcrumb-home" title="Thư mục gốc chia sẻ" onClick={() => browseCrumb(0)}>
            <Home size={14} />
          </span>
          {crumbs.map((b, i) => (
            <React.Fragment key={b.id || 'root'}>
              <ChevronRight size={11} className="sf-bc-sep" />
              <span
                className={`sf-bc-item${i === crumbs.length - 1 ? ' active' : ''}`}
                onClick={() => i < crumbs.length - 1 && browseCrumb(i)}
              >
                {b.name}
              </span>
            </React.Fragment>
          ))}
        </div>
        <button className="psp-btn psp-btn-ghost sf-zip-btn" onClick={downloadZip} disabled={zipBusy} title="Tải toàn bộ thư mục (.zip)">
          {zipBusy ? <Loader2 size={15} className="psp-spin" /> : <Download size={15} />} .zip
        </button>
      </div>

      {zipError && (
        <div className="psp-error sf-zip-error">
          <AlertCircle size={18} /> {zipError}
        </div>
      )}

      {loading && (
        <div className="psp-state">
          <Loader2 size={32} className="psp-spin" />
          <p>Đang tải nội dung...</p>
        </div>
      )}

      {error && !loading && (
        <div className="psp-state">
          <AlertCircle size={34} />
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className="psp-state">
          <FolderOpen size={40} />
          <p>Thư mục này đang trống</p>
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="sf-grid">
          {entries.map((e, i) => {
            const { icon: IconComp, color: iconColor } = getFileIcon(e.name, e.is_dir)
            return (
              <div
                key={e.id || i}
                className="sf-card"
                onClick={() => e.is_dir ? openFolder(e) : openFile(e)}
              >
                <div className="sf-card-icon">
                  <IconComp size={36} style={{ color: iconColor }} />
                </div>
                <div className="sf-card-name" title={e.name}>{e.name}</div>
                <div className="sf-card-meta">
                  {e.is_dir ? 'Thư mục' : formatSize(e.size)}
                </div>
                {!e.is_dir && (
                  <button className="sf-card-action" title="Tải xuống"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      const a = document.createElement('a')
                      a.href = getShareDownloadUrl(token, e.path, e.id)
                      a.download = e.name
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                    }}>
                    <Download size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
