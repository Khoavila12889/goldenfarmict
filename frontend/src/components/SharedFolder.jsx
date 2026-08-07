import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  FolderOpen, Folder, File, FileText, FileSpreadsheet, Image, Archive,
  ChevronRight, Home, Download, Loader2, AlertCircle, ArrowLeft, X
} from 'lucide-react'
import { getShareContents, getShareDownloadUrl, getShareArchiveUrl } from '../services/api'
import { useShareOnlyOffice } from '../hooks/useShareOnlyOffice'
import ImageLightbox from './ImageLightbox'
import './SharedFolder.css'

const OFFICE_EXTS = new Set(['docx','xlsx','pptx','doc','xls','ppt','odt','ods','odp','csv','txt','rtf','pdf'])
const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','svg','bmp','ico','avif','tif','tiff'])

function getExt(name) {
  return name.split('.').pop().toLowerCase()
}

function isImageFile(name) {
  return IMAGE_EXTS.has(getExt(name))
}

/** GDrive API field: backend trả snake_case, một số client dùng camelCase */
function getEntryThumbnailLink(entry) {
  return entry?.thumbnailLink || entry?.thumbnail_link || ''
}

/**
 * URL Thumbnail xem trước nhỏ
 */
function buildShareThumbnailUrl(token, entry, size = 400) {
  if (!entry || !isImageFile(entry.name)) return null
  const thumb = getEntryThumbnailLink(entry)
  if (thumb) {
    return thumb.replace(/=s\d+(-c)?$/, `=s${size}`)
  }
  // Nếu không có API thumbnail riêng, dùng inline download
  return getShareDownloadUrl(token, entry.path, entry.id || '', 'inline')
}

/**
 * URL Ảnh gốc nét căng dành riêng cho Lightbox
 */
