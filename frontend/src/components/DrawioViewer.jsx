import React, { useEffect, useRef, useState, useCallback } from 'react'
import { X, Loader2, AlertCircle } from 'lucide-react'
import { loadDrawioFile, saveDrawioFile } from '../services/api'

// Ưu tiên env (VD: https://drawio.domain.com), fallback về nginx proxy cùng domain
const DRAWIO_URL = import.meta.env.VITE_DRAWIO_PUBLIC_URL || '/drawio'

const EMPTY_XML = '<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>'

// Đánh dấu request xuất PDF của riêng app (trả về trong msg.message.filename)
const PDF_EXPORT_MARKER = 'drawio-pdf-export'

/**
 * DrawioViewer — nhúng iframe Draw.io (Diagrams.net).
 *
 * Chế độ 1 — Documents (có storage):
 *   <DrawioViewer file={...} configId={...} isOpen onClose />
 *
 * Chế độ 2 — Standalone / Tools (không storage, gọi onSave):
 *   <DrawioViewer isOpen onClose onSave={(xml) => ...} exportRequestRef={ref} />
 *
 * exportRequestRef: nhận hàm requestPdfExport() → trả Promise<dataURI|false>.
 * PDF export chạy ở phía parent (mở cửa sổ in từ trang chính, không phải từ trong
 * iframe) nên không bị trình duyệt chặn popup/print như đường print-preview mặc định.
 */
