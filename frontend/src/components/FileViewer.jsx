import React, { useState, useEffect, useRef } from 'react'
import { X, Download } from 'lucide-react'
import './FileViewer.css'

const textExts = ['txt', 'log', 'md', 'json', 'xml', 'csv', 'html', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'sql']

function getExt(name) {
  return name.split('.').pop().toLowerCase()
}

function isTextFile(name) {
  return textExts.includes(getExt(name))
}

export default function FileViewer({ file, isOpen, onClose }) {
  const [textContent, setTextContent] = useState('')
  const [textLoading, setTextLoading] = useState(false)
  const [textError, setTextError] = useState(null)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(null)
  const [pdfLoaded, setPdfLoaded] = useState(false)
  const mediaRef = useRef(null)

  useEffect(() => {
    if (!isOpen) {
      setTextContent('')
      setTextLoading(false)
      setTextError(null)
      setImgLoaded(false)
      setImgError(null)
      setPdfLoaded(false)
    }
  }, [isOpen])

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  // Stop media on unmount
  useEffect(() => {
    return () => {
      if (mediaRef.current) {
        try { mediaRef.current.pause() } catch (_) {}
      }
    }
  }, [])

  // Fetch text content
  useEffect(() => {
    if (!isOpen || !file || !isTextFile(file.name)) return
    setTextLoading(true)
    setTextError(null)
    fetch(file.url)
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.text()
      })
      .then(text => {
        setTextContent(text)
        setTextLoading(false)
      })
      .catch(err => {
        setTextError(err.message)
        setTextLoading(false)
      })
  }, [isOpen, file])

  // Auto-hide PDF spinner after 2s (onLoad is unreliable on <object>)
  useEffect(() => {
    if (!isOpen || !file) return
    if (getExt(file.name) !== 'pdf') return
    const timer = setTimeout(() => setPdfLoaded(true), 2000)
    return () => clearTimeout(timer)
  }, [isOpen, file])

  if (!isOpen || !file) return null

  if (file.error) {
    return (
      <div className="fv-overlay" onClick={onClose}>
        <div className="fv-container" onClick={e => e.stopPropagation()}>
          <div className="fv-header">
            <div className="fv-header-left">
              <span className="fv-file-name">{file.name}</span>
            </div>
            <div className="fv-header-right">
              <a href={file.url} target="_blank" rel="noopener noreferrer" className="fv-icon-btn" title="Tải xuống">
                <Download size={18} />
              </a>
              <button onClick={onClose} className="fv-icon-btn fv-close-btn" title="Đóng">
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="fv-content">
            <div className="fv-error">
              <p>❌ {file.error}</p>
              <a href={file.url} target="_blank" className="fv-btn fv-btn-primary" rel="noopener noreferrer">
                <Download size={16} /> Thử tải xuống
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const ext = getExt(file.name)

  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']
  const pdfExts = ['pdf']
  const videoExts = ['mp4', 'webm', 'ogg', 'avi', 'mov', 'mkv']
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'm4a']

  const isImage = imageExts.includes(ext)
  const isPdf = pdfExts.includes(ext)
  const isVideo = videoExts.includes(ext)
  const isAudio = audioExts.includes(ext)
  const isUnsupported = !isImage && !isPdf && !isTextFile(file.name) && !isVideo && !isAudio

  return (
    <div className="fv-overlay" onClick={onClose}>
      <div className="fv-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="fv-header">
          <div className="fv-header-left">
            <span className="fv-file-name">{file.name}</span>
            {file.size && <span className="fv-file-size">({formatSize(file.size)})</span>}
          </div>
          <div className="fv-header-right">
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="fv-icon-btn"
              title="Tải xuống / Mở tab mới"
            >
              <Download size={18} />
            </a>
            <button onClick={onClose} className="fv-icon-btn fv-close-btn" title="Đóng">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="fv-content">
          {isImage && (
            <div className="fv-image-container">
              {!imgLoaded && !imgError && <div className="fv-loading"><div className="fv-spinner" /><p>Đang tải...</p></div>}
              {imgError && (
                <div className="fv-error">
                  <p>❌ Không thể tải hình ảnh. {imgError}</p>
                  <a href={file.url} target="_blank" className="fv-btn fv-btn-primary" rel="noopener noreferrer">
                    <Download size={16} /> Tải về
                  </a>
                </div>
              )}
              <img
                src={file.url}
                alt={file.name}
                className="fv-image"
                style={{ display: imgLoaded ? 'block' : 'none' }}
                onLoad={() => setImgLoaded(true)}
                onError={(e) => setImgError(e.target.error?.message || 'Lỗi tải ảnh')}
              />
            </div>
          )}

          {isPdf && (
            <div className="fv-pdf-container">
              {!pdfLoaded && <div className="fv-loading"><div className="fv-spinner" /><p>Đang tải PDF...</p></div>}
              <object
                data={file.url}
                type="application/pdf"
                className="fv-pdf-object"
                onLoad={() => setPdfLoaded(true)}
              >
                <div className="fv-fallback">
                  <p>Trình duyệt không hỗ trợ xem PDF trực tiếp.</p>
                  <a href={file.url} target="_blank" className="fv-btn fv-btn-primary" rel="noopener noreferrer">
                    <Download size={16} /> Nhấn vào đây để xem / tải xuống
                  </a>
                </div>
              </object>
            </div>
          )}

          {isTextFile(file.name) && (
            <div className="fv-text-container">
              {textLoading && <div className="fv-loading"><div className="fv-spinner" /><p>Đang tải nội dung...</p></div>}
              {textError && (
                <div className="fv-error">
                  <p>❌ Lỗi tải nội dung: {textError}</p>
                  <a href={file.url} target="_blank" className="fv-btn fv-btn-primary" rel="noopener noreferrer">
                    <Download size={16} /> Tải về
                  </a>
                </div>
              )}
              {!textLoading && !textError && (
                <pre className="fv-text-pre">{textContent}</pre>
              )}
            </div>
          )}

          {isVideo && (
            <div className="fv-video-container">
              <video
                ref={mediaRef}
                src={file.url}
                controls
                playsInline
                className="fv-video"
                onError={() => setImgError('Không thể phát video')}
              >
                Trình duyệt không hỗ trợ phát video.
              </video>
            </div>
          )}

          {isAudio && (
            <div className="fv-audio-container">
              <div className="fv-audio-name">{file.name}</div>
              <audio
                ref={mediaRef}
                src={file.url}
                controls
                playsInline
                className="fv-audio"
                onError={() => setImgError('Không thể phát audio')}
              >
                Trình duyệt không hỗ trợ phát audio.
              </audio>
            </div>
          )}

          {isUnsupported && (
            <div className="fv-unknown-container">
              <div className="fv-unknown-icon">📎</div>
              <p className="fv-unknown-title">{file.name}</p>
              <p className="fv-unknown-desc">Không thể xem trước loại tệp này. Vui lòng tải xuống.</p>
              <a href={file.url} target="_blank" className="fv-btn fv-btn-primary" rel="noopener noreferrer">
                <Download size={16} /> Tải xuống
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
