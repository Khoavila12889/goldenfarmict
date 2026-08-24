import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Download, Loader2, FileText, AlertTriangle, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react'
import { getForumPdfPages, getDocumentPdfPages, apiUrl } from '../services/api'
import './PdfPagesViewer.css'

/**
 * PdfPagesViewer — xem file PDF dưới dạng các trang ảnh WebP đã convert
 * sẵn trên server (không cần OnlyOffice). Dùng chung cho:
 *   - Thông báo nội bộ (AnnouncementsBox): PDF đính kèm /api/forum/uploads/
 *   - Module Tài liệu (Documents): PDF trên storage FTP/SMB/GDrive
 *
 * Props:
 *   file   { name, url, filename? , doc? } – name hiển thị, url gốc để tải xuống.
 *            + Forum: filename = tên file lưu server (uuid.pdf).
 *            + Documents: doc = { configId, filePath, fileId, size, userCode, userRole }.
 *   isOpen boolean
 *   onClose () => void
 *
 * Luồng: poll API trạng thái tới khi ready → render trang WebP (lazy-load khi cuộn);
 * lỗi → fallback tải xuống / thử lại.
 */
export default function PdfPagesViewer({ file, isOpen, onClose }) {
  const [pages, setPages] = useState(null)
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [loadedCount, setLoadedCount] = useState(0)
  const scrollRef = useRef(null)
  const timerRef = useRef(null)
  const attemptRef = useRef(0)

  const fetchPagesStatus = useCallback((f) => {
    if (f?.doc) {
      return getDocumentPdfPages(f.doc).then(r => r.data?.data)
    }
    return getForumPdfPages(f.filename).then(r => r.data?.data)
  }, [])

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  const pollStatus = useCallback((f) => {
    fetchPagesStatus(f)
      .then(d => {
        if (!d) throw new Error('empty')
        if (d.ready && Array.isArray(d.pages) && d.pages.length > 0) {
          setPages(d.pages.map(p => apiUrl(p)))
          setConverting(false)
          return
        }
        if (d.converting && attemptRef.current < 60) {
          attemptRef.current += 1
          setConverting(true)
          timerRef.current = setTimeout(() => pollStatus(f), 1500)
          return
        }
        setError(d.converting ? 'Hết thời gian chờ convert. Vui lòng thử lại sau.' : 'File PDF này chưa convert được sang ảnh.')
      })
      .catch(err => {
        const detail = err.response?.data?.detail
        setError(detail || 'Không tải được trang xem trước.')
      })
  }, [fetchPagesStatus])

  useEffect(() => {
    if (!isOpen || !file) return
    setPages(null); setConverting(false); setError(null)
    setZoom(1); setLoadedCount(0)
    attemptRef.current = 0
    pollStatus(file)
    return clearTimer
  }, [isOpen, file, pollStatus])

  // ESC đóng viewer + khóa scroll nền
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen || !file) return null

  const onImgLoad = () => setLoadedCount(c => c + 1)

  const scrollByPage = (dir) => {
    const el = scrollRef.current
    if (el) el.scrollBy({ top: dir * el.clientHeight * 0.9, behavior: 'smooth' })
  }

  return (
    <div className="ppv-overlay" onClick={onClose}>
      <div className="ppv-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ppv-header">
          <div className="ppv-header-left">
            <FileText size={17} />
            <span className="ppv-file-name">{file.name}</span>
            {pages && (
              <span className="ppv-page-count">
                {pages.length} trang{loadedCount > 0 ? ` · đã tải ${loadedCount}/${pages.length}` : ''}
              </span>
            )}
          </div>
          <div className="ppv-header-right">
            {pages && pages.length > 0 && (
              <>
                <button className="ppv-icon-btn" title="Thu nhỏ" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}>−</button>
                <span className="ppv-zoom-label">{Math.round(zoom * 100)}%</span>
                <button className="ppv-icon-btn" title="Phóng to" onClick={() => setZoom(z => Math.min(2.5, +(z + 0.25).toFixed(2)))}>+</button>
                <span className="ppv-sep" />
              </>
            )}
            <a href={file.url} target="_blank" rel="noopener noreferrer" className="ppv-icon-btn" title="Mở / tải PDF gốc">
              <Download size={18} />
            </a>
            <button onClick={onClose} className="ppv-icon-btn ppv-close" title="Đóng">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="ppv-content" ref={scrollRef}>
          {!pages && !error && (
            <div className="ppv-center">
              <Loader2 size={30} className="ppv-spin" />
              <p>{converting ? 'Đang chuyển đổi PDF sang ảnh, vui lòng đợi vài giây...' : 'Đang tải bản xem trước...'}</p>
              {converting && <small>Lần đầu mở sẽ hơi lâu, các lần sau sẽ hiển thị ngay.</small>}
            </div>
          )}

          {error && (
            <div className="ppv-center">
              <AlertTriangle size={34} color="#d97706" />
              <p>❌ {error}</p>
              <div className="ppv-error-actions">
                <button className="ppv-btn" onClick={() => { setError(null); attemptRef.current = 0; pollStatus(file) }}>
                  <RefreshCw size={15} /> Thử lại
                </button>
                <a className="ppv-btn ppv-btn-primary" href={file.url} target="_blank" rel="noopener noreferrer">
                  <Download size={15} /> Tải PDF xuống
                </a>
              </div>
            </div>
          )}

          {pages && (
            <div className="ppv-pages">
              {pages.map((src, i) => (
                <figure key={src} className="ppv-page">
                  <img
                    src={src}
                    alt={`Trang ${i + 1}`}
                    style={{ width: `${Math.round(zoom * 100)}%` }}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    onLoad={onImgLoad}
                  />
                  <figcaption>{i + 1} / {pages.length}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>

        {/* Nút cuộn nhanh */}
        {pages && pages.length > 1 && (
          <div className="ppv-nav">
            <button onClick={() => scrollByPage(-1)} title="Lên"><ChevronUp size={18} /></button>
            <button onClick={() => scrollByPage(1)} title="Xuống"><ChevronDown size={18} /></button>
          </div>
        )}
      </div>
    </div>
  )
}
