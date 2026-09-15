import React, { useEffect, useState, useRef, useCallback } from 'react'
import { X, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { getOnlyOfficeConfig } from '../services/api'

const EDITOR_SLOT_ID = 'onlyoffice-editor-placeholder'
const INIT_TIMEOUT_MS = 25000
const SIZE_RETRY_MS = 200

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
  // React chỉ quản lý `.oov-editor` (hostRef). DocsAPI thay thế node con bằng
  // <iframe>, nên node con phải do ta tự tạo — nếu để React quản lý nó sẽ crash
  // "removeChild" lúc unmount.
  const hostRef = useRef(null)
  const editorRef = useRef(null)
  const initAttemptedRef = useRef(false)
  const initTimerRef = useRef(null)
  const initedRef = useRef(false)

  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || 'user'

  const clearTimers = useCallback(() => {
    if (initTimerRef.current) { clearTimeout(initTimerRef.current); initTimerRef.current = null }
  }, [])

  const destroyEditor = useCallback(() => {
    clearTimers()
    if (editorRef.current) {
      try { editorRef.current.destroyEditor() } catch (_) {}
      editorRef.current = null
    }
    if (hostRef.current) hostRef.current.innerHTML = ''
    initAttemptedRef.current = false
    initedRef.current = false
    setEditorInited(false)
  }, [clearTimers])

  const buildConfigRequest = useCallback(() => {
    if (getConfig) return getConfig()
    const currentPath = file?.browsePath || '/'
    const normalizedPath = currentPath === '/'
      ? file.name
      : `${currentPath.replace(/\/$/, '')}/${file.name}`
    return getOnlyOfficeConfig(configId, normalizedPath, userCode, userRole, file?.id)
  }, [getConfig, file, configId, userCode, userRole])

  const loadConfig = useCallback(() => {
    setLoading(true)
    setError(null)
    setEditorConfig(null)
    setScriptReady(false)
    destroyEditor()

    if (window.DocsAPI && window.DocsAPI.DocEditor) setScriptReady(true)

    buildConfigRequest()
      .then(r => {
        setEditorConfig(r.data)
        setLoading(false)
      })
      .catch(err => {
        const msg = err.response?.data?.detail || err.message || 'Không thể khởi tạo ONLYOFFICE'
        setError(typeof msg === 'string' ? msg : JSON.stringify(msg))
        setLoading(false)
      })
  }, [buildConfigRequest, destroyEditor])

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
    loadConfig()
  }, [isOpen, file, configId, getConfig, destroyEditor, loadConfig])

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

    let script = document.getElementById('oo-docsapi-script')
    if (!script) {
      script = document.createElement('script')
      script.id = 'oo-docsapi-script'
      script.src = apiUrl
      script.async = true
      document.body.appendChild(script)
    }

    const onLoad = () => {
      if (window.DocsAPI && window.DocsAPI.DocEditor) setScriptReady(true)
      else setError(`ONLYOFFICE API đã tải nhưng DocsAPI.DocEditor không khả dụng.\nURL: ${apiUrl}`)
    }
    const onError = () => setError(
      `Không thể tải ONLYOFFICE API. Vui lòng kiểm tra kết nối mạng và thử lại.\nURL: ${apiUrl}`
    )

    script.addEventListener('load', onLoad)
    script.addEventListener('error', onError)
    return () => {
      script.removeEventListener('load', onLoad)
      script.removeEventListener('error', onError)
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

    const host = hostRef.current
    if (!host) return

    // Chờ host có kích thước thật — overlay đang animate nên có thể là 0x0,
    // khởi tạo lúc đó sẽ ra trang trắng.
    const rect = host.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      clearTimers()
      initTimerRef.current = setTimeout(initEditor, SIZE_RETRY_MS)
      return
    }

    initAttemptedRef.current = true
    host.innerHTML = ''
    const slot = document.createElement('div')
    slot.id = EDITOR_SLOT_ID
    slot.style.width = '100%'
    slot.style.height = '100%'
    host.appendChild(slot)

    const config = cleanEditorConfig(editorConfig)

    try {
      editorRef.current = new DocsAPI.DocEditor(EDITOR_SLOT_ID, {
        ...config,
        events: {
          ...(config.events || {}),
          onAppReady: () => {
            clearTimers()
            initedRef.current = true
            setEditorInited(true)
          },
          onDocumentReady: () => {
            clearTimers()
            initedRef.current = true
            setEditorInited(true)
          },
          onError: (event) => {
            clearTimers()
            const data = event?.data
            const code = data?.errorCode
            const msg = typeof data === 'string'
              ? data
              : (data?.errorDescription || data?.message || 'Lỗi ONLYOFFICE khi mở tài liệu')
            setError(code ? `[Mã lỗi ${code}] ${msg}` : String(msg))
          },
          onRequestClose: () => onClose(),
        },
      })

      // Nếu editor không bao giờ báo ready (DS không tải được file, iframe chết)
      // thì phải hiện lỗi thay vì để người dùng nhìn trang trắng.
      clearTimers()
      initTimerRef.current = setTimeout(() => {
        if (!initedRef.current) {
          setError('Không thể khởi tạo trình soạn thảo ONLYOFFICE. Kiểm tra Document Server hoặc tải file xuống để xem.')
        }
      }, INIT_TIMEOUT_MS)
    } catch (err) {
      initAttemptedRef.current = false
      host.innerHTML = ''
      setError('Lỗi khởi tạo ONLYOFFICE: ' + (err.message || String(err)))
    }
  }, [editorConfig, clearTimers, onClose])

  useEffect(() => {
    if (!isOpen || !scriptReady || !editorConfig) return
    if (editorInited || initAttemptedRef.current) return
    const timer = setTimeout(initEditor, 150)
    return () => clearTimeout(timer)
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

  useEffect(() => destroyEditor, [destroyEditor])

  if (!isOpen) return null

  const showLoading = !error && (loading || !editorInited)

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
                  onClick={loadConfig}
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
            ref={hostRef}
            className="oov-editor"
            style={{
              visibility: error || showLoading ? 'hidden' : 'visible',
              width: '100%',
              height: '100%',
            }}
          />
        </div>
      </div>
    </div>
  )
}