export default function DrawioViewer({ file, configId, isOpen, onClose, onSave, exportRequestRef }) {
  const iframeRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)
  const savedRef = useRef(false)
  const latestXmlRef = useRef(null)
  const pdfReqRef = useRef(null)

  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || 'user'

  const isStandalone = !file && !configId

  const handleClose = useCallback((xml) => {
    const finalXml = xml ?? latestXmlRef.current
    savedRef.current = false
    setReady(false)
    setError(null)
    setLoading(false)
    if (pdfReqRef.current) {
      clearTimeout(pdfReqRef.current.timer)
      pdfReqRef.current = null
    }
    onClose(finalXml)
  }, [onClose])

  useEffect(() => {
    if (!isOpen) {
      savedRef.current = false
      setReady(false)
      setError(null)
      setLoading(false)
      if (pdfReqRef.current) {
        clearTimeout(pdfReqRef.current.timer)
        pdfReqRef.current = null
      }
      return
    }

    if (!DRAWIO_URL) {
      setError('Thiếu cấu hình VITE_DRAWIO_PUBLIC_URL')
      return
    }

    setLoading(true)
    setError(null)
    setReady(false)
    savedRef.current = false
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleEsc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleClose])

  useEffect(() => {
    if (!isOpen) return

    const handleMessage = async (evt) => {
      if (!DRAWIO_URL) return
      // DRAWIO_URL có thể là full URL (https://drawio.domain.com/drawio) hoặc relative path (/drawio)
      const isRelative = DRAWIO_URL.startsWith('/')
      let originOk = false
      if (isRelative) {
        // cùng domain (nginx proxy)
        originOk = evt.origin === window.location.origin
      } else {
        // Full URL: extract origin (protocol + host) từ DRAWIO_URL
        try {
          const drawioOrigin = new URL(DRAWIO_URL).origin
          originOk = evt.origin === drawioOrigin
        } catch {
          originOk = false
        }
      }
      if (!originOk) return
      let msg
      try { msg = JSON.parse(evt.data) } catch { return }

      if (msg.event === 'init') {
        try {
          let xml = EMPTY_XML

          if (!isStandalone) {
            const currentPath = file.browsePath || '/'
            const normalizedPath = currentPath === '/'
              ? file.name
              : `${currentPath.replace(/\/$/, '')}/${file.name}`
            const resp = await loadDrawioFile(configId, normalizedPath, userCode, userRole)
            xml = resp.data || EMPTY_XML
          } else {
            xml = latestXmlRef.current || EMPTY_XML
          }

          if (iframeRef.current) {
            iframeRef.current.contentWindow.postMessage(JSON.stringify({
              action: 'load',
              xml,
              autosave: 1,
            }), '*')
          }
          setLoading(false)
          setReady(true)
        } catch (err) {
          const errMsg = err.response?.data?.detail || err.message || 'Không thể tải file Draw.io'
          setError(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg))
          setLoading(false)
        }
      }

      if (msg.event === 'save' || msg.event === 'autosave') {
        if (msg.xml) latestXmlRef.current = msg.xml
        if (onSave) {
          onSave(msg.xml)
        }

        if (!isStandalone) {
          try {
            const currentPath = file.browsePath || '/'
            const normalizedPath = currentPath === '/'
              ? file.name
              : `${currentPath.replace(/\/$/, '')}/${file.name}`
            await saveDrawioFile(configId, normalizedPath, msg.xml, userCode, userRole)
            savedRef.current = true
          } catch (err) {
            console.error('[DrawioViewer] Save failed:', err)
          }
        } else {
          savedRef.current = true
        }

        // Nút "Save & Exit" của drawio gửi {event:'save', exit:true} — cần tự thoát
        if (msg.exit === true) {
          handleClose(msg.xml)
        }
      }

      // Trả lời request xuất PDF: drawio render SVG thuần client-side rồi gửi về
      if (msg.event === 'export') {
        const req = pdfReqRef.current
        if (req && msg.format === 'svg' && msg.message?.filename === PDF_EXPORT_MARKER && msg.data) {
          clearTimeout(req.timer)
          pdfReqRef.current = null
          req.resolve(msg.data)
        }
      }

      if (msg.event === 'exit') {
        handleClose()
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [isOpen, file, configId, userCode, userRole, handleClose, onSave, isStandalone])

  // Yêu cầu drawio render SVG hiện tại (không cần export server, không cần canvas)
  const requestPdfExport = useCallback(() => {
    return new Promise((resolve) => {
      const frame = iframeRef.current
      if (!frame?.contentWindow || !ready) {
        resolve(false)
        return
      }
      const req = {
        timer: setTimeout(() => {
          if (pdfReqRef.current === req) pdfReqRef.current = null
          resolve(false)
        }, 30000),
      }
      req.resolve = resolve
      pdfReqRef.current = req
      frame.contentWindow.postMessage(JSON.stringify({
        action: 'export',
        format: 'svg',
        scale: 2,
        border: 8,
        currentPage: true,
        filename: PDF_EXPORT_MARKER,
      }), '*')
    })
  }, [ready])

  useEffect(() => {
    if (exportRequestRef) exportRequestRef.current = requestPdfExport
    return () => {
      if (exportRequestRef) exportRequestRef.current = null
    }
  }, [exportRequestRef, requestPdfExport])

  if (!isOpen) return null

  // noExitBtn=1: ẩn nút "Exit" của drawio, chỉ giữ "Save" và "Save & Exit"
  const src = `${DRAWIO_URL}/?embed=1&proto=json&spin=1&saveAndExit=1&noSaveBtn=0&noExitBtn=1&ui=min`

  const overlayStyle = isStandalone
    ? { position: 'fixed', inset: 0, zIndex: 9999, background: 'transparent', pointerEvents: 'none' }
    : undefined

  const containerStyle = isStandalone
    ? { position: 'absolute', inset: 0, pointerEvents: 'auto' }
    : undefined

  return (
    <div
      className={isStandalone ? undefined : 'oov-overlay'}
      style={overlayStyle}
      onClick={isStandalone ? undefined : handleClose}
    >
      <div
        className={isStandalone ? undefined : 'oov-container'}
        style={containerStyle}
        onClick={isStandalone ? undefined : (e) => e.stopPropagation()}
      >
        {!isStandalone && (
          <button onClick={handleClose} className="oov-close-btn-floating" title="Đóng" type="button">
            <X size={12} />
            <span>Đóng</span>
          </button>
        )}

        <div className={isStandalone ? undefined : 'oov-body'} style={isStandalone ? { width: '100%', height: '100%' } : undefined}>
          {loading && (
            <div className="oov-loading oov-overlay-state" style={isStandalone ? { position: 'absolute', inset: 0, zIndex: 10 } : undefined}>
              <Loader2 size={32} className="oov-spin" />
              <p>Đang tải Draw.io...</p>
            </div>
          )}
          {error && (
            <div className="oov-error oov-overlay-state" style={isStandalone ? { position: 'absolute', inset: 0, zIndex: 10 } : undefined}>
              <AlertCircle size={32} />
              <p>{error}</p>
              <button className="doc-btn doc-btn-secondary" onClick={handleClose} type="button">Đóng</button>
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={src}
            title={file?.name || 'Draw.io Editor'}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              visibility: error ? 'hidden' : 'visible',
            }}
          />
        </div>
      </div>
    </div>
  )
}