import { useEffect, useRef, useState, useCallback } from 'react'
import { getShareOnlyOfficeConfig } from '../services/api'

/**
 * Loads and mounts the ONLYOFFICE editor for a shared file.
 *
 * `filePath` / `fileId` are only required when the share is a folder
 * (they pin the exact file inside the shared folder).
 * The placeholder element with `placeholderId` must be mounted before
 * `enabled` becomes true.
 *
 * Initialization is deferred ~180ms so the host overlay's fade-in animation
 * finishes before ONLYOFFICE measures its container (initializing inside a
 * transformed/fixed container breaks the editor layout -> blank page).
 */
export function useShareOnlyOffice({ enabled, token, filePath = '', fileId = '', fileName = '', placeholderId, scriptId }) {
  const [config, setConfig] = useState(null)
  const [error, setError] = useState('')
  const [scriptReady, setScriptReady] = useState(false)
  const [ready, setReady] = useState(false)
  const editorRef = useRef(null)
  const initAttemptedRef = useRef(false)

  const destroyEditor = useCallback(() => {
    if (editorRef.current) {
      try { editorRef.current.destroyEditor() } catch (_) {}
      editorRef.current = null
    }
    initAttemptedRef.current = false
    setReady(false)
    const el = document.getElementById(placeholderId)
    if (el) el.innerHTML = ''
  }, [placeholderId])

  const reset = useCallback(() => {
    destroyEditor()
    setConfig(null)
    setError('')
    setScriptReady(false)
    setReady(false)
  }, [destroyEditor])

  useEffect(() => {
    if (!enabled || !token) {
      reset()
      return
    }
    destroyEditor()
    setError('')
    setConfig(null)
    setScriptReady(false)
    setReady(false)
    getShareOnlyOfficeConfig(token, { file_path: filePath, file_id: fileId, file_name: fileName })
      .then(r => setConfig(r.data))
      .catch(err => setError(err.response?.data?.detail || err.message || 'Không thể khởi tạo trình xem tài liệu'))
  }, [enabled, token, filePath, fileId, fileName, reset, destroyEditor])

  useEffect(() => {
    if (!config || error) return
    const apiUrl = config._docsApiUrl
    if (!apiUrl) {
      setError('Thiếu cấu hình DocsAPI URL')
      return
    }
    if (window.DocsAPI) {
      setScriptReady(true)
      return
    }
    const sid = scriptId || 'share-docsapi-script'
    const existing = document.getElementById(sid)
    if (existing) {
      existing.addEventListener('load', () => setScriptReady(true))
      existing.addEventListener('error', () => setError('Không thể tải ONLYOFFICE API'))
      return
    }
    const script = document.createElement('script')
    script.id = sid
    script.src = apiUrl
    script.async = true
    script.onload = () => setScriptReady(true)
    script.onerror = () => setError('Không thể tải ONLYOFFICE API')
    document.body.appendChild(script)
  }, [config, error, scriptId])

  useEffect(() => {
    if (!config || !scriptReady || error) return
    if (initAttemptedRef.current) return
    const DocsAPI = window.DocsAPI
    if (!DocsAPI || !DocsAPI.DocEditor) {
      setError('DocsAPI.DocEditor không khả dụng')
      return
    }
    // Wait for the host overlay's fade-in to finish before mounting the
    // editor (otherwise ONLYOFFICE can render a blank/white editor).
    const timer = setTimeout(() => {
      const placeholder = document.getElementById(placeholderId)
      if (!placeholder) {
        initAttemptedRef.current = false
        return
      }
      initAttemptedRef.current = true
      try {
        placeholder.innerHTML = ''
        const { _docsApiUrl, ...editorConfig } = config
        editorRef.current = new DocsAPI.DocEditor(placeholderId, {
          ...editorConfig,
          events: {
            ...(editorConfig.events || {}),
            onAppReady: () => setReady(true),
            onDocumentReady: () => setReady(true),
            onError: (event) => {
              const data = event?.data
              setError(typeof data === 'string' ? data : (data?.errorDescription || 'Lỗi ONLYOFFICE'))
            },
          },
        })
      } catch (err) {
        setError('Lỗi khởi tạo trình xem: ' + (err.message || String(err)))
      }
    }, 180)
    return () => clearTimeout(timer)
  }, [config, scriptReady, error, placeholderId])

  useEffect(() => {
    return () => destroyEditor()
  }, [destroyEditor])

  return { error, ready }
}
