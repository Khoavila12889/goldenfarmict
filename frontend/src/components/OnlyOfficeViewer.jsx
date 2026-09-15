import React, { useEffect, useState, useRef, useCallback } from 'react'
import { X, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { getOnlyOfficeConfig } from '../services/api'

const EDITOR_PLACEHOLDER_ID = 'onlyoffice-editor-placeholder'
const INIT_TIMEOUT_MS = 25000

function cleanEditorConfig(raw) {
  if (!raw || typeof raw !== 'object') return raw
  const { _docsApiUrl, ...config } = raw
  return config
}

export default function OnlyOfficeViewer({ file, configId, isOpen, onClose, getConfig }) {
  const [editorConfig, setEditorConfig] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [scriptReady, setScriptReady] = useState(false)
  const [editorInited, setEditorInited] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const editorRef = useRef(null)
  const initAttemptedRef = useRef(false)
  const initTimerRef = useRef(null)

  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || 'user'

  const destroyEditor = useCallback(() => {
    if (initTimerRef.current) { clearTimeout(initTimerRef.current); initTimerRef.current = null }
    if (editorRef.current) {
      try { editorRef.current.destroyEditor() } catch (_) {}
      editorRef.current = null
    }
    const el = document.getElementById(EDITOR_PLACEHOLDER_ID)
    if (el) el.innerHTML = ''
    initAttemptedRef.current = false
    setEditorInited(false)
  }, [])

  // ── Reset khi đóng / mở file mới ──────────────────────────────
  useEffect(() => {
    if (!isOpen || !file || (!configId && !getConfig)) {
      destroyEditor()
      setEditorConfig(null)
      setError(null)
      setLoading(false)
      setScriptReady(false)
      return
    }

    setLoading(true)
    setError(null)
    setEditorConfig(null)
    setScriptReady(false)
    setEditorKey(k => k + 1)
    destroyEditor()

    if (window.DocsAPI && window.DocsAPI.DocEditor) {
      setScriptReady(true)
    }

    const fetchPromise = getConfig
      ? getConfig()
      : (() => {
          const currentPath = file.browsePath || '/'
          const normalizedPath = currentPath === '/'
            ? file.name
            : `${currentPath.replace(/\/$/, '')}/${file.name}`
          return getOnlyOfficeConfig(configId, normalizedPath, userCode, userRole, file.id)
        })()

    fetchPromise
      .then(r => {
        setEditorConfig(r.data)
        setLoading(false)
      })
      .catch(err => {
        const msg = err.response?.data?.detail || err.message || 'Không thể khởi tạo ONLYOFFICE'
        setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
        setLoading(false)
      })
  }, [isOpen, file, configId, getConfig, destroyEditor, userCode, userRole])

  // ── Load DocsAPI script ────────────────────────────────────────
  useEffect(() => {
    if (!editorConfig || !isOpen) return
    const apiUrl = editorConfig._docsApiUrl
    if (!apiUrl) {
      setError('Thiếu cấu hình DocsAPI URL (_docsApiUrl)')
      return
    }

    if (window.DocsAPI && window.DocsAPI.DocEditor) {
      setScriptReady(true)
      return
    }

    const existing = document.getElementById('oo-docsapi-script')
    if (existing) {
      if (window.DocsAPI && window.DocsAPI.DocEditor) {
        setScriptReady(true)
        return
      }
      const onLoad = () => setScriptReady(true)
      const onError = () => setError(
        `Không thể tải ONLYOFFICE API.\nURL: ${existing.src}`
      )
      existing.addEventListener('load', onLoad)
      existing.addEventListener('error', onError)
      return () => {
        existing.removeEventListener('load', onLoad)
        existing.removeEventListener('error', onError)
      }
    }

    const script = document.createElement('script')
    script.id = 'oo-docsapi-script'
    script.src = apiUrl
    script.async = true
    script.onload = () => setScriptReady(true)
    script.onerror = () => setError(
      `Không thể tải ONLYOFFICE API.\nURL: ${apiUrl}`
    )
    document.body.appendChild(script)
  }, [editorConfig, isOpen])

  // ── Initialize editor sau khi script sẵn sàng ─────────────────
  const initEditor = useCallback(() => {
    if (!editorConfig || initAttemptedRef.current) return
    const DocsAPI = window.DocsAPI
    if (!DocsAPI || !DocsAPI.DocEditor) {
      setError('DocsAPI.DocEditor không khả dụng. Vui lòng tải lại trang và thử lại.')
      return
    }

    const placeholder = document.getElementById(EDITOR_PLACEHOLDER_ID)
    if (!placeholder) {
      setError('Không tìm thấy vùng hiển thị editor.')
      return
    }

    initAttemptedRef.current = true

    // Dọn sạch placeholder trước khi init — quan trọng để tránh React conflict
    if (editorRef.current) {
      try { editorRef.current.destroyEditor() } catch (_) {}
      editorRef.current = null
    }
    placeholder.innerHTML = ''

    const config = cleanEditorConfig(editorConfig)

    try {
      editorRef.current = new DocsAPI.DocEditor(EDITOR_PLACEHOLDER_ID, {
        ...config,
        events: {
          ...(config.events || {}),
          onAppReady: () => {
            if (initTimerRef.current) { clearTimeout(initTimerRef.current); initTimerRef.current = null }
            setEditorInited(true)
          },
          onDocumentReady: () => {
            if (initTimerRef.current) { clearTimeout(initTimerRef.current); initTimerRef.current = null }
            setEditorInited(true)
          },
          onError: (event) => {
            const data = event?.data
            let msg = 'Lỗi ONLYOFFICE khi mở tài liệu'
            if (typeof data === 'string') {
              msg = data
            } else if (data) {
              msg = data.errorDescription || data.message || JSON.stringify(data, null, 2)
            }
            console.error('[OO] onError detail:', JSON.stringify(event?.data, null, 2))
            setError(msg)
          },
          onRequestClose: () => {
            onClose()
          },
        },
      })

      initTimerRef.current = setTimeout(() => {
        if (!editorInited) {
          setError('Không thể khởi tạo trình soạn thảo. Vui lòng thử lại hoặc tải file xuống để xem.')
        }
      }, INIT_TIMEOUT_MS)
    } catch (err) {
      initAttemptedRef.current = false
      setError('Lỗi khởi tạo ONLYOFFICE: ' + (err.message || String(err)))
    }
  }, [editorConfig, editorInited])

  useEffect(() => {
    if (!isOpen || !scriptReady || !editorConfig) return
    if (editorInited || initAttemptedRef.current) return
    const timer = setTimeout(initEditor, 150)
    return () => { clearTimeout(timer) }
  }, [isOpen, scriptReady, editorConfig, initEditor, editorInited])

  // ── Keyboard + scroll lock ────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  // ── Cleanup timer on unmount ──────────────────────────────────
  useEffect(() => {
    return () => {
      if (initTimerRef.current) clearTimeout(initTimerRef.current)
    }
  }, [])

  if (!isOpen) return null

  const showLoading = (loading || (!editorInited && !error)) && !error

  return (
    <div className="oov-overlay" onClick={onClose}>
      <div className="oov-container" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="oov-close-btn-floating" title="Đóng (Esc)" type="button">
          <X size={12} />
          <span>Đóng</span>
        </button>

        <div className="oov-body">
          {showLoading && (
            <div className="oov-loading oov-overlay-state">
              <Loader2 size={32} className="oov-spin" />
              <p>{loading ? 'Đang tải cấu hình...' : 'Đang khởi tạo ONLYOFFICE...'}</p>
            </div>
          )}

          {error && (
            <div className="oov-error oov-overlay-state" style={{ zIndex: 2 }}>
              <AlertCircle size={32} />
              <p style={{ whiteSpace: 'pre-wrap', maxWidth: '90%', fontSize: '0.85rem' }}>{error}</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  className="doc-btn doc-btn-secondary"
                  onClick={() => {
                    setError(null)
                    setEditorConfig(null)
                    setScriptReady(false)
                    setEditorKey(k => k + 1)
                    destroyEditor()
                    setLoading(true)
                    const currentPath = file?.browsePath || '/'
                    const normalizedPath = currentPath === '/'
                      ? file.name
                      : `${currentPath.replace(/\/$/, '')}/${file.name}`
                    const fetchPromise = getConfig
                      ? getConfig()
                      : getOnlyOfficeConfig(configId, normalizedPath, userCode, userRole, file?.id)
                    fetchPromise
                      .then(r => { setEditorConfig(r.data); setLoading(false) })
                      .catch(err => {
                        const msg = err.response?.data?.detail || err.message || 'Không thể khởi tạo ONLYOFFICE'
                        setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
                        setLoading(false)
                      })
                  }}
                  type="button"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <RefreshCw size={14} /> Thử lại
                </button>
                {file?.url && (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                      padding: '0.5rem 0.9rem', background: '#0a5b35', color: '#fff',
                      borderRadius: 8, fontSize: '0.84rem', fontWeight: 600,
                      textDecoration: 'none', cursor: 'pointer',
                    }}
                  >
                    Mở trong tab mới
                  </a>
                )}
                <button className="doc-btn doc-btn-secondary" onClick={onClose} type="button">Đóng</button>
              </div>
            </div>
          )}

          {/* Chỉ render editor div khi không có error — tránh React conflict với OnlyOffice iframe */}
          {!error && (
            <div
              key={editorKey}
              id={EDITOR_PLACEHOLDER_ID}
              className="oov-editor"
            />
          )}
        </div>
      </div>
    </div>
  )
}