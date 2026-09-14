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
    destroyEditor()

    // Pre-check: nếu DocsAPI đã có sẵn từ lần mở trước
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

    // Already loaded
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
        `Không thể tải ONLYOFFICE API. Vui lòng kiểm tra kết nối mạng và thử lại.\nURL: ${existing.src}`
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
      `Không thể tải ONLYOFFICE API. Vui lòng kiểm tra kết nối mạng và thử lại.\nURL: ${apiUrl}`
    )
    document.body.appendChild(script)

    return () => {
      // Cleanup script when unmounting
    }
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

    // Ensure placeholder has non-zero dimensions before initializing
    const rect = placeholder.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      // Retry after a short delay — container may still be animating
      initTimerRef.current = setTimeout(initEditor, 200)
      return
    }

    initAttemptedRef.current = true
    const config = cleanEditorConfig(editorConfig)

    try {
      if (editorRef.current) {
        try { editorRef.current.destroyEditor() } catch (_) {}
        editorRef.current = null
      }
      placeholder.innerHTML = ''

      editorRef.current = new DocsAPI.DocEditor(EDITOR_PLACEHOLDER_ID, {
        ...config,
        events: {
          ...(config.events || {}),
          onAppReady: () => {
            console.log('[OO] onAppReady')
            if (initTimerRef.current) { clearTimeout(initTimerRef.current); initTimerRef.current = null }
            setEditorInited(true)
          },
          onDocumentReady: () => {
            console.log('[OO] onDocumentReady')
            if (initTimerRef.current) { clearTimeout(initTimerRef.current); initTimerRef.current = null }
            setEditorInited(true)
          },
          onError: (event) => {
            console.error('[OO] onError:', event)
            const data = event?.data
            const msg = typeof data === 'string'
              ? data
              : (data?.errorDescription || data?.message || 'Lỗi ONLYOFFICE khi mở tài liệu')
            setError(String(msg))
          },
          onRequestClose: () => {
            console.log('[OO] onRequestClose')
            onClose()
          },
        },
      })

      // Safety timeout: nếu editor không bao giờ báo ready, hiển thị lỗi
      initTimerRef.current = setTimeout(() => {
        if (!editorInited) {
          setError('Không thể khởi tạo trình soạn thảo. Vui lòng thử lại hoặc tải file xuống để xem.')
        }
      }, INIT_TIMEOUT_MS)

      console.log('[OO] DocEditor created, config:', JSON.stringify({
        docUrl: config.document?.url?.substring(0, 60) + '...',
        key: config.document?.key,
        title: config.document?.title,
        fileType: config.document?.fileType,
        mode: config.editorConfig?.mode,
        hasToken: !!config.token,
      }))
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

        {/* Nút Đóng lơ lửng góc phải đè lên giao diện ONLYOFFICE */}
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
            <div className="oov-error oov-overlay-state">
              <AlertCircle size={32} />
              <p style={{ whiteSpace: 'pre-wrap', maxWidth: '90%' }}>{error}</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  className="doc-btn doc-btn-secondary"
                  onClick={() => {
                    setError(null)
                    setEditorConfig(null)
                    setScriptReady(false)
                    destroyEditor()
                    // Re-trigger config fetch by toggling state
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

          <div
            id={EDITOR_PLACEHOLDER_ID}
            className="oov-editor"
            style={{
              visibility: error ? 'hidden' : 'visible',
              width: '100%',
              height: '100%',
            }}
          />
        </div>
      </div>
    </div>
  )
}