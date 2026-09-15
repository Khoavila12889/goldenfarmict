import React, { useEffect, useState, useRef, useCallback } from 'react'
import { X, Loader2, AlertCircle } from 'lucide-react'
import { getOnlyOfficeConfig } from '../services/api'

const EDITOR_PLACEHOLDER_ID = 'onlyoffice-editor-placeholder'
const ERROR_OVERLAY_ID = 'onlyoffice-error-overlay'

function cleanEditorConfig(raw) {
  if (!raw || typeof raw !== 'object') return raw
  const { _docsApiUrl, ...config } = raw
  return config
}

// Quản lý error overlay bằng vanilla DOM — tránh React re-render đụng vào OnlyOffice iframe
function showErrorOverlay(msg) {
  let el = document.getElementById(ERROR_OVERLAY_ID)
  if (!el) {
    el = document.createElement('div')
    el.id = ERROR_OVERLAY_ID
    el.style.cssText = 'position:absolute;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.75rem;background:#fff'
    el.innerHTML = `<div id="${ERROR_OVERLAY_ID}-content" style="text-align:center"></div>`
    // Tìm oov-container để append
    const container = document.querySelector('.oov-container')
    if (container) container.appendChild(el)
  }
  el.style.display = 'flex'
  const content = document.getElementById(`${ERROR_OVERLAY_ID}-content`)
  if (content) {
    content.innerHTML = `<p style="color:#dc2626;font-size:0.9rem;white-space:pre-wrap;max-width:90%;margin:0 0 0.75rem">${msg}</p><button id="${ERROR_OVERLAY_ID}-close" style="padding:0.5rem 1.2rem;background:#0a5b35;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.85rem;font-weight:600">Đóng</button>`
    setTimeout(() => {
      const btn = document.getElementById(`${ERROR_OVERLAY_ID}-close`)
      if (btn) btn.onclick = hideErrorOverlay
    }, 0)
  }
}

function hideErrorOverlay() {
  const el = document.getElementById(ERROR_OVERLAY_ID)
  if (el) el.style.display = 'none'
}

export default function OnlyOfficeViewer({ file, configId, isOpen, onClose, getConfig }) {
  const [editorConfig, setEditorConfig] = useState(null)
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
    hideErrorOverlay()
  }, [])

  // Reset khi đóng / mở file mới
  useEffect(() => {
    if (!isOpen || !file || (!configId && !getConfig)) {
      destroyEditor()
      setEditorConfig(null)
      setLoading(false)
      setScriptReady(false)
      return
    }

    setLoading(true)
    setEditorConfig(null)
    setScriptReady(false)
    hideErrorOverlay()
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
        showErrorOverlay(typeof msg === 'string' ? msg : JSON.stringify(msg))
        setLoading(false)
      })
  }, [isOpen, file, configId, getConfig, destroyEditor, userCode, userRole])

  // Load DocsAPI script
  useEffect(() => {
    if (!editorConfig || !isOpen) return
    const apiUrl = editorConfig._docsApiUrl
    if (!apiUrl) {
      showErrorOverlay('Thiếu cấu hình DocsAPI URL (_docsApiUrl)')
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
      const onError = () => showErrorOverlay('Không thể tải ONLYOFFICE API. URL: ' + existing.src)
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
    script.onerror = () => showErrorOverlay('Không thể tải ONLYOFFICE API. URL: ' + apiUrl)
    document.body.appendChild(script)
  }, [editorConfig, isOpen])

  // Initialize editor
  const initEditor = useCallback(() => {
    if (!editorConfig || initAttemptedRef.current) return
    const DocsAPI = window.DocsAPI
    if (!DocsAPI || !DocsAPI.DocEditor) {
      showErrorOverlay('DocsAPI.DocEditor không khả dụng.')
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
          // Dùng vanilla DOM cho error — KHÔNG setState để tránh React re-render
          onError: (event) => {
            const data = event?.data
            const msg = typeof data === 'string'
              ? data
              : (data?.errorDescription || data?.message || 'Lỗi ONLYOFFICE')
            showErrorOverlay(String(msg))
          },
        },
      })
      setEditorInited(true)
    } catch (err) {
      initAttemptedRef.current = false
      showErrorOverlay('Lỗi khởi tạo ONLYOFFICE: ' + (err.message || String(err)))
    }
  }, [editorConfig])

  useEffect(() => {
    if (!isOpen || !scriptReady || !editorConfig) return
    if (editorInited || initAttemptedRef.current) return
    const timer = setTimeout(initEditor, 150)
    return () => { clearTimeout(timer) }
  }, [isOpen, scriptReady, editorConfig, initEditor, editorInited])

  // Cleanup on unmount
  useEffect(() => {
    return () => { destroyEditor() }
  }, [destroyEditor])

  // Keyboard + scroll lock
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

  const showLoading = loading || (!editorInited && !editorRef.current)

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

          <div
            ref={placeholderRef}
            id={EDITOR_PLACEHOLDER_ID}
            className="oov-editor"
          />
        </div>
      </div>
    </div>
  )
}