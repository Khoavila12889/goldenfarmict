import React, { useEffect, useState, useRef, useCallback } from 'react'
import { X, Loader2, AlertCircle } from 'lucide-react'
import { getOnlyOfficeConfig } from '../services/api'

const EDITOR_PLACEHOLDER_ID = 'onlyoffice-editor-placeholder'

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
  const placeholderRef = useRef(null)

  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || 'user'

  const destroyEditor = useCallback(() => {
    if (editorRef.current) {
      try { editorRef.current.destroyEditor() } catch (_) {}
      editorRef.current = null
    }
    const el = placeholderRef.current
    if (el) {
      while (el.firstChild) {
        try { el.removeChild(el.firstChild) } catch (_) { break }
      }
    }
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
      const onError = () => setError(`Không thể tải ONLYOFFICE API. URL: ${existing.src}`)
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
    script.onerror = () => setError(`Không thể tải ONLYOFFICE API. URL: ${apiUrl}`)
    document.body.appendChild(script)
  }, [editorConfig, isOpen])

  // ── Initialize editor ──────────────────────────────────────────
  const initEditor = useCallback(() => {
    if (!editorConfig || initAttemptedRef.current) return
    const DocsAPI = window.DocsAPI
    if (!DocsAPI || !DocsAPI.DocEditor) {
      setError('DocsAPI.DocEditor không khả dụng.')
      return
    }

    const placeholder = placeholderRef.current
    if (!placeholder) return

    initAttemptedRef.current = true
    const config = cleanEditorConfig(editorConfig)

    try {
      if (editorRef.current) {
        try { editorRef.current.destroyEditor() } catch (_) {}
        editorRef.current = null
      }
      while (placeholder.firstChild) {
        try { placeholder.removeChild(placeholder.firstChild) } catch (_) { break }
      }

      editorRef.current = new DocsAPI.DocEditor(EDITOR_PLACEHOLDER_ID, {
        ...config,
        events: {
          ...(config.events || {}),
          onAppReady: () => setEditorInited(true),
          onDocumentReady: () => setEditorInited(true),
          onError: (event) => {
            const data = event?.data
            const msg = typeof data === 'string'
              ? data
              : (data?.errorDescription || data?.message || 'Lỗi ONLYOFFICE')
            setError(String(msg))
          },
        },
      })
      setEditorInited(true)
    } catch (err) {
      initAttemptedRef.current = false
      setError('Lỗi khởi tạo ONLYOFFICE: ' + (err.message || String(err)))
    }
  }, [editorConfig])

  useEffect(() => {
    if (!isOpen || !scriptReady || !editorConfig) return
    if (editorInited || initAttemptedRef.current) return
    const timer = setTimeout(initEditor, 150)
    return () => { clearTimeout(timer) }
  }, [isOpen, scriptReady, editorConfig, initEditor, editorInited])

  // ── Cleanup on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      destroyEditor()
    }
  }, [destroyEditor])

  // ── Keyboard + scroll lock ─────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const showLoading = (loading || (!editorInited && !error)) && !error

  return (
    <div className="oov-overlay" onClick={onClose}>
      <div className="oov-container" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="oov-close-btn-floating" title="Đóng" type="button">
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
              <p style={{ whiteSpace: 'pre-wrap', maxWidth: '90%' }}>{error}</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button className="doc-btn doc-btn-secondary" onClick={onClose} type="button">Đóng</button>
              </div>
            </div>
          )}

          {/* Editor div LUÔN trong DOM — React không quản lý nội dung bên trong, OnlyOffice tự quản lý */}
          <div
            ref={placeholderRef}
            id={EDITOR_PLACEHOLDER_ID}
            className="oov-editor"
            style={{ display: error ? 'none' : 'block' }}
          />
        </div>
      </div>
    </div>
  )
}