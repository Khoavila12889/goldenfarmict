import React, { useEffect, useState } from 'react'
import { X, Download } from 'lucide-react'
import './FileViewer.css'

const MAX_AUTO_RETRY = 6

// Fetch before embedding: HTTP errors stay visible, and attachment PDFs can be viewed inline.
export default function CraftPreview({ file, isOpen, onClose, onSwitchOffice }) {
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setPreview(null)
    setError('')
    setStatus('')
    if (!isOpen || !file) return
    const controller = new AbortController()
    let objectUrl
    let disposed = false
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, 250000)
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    async function load() {
      for (let retry = 0; retry <= MAX_AUTO_RETRY; retry++) {
        try {
          if (retry > 0 && !disposed) setStatus(`Craft đang bận, tự động thử lại lần ${retry}/${MAX_AUTO_RETRY}…`)
          const response = await fetch(file.url, { signal: controller.signal, credentials: 'same-origin' })
          if (response.status === 429 || response.status === 503) {
            const body = await response.json().catch(() => null)
            const msg = typeof body?.detail === 'string' ? body.detail : ''
            if (retry < MAX_AUTO_RETRY && !disposed && !timedOut) {
              const retryAfter = Number(response.headers.get('retry-after') || response.headers.get('Retry-After') || 0)
              const delay = Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 30
                ? retryAfter * 1000
                : Math.min(3000 * (retry + 1), 15000)
              await sleep(delay)
              continue
            }
            throw new Error(msg || 'Craft đang bận xử lý tài liệu khác. Thử lại hoặc mở bằng OnlyOffice.')
          }
          if (!response.ok) {
            const body = await response.json().catch(() => null)
            throw new Error(typeof body?.detail === 'string' ? body.detail : `Không thể mở tài liệu (HTTP ${response.status})`)
          }
          const blob = await response.blob()
          if (disposed) return
          if (!blob.size) throw new Error('Tài liệu xem trước rỗng. Hãy mở bằng OnlyOffice.')
          if (file.kind === 'html' && !response.headers.get('content-type')?.includes('text/html')) {
            throw new Error('Máy chủ trả về sai định dạng bảng tính. Hãy thử lại hoặc mở bằng OnlyOffice.')
          }
          if (file.kind !== 'html' && !(await blob.slice(0, 5).text()).startsWith('%PDF-')) {
            throw new Error('Máy chủ không trả về file PDF hợp lệ. Hãy thử lại hoặc mở bằng OnlyOffice.')
          }
          const htmlPolicy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`
          const data = file.kind === 'html' ? htmlPolicy + await blob.text() : blob
          if (disposed) return
          const content = new Blob([data], { type: file.kind === 'html' ? 'text/html' : 'application/pdf' })
          objectUrl = URL.createObjectURL(content)
          setStatus('')
          setPreview({ source: file.url, url: objectUrl, canDownload: response.headers.get('X-Download-Allowed') !== 'false' })
          return
        } catch (err) {
          if (disposed || controller.signal.aborted) {
            if (!disposed) setError(timedOut ? 'Tải tài liệu quá lâu. Thử lại hoặc mở bằng OnlyOffice.' : err.message)
            return
          }
          // Abort do timeout tổng: dừng, không retry nữa.
          if (timedOut) {
            setError('Tải tài liệu quá lâu. Thử lại hoặc mở bằng OnlyOffice.')
            return
          }
          // Lỗi mạng / abort giữa chừng mà còn lượt retry cho 429/503 đã xử lý ở trên;
          // các lỗi khác báo ngay.
          if (err?.name === 'AbortError') return
          setError(err.message)
          return
        }
      }
    }
    load()
    return () => {
      disposed = true
      clearTimeout(timer)
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file, isOpen, attempt])

  useEffect(() => {
    if (!isOpen) return
    const close = (event) => { if (event.key === 'Escape') onClose() }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('keydown', close)
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen, onClose])

  if (!isOpen || !file) return null
  const src = preview?.source === file.url ? preview.url : null
  return (
    <div className="fv-overlay" onClick={onClose} style={{ padding: 0 }}>
      <div className="fv-container" role="dialog" aria-modal="true" aria-label={file.name}
        onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 'none', height: '100%', minHeight: 0, borderRadius: 0, overflow: 'hidden' }}>
        <div className="fv-header" style={{ padding: '8px 12px', flexWrap: 'wrap', gap: 8 }}>
          <div className="fv-header-left">
            <span className="fv-file-name">{file.name}</span>
            <span className="fv-badge">{file.app} · Chỉ xem</span>
          </div>
          <div className="fv-header-right">
            {onSwitchOffice && <button className="fv-btn" onClick={onSwitchOffice}>Mở bằng OnlyOffice</button>}
            {preview?.canDownload && <a href={file.downloadUrl || file.url} download={file.name} className="fv-icon-btn" title="Tải file gốc">
              <Download size={16} />
            </a>}
            <button onClick={onClose} className="fv-icon-btn fv-close-btn" title="Đóng"><X size={18} /></button>
          </div>
        </div>
        <div className="fv-content" style={{ padding: 0, minHeight: 0 }}>
          {error ? <div role="alert" style={{ padding: 24 }}>
            <p>{error}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="fv-btn" onClick={() => { setError(''); setAttempt(n => n + 1) }}>Thử lại</button>
              {onSwitchOffice && <button className="fv-btn" onClick={onSwitchOffice}>Mở bằng OnlyOffice</button>}
            </div>
          </div> : !src ? <div role="status" style={{ padding: 24 }}>
            <p>Đang tải bản xem trước…</p>
            {status && <p style={{ marginTop: 8, color: '#b45309' }}>{status}</p>}
            {onSwitchOffice && <button className="fv-btn" style={{ marginTop: 12 }} onClick={onSwitchOffice}>Mở bằng OnlyOffice</button>}
          </div> : (
            <iframe title={file.name} src={src} sandbox={file.kind === 'html' ? '' : undefined}
              style={{ width: '100%', height: '100%', display: 'block', border: 0, background: '#fff' }} />
          )}
        </div>
      </div>
    </div>
  )
}
