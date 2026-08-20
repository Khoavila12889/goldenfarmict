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

  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || 'user'

  const destroyEditor = useCallback(() => {
    if (editorRef.current) {
      try { editorRef.current.destroyEditor() } catch (_) {}
      editorRef.current = null
    }
    const el = document.getElementById(EDITOR_PLACEHOLDER_ID)
    if (el) el.innerHTML = ''
    initAttemptedRef.current = false
    setEditorInited(false)
  }, [])

  useEffect(() => {
    if (!isOpen || !file || (!configId && !getConfig)) {
      destroyEditor()
      setEditorConfig(null)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    setEditorConfig(null)
    if (window.DocsAPI) {
      setScriptReady(true)
    }
    destroyEditor()

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

  useEffect(() => {
    if (!editorConfig || !isOpen) return
    const apiUrl = editorConfig._docsApiUrl
    if (!apiUrl) {
      setError('Thiếu cấu hình DocsAPI URL (_docsApiUrl)')
      return
    }

    if (window.DocsAPI) {
      const existing = document.getElementById('oo-docsapi-script')
      if (!existing) {
        const script = document.createElement('script')
        script.id = 'oo-docsapi-script'
        script.src = apiUrl
        document.body.appendChild(script)
      }
      setScriptReady(true)
      return
    }

    const existing = document.getElementById('oo-docsapi-script')
    if (existing) {
      if (window.DocsAPI) {
        setScriptReady(true)
        return
      }
      const onLoad = () => setScriptReady(true)
      const onError = () => setError(`Không thể tải ONLYOFFICE API từ máy chủ. Vui lòng kiểm tra: ${existing.src}`)
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
    script.onerror = () => setError(`Không thể tải ONLYOFFICE API từ máy chủ. Vui lòng kiểm tra: ${apiUrl}`)
    document.body.appendChild(script)
  }, [editorConfig, isOpen])

  const initEditor = useCallback(() => {
    if (!editorConfig || initAttemptedRef.current) return
    const DocsAPI = window.DocsAPI
    if (!DocsAPI || !DocsAPI.DocEditor) {
      setError('DocsAPI.DocEditor không khả dụng. Kiểm tra ONLYOFFICE Document Server.')
      return
    }

    const placeholder = document.getElementById(EDITOR_PLACEHOLDER_ID)
    if (!placeholder) return

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
          onAppReady: () => setEditorInited(true),
          onDocumentReady: () => setEditorInited(true),
          onError: (event) => {
            const data = event?.data
            const msg = typeof data === 'string'
              ? data
              : (data?.errorDescription || data?.message || 'Lỗi ONLYOFFICE khi mở tài liệu')
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

  if (!isOpen) return null

  const showLoading = (loading || (!editorInited && !error)) && !error

  return (
    <div className="oov-overlay" onClick={onClose}>
      <div className="oov-container" onClick={e => e.stopPropagation()}>
        
        {/* Nút Đóng lơ lửng góc phải đè lên giao diện ONLYOFFICE */}
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
            <div className="oov-error oov-overlay-state">
              <AlertCircle size={32} />
              <p>{error}</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
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