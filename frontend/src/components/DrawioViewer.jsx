import React, { useEffect, useRef, useState, useCallback } from 'react'
import { X, Loader2, AlertCircle } from 'lucide-react'
import { loadDrawioFile, saveDrawioFile } from '../services/api'

// Ưu tiên env (VD: https://drawio.domain.com), fallback về nginx proxy cùng domain
const DRAWIO_URL = import.meta.env.VITE_DRAWIO_PUBLIC_URL || '/drawio'

const EMPTY_XML = '<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>'

/**
 * DrawioViewer — nhúng iframe Draw.io (Diagrams.net).
 *
 * Chế độ 1 — Documents (có storage):
 *   <DrawioViewer file={...} configId={...} isOpen onClose />
 *
 * Chế độ 2 — Standalone / Tools (không storage, gọi onSave):
 *   <DrawioViewer isOpen onClose onSave={(xml) => ...} />
 */
export default function DrawioViewer({ file, configId, isOpen, onClose, onSave }) {
  const iframeRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)
  const savedRef = useRef(false)

  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || 'user'

  const isStandalone = !file && !configId

  const handleClose = useCallback(() => {
    savedRef.current = false
    setReady(false)
    setError(null)
    setLoading(false)
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!isOpen) {
      savedRef.current = false
      setReady(false)
      setError(null)
      setLoading(false)
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
          const msg = err.response?.data?.detail || err.message || 'Không thể tải file Draw.io'
          setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
          setLoading(false)
        }
      }

      if (msg.event === 'save' || msg.event === 'autosave') {
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
      }

      if (msg.event === 'exit') {
        handleClose()
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [isOpen, file, configId, userCode, userRole, handleClose, onSave, isStandalone])

  if (!isOpen) return null

  const src = `${DRAWIO_URL}/?embed=1&proto=json&spin=1&saveAndExit=1&noSaveBtn=0&ui=min`

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
