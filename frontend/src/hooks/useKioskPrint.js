/**
 * useKioskPrint.js - Print hook with Kiosk printing support
 *
 * Tải PDF Blob từ backend và in trực tiếp qua print-js.
 * Không hiển thị Print Preview.
 *
 * KIOSK PRINTING SETUP:
 * ──────────────────────────────────────────────────────────────
 * Để in tự động ra máy in mặc định KHÔNG cần chọn, khởi động
 * Chrome/Edge với flag:
 *
 *   chrome --app="URL_APP" --kiosk-printing
 *
 * hoặc trên Windows:
 *   "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
 *     --app="http://localhost:3000" --kiosk-printing
 *
 * Khi kiosk-printing enabled, dialog in sẽ bị ẩn hoàn toàn
 * và lệnh in gửi thẳng ra máy in mặc định (system default printer).
 *
 * QZ TRAY (optional):
 * ──────────────────────────────────────────────────────────────
 * Nếu hệ thống cài QZ Tray (https://qz.io), có thể dùng QZ API
 * để enumeratre printers và chọn máy in cụ thể.
 * Trigger 'qz-ready' event trên window để detect QZ availability.
 * ──────────────────────────────────────────────────────────────
 */
import { useState, useCallback, useRef } from 'react'
import printJS from 'print-js'
import { apiUrl } from '../services/api'

export default function useKioskPrint() {
  const [printing, setPrinting] = useState(false)
  const [lastPrintedId, setLastPrintedId] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [printers, setPrinters] = useState([])
  const [selectedPrinter, setSelectedPrinter] = useState('')
  const [hasQZ, setHasQZ] = useState(false)
  const blobUrlRef = useRef(null)

  // Detect QZ Tray availability
  const detectQZ = useCallback(() => {
    if (typeof window !== 'undefined' && window.qz) {
      setHasQZ(true)
      window.qz.printers().then((list) => {
        setPrinters(list || [])
        if (list?.length && !selectedPrinter) {
          setSelectedPrinter(list[0])
        }
      }).catch(() => {})
    }
  }, [selectedPrinter])

  // Cleanup blob URL on unmount
  const cleanupBlob = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [])

  /**
   * @param {object}  recipe       - { id, recipe_name }
   * @param {object}  userParams   - { user_code, user_role, user_dept }
   * @param {string}  authToken    - Bearer token
   * @param {string}  [printerName] - Optional: printer name for QZ Tray
   */
  const print = useCallback(async (recipe, userParams, authToken, printerName) => {
    setPrinting(true)
    setError('')
    setSuccess('')
    cleanupBlob()

    try {
      const queryString = new URLSearchParams(userParams).toString()
      const response = await fetch(
        apiUrl(`/formulas/${recipe.id}/print-stream?${queryString}`),
        { method: 'GET', headers: { Authorization: `Bearer ${authToken}` } }
      )

      if (!response.ok) {
        throw new Error('Không thể lấy file in từ máy chủ')
      }

      const blob = await response.blob()
      if (blob.size === 0) throw new Error('File PDF rỗng')

      const blobUrl = URL.createObjectURL(blob)
      blobUrlRef.current = blobUrl

      // Check if QZ Tray is available and printer is specified
      if (printerName && window.qz) {
        try {
          const config = window.qz.configs({ printer: printerName })
          const data = await window.qz.blobs(config, blob)
          // QZ Tray handles print natively — no preview
          cleanupBlob()
          setPrinting(false)
          setLastPrintedId(recipe.id)
          setSuccess(`Đã in "${recipe.recipe_name}" qua QZ Tray`)
          setTimeout(() => setSuccess(''), 5000)
          return
        } catch (qzErr) {
          console.warn('QZ Tray error, falling back to print-js:', qzErr)
        }
      }

      // Fallback: print-js (works with --kiosk-printing flag)
      printJS({
        printable: blobUrl,
        type: 'pdf',
        showModal: false,
        onLoadingEnd: () => {
          // Release blob memory aggressively
          setTimeout(() => cleanupBlob(), 200)
        },
        onPrintDialogClose: () => {
          setPrinting(false)
          setLastPrintedId(recipe.id)
          setSuccess(`Đã gửi lệnh in "${recipe.recipe_name}"`)
          setTimeout(() => setSuccess(''), 5000)
        },
        onError: (err) => {
          cleanupBlob()
          setPrinting(false)
          setError('Lỗi khi in: ' + (err?.message || 'Không xác định'))
        }
      })
    } catch (err) {
      cleanupBlob()
      setPrinting(false)
      setError('Lỗi: ' + (err?.message || 'Không thể kết nối server'))
    }
  }, [cleanupBlob])

  return {
    printing,
    lastPrintedId,
    error,
    success,
    printers,
    selectedPrinter,
    setSelectedPrinter,
    hasQZ,
    detectQZ,
    print,
    clearError: () => setError(''),
    clearSuccess: () => setSuccess(''),
  }
}
