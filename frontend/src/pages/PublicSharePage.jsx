import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Download, Loader2, AlertCircle, Lock, FileText } from 'lucide-react'
import { getShareInfo, getShareOnlyOfficeConfig, getShareDownloadUrl } from '../services/api'
import SharedFolder from '../components/SharedFolder'
import './PublicSharePage.css'

const OFFICE_EXTS = new Set(['docx','xlsx','pptx','doc','xls','ppt','odt','ods','odp','csv','txt','rtf','pdf'])
const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','svg','bmp','ico'])

const EDITOR_PLACEHOLDER_ID = 'share-editor-placeholder'

function getExt(name) {
  return name.split('.').pop().toLowerCase()
}

export default function PublicSharePage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [needLogin, setNeedLogin] = useState(false)

  const [editorConfig, setEditorConfig] = useState(null)
  const [editorError, setEditorError] = useState('')
  const [scriptReady, setScriptReady] = useState(false)
  const editorRef = useRef(null)
  const initAttemptedRef = useRef(false)

  const downloadUrl = token ? getShareDownloadUrl(token) : ''

  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || 'user'
  const isLoggedIn = !!sessionStorage.getItem('token')

  useEffect(() => {
    if (!token) {
      setError('Thiếu mã chia sẻ')
      setLoading(false)
      return
    }
    setLoading(true)
    getShareInfo(token)
      .then(r => {
        const d = r.data?.data
        setInfo(d)
        if (d?.expired) setError('Link chia sẻ này đã hết hạn.')
      })
      .catch(err => {
        const detail = err.response?.data?.detail
        if (typeof detail === 'string' && /đăng nhập/i.test(detail)) {
          setNeedLogin(true)
        }
        setError(detail || err.message || 'Không thể truy cập link chia sẻ')
      })
      .finally(() => setLoading(false))
  }, [token])

  // ─── OnlyOffice loading for office files ───
  useEffect(() => {
    if (!info || error || needLogin) return
    const ext = getExt(info.file_name || '')
    if (!OFFICE_EXTS.has(ext)) return

    setEditorError('')
    getShareOnlyOfficeConfig(token)
      .then(r => setEditorConfig(r.data))
      .catch(err => setEditorError(err.response?.data?.detail || err.message || 'Không thể khởi tạo trình xem tài liệu'))
  }, [info, error, needLogin, token])

  useEffect(() => {
    if (!editorConfig || error) return
    const apiUrl = editorConfig._docsApiUrl
    if (!apiUrl) {
      setEditorError('Thiếu cấu hình DocsAPI URL')
      return
    }
    const load = () => {
      const existing = document.getElementById('share-docsapi-script')
      if (existing) {
        if (window.DocsAPI) { setScriptReady(true); return }
        existing.addEventListener('load', () => setScriptReady(true))
        existing.addEventListener('error', () => setEditorError('Không thể tải ONLYOFFICE API'))
        return
      }
      const script = document.createElement('script')
      script.id = 'share-docsapi-script'
      script.src = apiUrl
      script.async = true
      script.onload = () => setScriptReady(true)
      script.onerror = () => setEditorError('Không thể tải ONLYOFFICE API')
      document.body.appendChild(script)
    }
    if (window.DocsAPI) { setScriptReady(true); return }
    load()
  }, [editorConfig, error])

  useEffect(() => {
    if (!editorConfig || !scriptReady || error) return
    if (initAttemptedRef.current) return
    initAttemptedRef.current = true
    const DocsAPI = window.DocsAPI
    if (!DocsAPI || !DocsAPI.DocEditor) {
      setEditorError('DocsAPI.DocEditor không khả dụng')
      return
    }
    const placeholder = document.getElementById(EDITOR_PLACEHOLDER_ID)
    if (!placeholder) return
    try {
      placeholder.innerHTML = ''
      const { _docsApiUrl, ...config } = editorConfig
      editorRef.current = new DocsAPI.DocEditor(EDITOR_PLACEHOLDER_ID, {
        ...config,
        events: {
          ...(config.events || {}),
          onError: (event) => {
            const data = event?.data
            setEditorError(typeof data === 'string' ? data : (data?.errorDescription || 'Lỗi ONLYOFFICE'))
          },
        },
      })
    } catch (err) {
      setEditorError('Lỗi khởi tạo trình xem: ' + (err.message || String(err)))
    }
  }, [editorConfig, scriptReady, error])

  useEffect(() => {
    return () => {
      if (editorRef.current) {
        try { editorRef.current.destroyEditor() } catch (_) {}
        editorRef.current = null
      }
      const el = document.getElementById(EDITOR_PLACEHOLDER_ID)
      if (el) el.innerHTML = ''
      const s = document.getElementById('share-docsapi-script')
      if (s) s.remove()
    }
  }, [])

  const fileExt = info ? getExt(info.file_name || '') : ''
  const isOffice = OFFICE_EXTS.has(fileExt)
  const isImage = IMAGE_EXTS.has(fileExt)
  const isPdf = fileExt === 'pdf'

  const renderBody = () => {
    if (isOffice) {
      return (
        <div className="psp-editor-wrap">
          {editorError && (
            <div className="psp-error">
              <AlertCircle size={18} /> {editorError}
            </div>
          )}
          <div id={EDITOR_PLACEHOLDER_ID} className="psp-editor" style={{ visibility: editorError ? 'hidden' : 'visible' }} />
        </div>
      )
    }
    if (isImage) {
      return (
        <div className="psp-file-body">
          <img src={downloadUrl} alt={info.file_name} className="psp-image" />
        </div>
      )
    }
    if (isPdf) {
      return (
        <div className="psp-file-body">
          <object data={downloadUrl} type="application/pdf" className="psp-pdf">
            <p>Trình duyệt không hỗ trợ xem PDF. <a href={downloadUrl} target="_blank" rel="noopener noreferrer">Nhấn để tải xuống</a>.</p>
          </object>
        </div>
      )
    }
    // Unknown type -> download card
    return (
      <div className="psp-file-body psp-unknown">
        <FileText size={40} />
        <p className="psp-unknown-title">{info.file_name}</p>
        <p className="psp-unknown-desc">Loại tệp này không thể xem trực tuyến.</p>
        <a className="psp-btn psp-btn-primary" href={downloadUrl} download>
          <Download size={15} /> Tải xuống
        </a>
      </div>
    )
  }

  return (
    <div className="psp-wrap">
      <header className="psp-header">
        <div className="psp-brand">GOLDENFARM <span>ICT</span></div>
        {isLoggedIn && (
          <button className="psp-btn psp-btn-ghost" onClick={() => navigate('/documents')}>← Về tài liệu</button>
        )}
      </header>

      <main className={`psp-main${isOffice ? ' psp-main-editor' : ''}`}>
        {loading && (
          <div className="psp-state">
            <Loader2 size={32} className="psp-spin" />
            <p>Đang tải tài liệu...</p>
          </div>
        )}

        {needLogin && !loading && (
          <div className="psp-state">
            <Lock size={34} />
            <p>Chia sẻ này chỉ dành cho nhân viên nội bộ.</p>
            <button className="psp-btn psp-btn-primary" onClick={() => navigate('/login')}>Đăng nhập</button>
          </div>
        )}

        {error && !needLogin && !loading && (
          <div className="psp-state">
            <AlertCircle size={34} />
            <p>{error}</p>
          </div>
        )}

        {info && !error && !needLogin && !loading && (
          info.item_type === 'folder' ? (
            <SharedFolder token={token} info={info} />
          ) : (
            <>
              {renderBody()}
            </>
          )
        )}
      </main>

      <footer className="psp-footer">
        Được cung cấp bởi GOLDENFARM ICT Document System
      </footer>
    </div>
  )
}