function buildShareFullImageUrl(token, entry) {
  if (!entry || !isImageFile(entry.name)) return null
  const thumb = getEntryThumbnailLink(entry)
  if (thumb) {
    // Tăng kích thước thumbnail của GDrive lên 2048px thay vì dùng inline download bị chậm
    return thumb.replace(/=s\d+(-c)?$/, '=s2048')
  }
  return getShareDownloadUrl(token, entry.path, entry.id || '', 'inline')
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

  // ── Lightbox state ────────────────────────────────────────────
  const [showLightbox, setShowLightbox] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const currentPath = crumbs.at(-1).id
  const canDownload = info?.permissions?.includes?.('download') !== false

  // ── Memoized image list + lightbox slides ──────────────────────
  const imageEntries = useMemo(() =>
    entries.filter(e => !e.is_dir && isImageFile(e.name))
  , [entries])

  const lightboxSlides = useMemo(() =>
    imageEntries.map(e => {
      const downloadAttachmentUrl = getShareDownloadUrl(token, e.path, e.id || '', 'attachment')
      const thumbUrl = buildShareThumbnailUrl(token, e, 400)
      const fullImageUrl = buildShareFullImageUrl(token, e)
      return {
        src: fullImageUrl || thumbUrl, // Ảnh gốc nét căng
        thumbnail: thumbUrl,           // Ảnh preview nhỏ
        downloadUrl: downloadAttachmentUrl,
        alt: e.name,
        title: e.name,
      }
    })
  , [imageEntries, token])

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
  const { error: ooError, ready: ooReady } = useShareOnlyOffice({
    enabled: !!selected && OFFICE_EXTS.has(getExt(selected.name)),
    token,
    filePath: selected?.path || '',
    fileId: selected?.id || '',
    fileName: selected?.name || '',
    placeholderId: officePlaceholder,
    scriptId: 'shared-folder-docsapi-script',
  })

  useEffect(() => {
    if (!selected) return
    const handleEsc = (e) => { if (e.key === 'Escape') setSelected(null) }
    document.addEventListener('keydown', handleEsc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [selected])

  function openFolder(entry) {
    setCrumbs(prev => [...prev, { id: entry.path, name: entry.name }])
    loadContents(entry.path)
  }

  function browseCrumb(idx) {
    setCrumbs(prev => prev.slice(0, idx + 1))
    loadContents(crumbs[idx].id)
  }

  function openFile(entry) {
    // ── Ảnh → lightbox ─────────────────────────────────────
    if (isImageFile(entry.name)) {
      const idx = imageEntries.findIndex(e => e.name === entry.name && e.path === entry.path)
      setLightboxIndex(idx >= 0 ? idx : 0)
      setShowLightbox(true)
      return
    }
    // ── Office / khác → overlay cũ ───────────────────────────
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

  // ─── File view (full-screen overlay) ───
  if (selected) {
    const ext = getExt(selected.name)
    const isOffice = OFFICE_EXTS.has(ext)
    const isImage = IMAGE_EXTS.has(ext)
    const isPdf = ext === 'pdf'
    const downloadUrl = getShareDownloadUrl(token, selected.path, selected.id)
    const downloadAttachmentUrl = getShareDownloadUrl(token, selected.path, selected.id, 'attachment')
    return (
      <div className="sf-overlay">
        <div className="sf-overlay-bar">
          <button className="psp-btn psp-btn-ghost" onClick={() => setSelected(null)}>
            <ArrowLeft size={15} /> Quay lại thư mục
          </button>
          <div className="sf-file-name" title={selected.name}>{selected.name}</div>
          <div className="sf-overlay-bar-right">
            {canDownload && (
              <a className="psp-btn psp-btn-primary" href={downloadAttachmentUrl} download>
                <Download size={15} /> Tải xuống
              </a>
            )}
            <button className="sf-overlay-close" onClick={() => setSelected(null)} title="Đóng (Esc)">
              <X size={15} /> Đóng
            </button>
          </div>
        </div>
        <div className="sf-overlay-body">
          {isOffice && (
            <div className="sf-editor-wrap sf-editor-wrap-full">
              <div className="psp-error sf-editor-error" style={{ display: ooError ? 'flex' : 'none' }}>
                <AlertCircle size={18} /> {ooError || ''}
              </div>
              <div className="sf-editor-loading" style={{ display: (ooError || ooReady) ? 'none' : 'flex' }}>
                <Loader2 size={32} className="psp-spin" />
                <p>Đang khởi tạo trình xem tài liệu...</p>
              </div>
              <div id={officePlaceholder} className="psp-editor" style={{ visibility: ooError ? 'hidden' : 'visible' }} />
            </div>
          )}
          {!isOffice && isImage && <img src={downloadUrl} alt={selected.name} className="psp-image sf-overlay-image" />}
          {!isOffice && isPdf && (
            <object data={downloadUrl} type="application/pdf" className="psp-pdf sf-overlay-pdf">
              <p>Trình duyệt không hỗ trợ xem PDF. <a href={downloadUrl} target="_blank" rel="noopener noreferrer">Nhấn để tải xuống</a>.</p>
            </object>
          )}
          {!isOffice && !isImage && !isPdf && (
            <div className="psp-file-body psp-unknown sf-overlay-unknown">
              <File size={40} />
              <p className="psp-unknown-title">{selected.name}</p>
              <p className="psp-unknown-desc">Loại tệp này không thể xem trực tuyến.</p>
              {canDownload ? (
                <a className="psp-btn psp-btn-primary" href={downloadAttachmentUrl} download>
                  <Download size={15} /> Tải xuống
                </a>
              ) : (
                <p className="psp-unknown-desc">Chia sẻ này không cho phép tải xuống tệp.</p>
              )}
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
        {canDownload && (
          <button className="psp-btn psp-btn-ghost sf-zip-btn" onClick={downloadZip} disabled={zipBusy} title="Tải toàn bộ thư mục (.zip)">
            {zipBusy ? <Loader2 size={15} className="psp-spin" /> : <Download size={15} />} .zip
          </button>
        )}
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
            const isImg = !e.is_dir && isImageFile(e.name)
            const thumbUrl = isImg ? buildShareThumbnailUrl(token, e, 400) : null
            return (
              <div
                key={e.id || i}
                className={`sf-card${isImg ? ' sf-card-image' : ''}`}
                onClick={() => e.is_dir ? openFolder(e) : openFile(e)}
              >
                <div className="sf-card-icon">
                  {isImg && thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={e.name}
                      loading="lazy"
                      decoding="async"
                      className="sf-card-thumb"
                      onError={(ev) => {
                        ev.currentTarget.style.display = 'none'
                        if (ev.currentTarget.nextSibling) {
                          ev.currentTarget.nextSibling.style.display = 'flex'
                        }
                      }}
                    />
                  ) : null}
                  <span
                    className="sf-card-icon-fallback"
                    style={{ display: isImg && thumbUrl ? 'none' : 'flex' }}
                  >
                    <IconComp size={36} style={{ color: iconColor }} />
                  </span>
                </div>
                <div className="sf-card-name" title={e.name}>{e.name}</div>
                <div className="sf-card-meta">
                  {e.is_dir ? 'Thư mục' : formatSize(e.size)}
                </div>
                {!e.is_dir && canDownload && (
                  <a
                    className="sf-card-action"
                    title="Tải xuống"
                    href={getShareDownloadUrl(token, e.path, e.id, 'attachment')}
                    download={e.name}
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <Download size={14} />
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Image Lightbox ─────────────────────────────────── */}
      <ImageLightbox
        open={showLightbox}
        onClose={() => setShowLightbox(false)}
        slides={lightboxSlides}
        index={lightboxIndex}
      />
    </div>
  )
}
