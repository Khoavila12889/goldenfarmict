/**
 * FactoryPrinting.jsx - Trang In Công Thức Sản Xuất cho Nhà Máy
 *
 * - Click IN → fetch PDF blob → in trực tiếp bằng print-js (không preview)
 * - SSE Real-time
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Search, Printer, CheckCircle, AlertCircle, Loader2,
  FileText, Package, Bell, X
} from 'lucide-react'
import printJS from 'print-js'
import { apiUrl } from '../services/api'
import useFormulaSSE from '../hooks/useFormulaSSE'
import './FactoryPrinting.css'

export default function FactoryPrinting() {
  const [keyword, setKeyword] = useState('')
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newFlashIds, setNewFlashIds] = useState(new Set())
  const [toast, setToast] = useState(null)
  const [printingId, setPrintingId] = useState(null)

  const searchInputRef = useRef(null)
  const blobUrlRef = useRef(null)

  const userRole = sessionStorage.getItem('user_role') || ''
  const isAdmin = userRole === 'admin' || userRole === 'head'
  const _perms = (() => {
    try { return JSON.parse(sessionStorage.getItem('user_permissions') || '{}') } catch { return {} }
  })()
  const canPrint = isAdmin || !!(_perms['factory-printing'] || {}).can_view

  const [permsLoading, setPermsLoading] = useState(true)

  const getUserParams = useCallback(() => {
    const userCode = sessionStorage.getItem('user_code') || ''
    const userRole = sessionStorage.getItem('user_role') || ''
    const userDept = sessionStorage.getItem('user_department') || ''
    return { user_code: userCode, user_role: userRole, user_dept: userDept }
  }, [])

  const getAuthHeaders = useCallback(() => {
    const token = sessionStorage.getItem('token') || ''
    return { Authorization: `Bearer ${token}` }
  }, [])

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
      }
    }
  }, [])

  // ─── Fetch recipes ─────────────────────────────────────────
  const fetchRecipes = useCallback(async (searchKeyword = '') => {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const params = getUserParams()
      const queryParams = { ...params, keyword: searchKeyword.trim() }

      const queryString = new URLSearchParams(queryParams).toString()
      const response = await fetch(apiUrl(`/formulas/search?${queryString}`), {
        method: 'GET',
        headers: getAuthHeaders(),
      })

      if (!response.ok) {
        let detail = 'Lỗi khi lấy danh sách công thức'
        try { const errData = await response.json(); detail = errData.detail || detail } catch (_) { detail = `Lỗi server: ${response.status}` }
        throw new Error(detail)
      }

      const data = await response.json()
      const fetchedData = data.data || []
      setRecipes(fetchedData)

      if (fetchedData.length === 0 && searchKeyword.trim()) {
        setError(`Không tìm thấy công thức nào với từ khóa "${searchKeyword}"`)
      }
    } catch (err) {
      console.error('Fetch error:', err)
      setError(err.message || 'Không thể kết nối đến server')
      setRecipes([])
    } finally {
      setLoading(false)
    }
  }, [getUserParams, getAuthHeaders])

  // ─── SSE Real-time ─────────────────────────────────────────
  useFormulaSSE({
    onCreated: useCallback((data) => {
      if (keyword.trim() === '') {
        setRecipes((prev) => [data, ...prev])
        setNewFlashIds((prev) => new Set([...prev, data.id]))
        setTimeout(() => setNewFlashIds((prev) => { const n = new Set(prev); n.delete(data.id); return n }), 4000)
      }
      setToast({ type: 'info', message: `Công thức mới "${data.recipe_name}" vừa được upload!` })
      setTimeout(() => setToast(null), 5000)
    }, [keyword]),

    onDeleted: useCallback((data) => {
      setRecipes((prev) => prev.filter((r) => r.id !== data.id))
    }, []),

    onUpdated: useCallback((data) => {
      setRecipes((prev) => prev.map((r) => r.id === data.id ? { ...r, ...data } : r))
    }, []),
  })

  // ─── Effects ────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setPermsLoading(false)
      if (canPrint) fetchRecipes('')
    }, 300)
    return () => clearTimeout(timer)
  }, [canPrint]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Handlers ──────────────────────────────────────────────
  const handleSearch = (e) => {
    e.preventDefault()
    fetchRecipes(keyword)
  }

  const handleClearSearch = () => {
    setKeyword('')
    setError('')
    setSuccess('')
    fetchRecipes('')
    searchInputRef.current?.focus()
  }

  // In trực tiếp: fetch PDF blob → print-js (không preview)
  const handleDirectPrint = async (recipe) => {
    setPrintingId(recipe.id)
    setError('')
    setSuccess('')

    try {
      const userParams = getUserParams()
      const queryString = new URLSearchParams(userParams).toString()

      const response = await fetch(
        apiUrl(`/formulas/${recipe.id}/print-stream?${queryString}`),
        { method: 'GET', headers: getAuthHeaders() }
      )

      if (!response.ok) {
        let errorMsg = `Lỗi server (${response.status})`
        try {
          const errJson = await response.json()
          errorMsg = errJson.detail || errorMsg
        } catch (_) {}
        throw new Error(errorMsg)
      }

      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const errJson = await response.json()
        throw new Error(errJson.detail || 'Không tìm thấy file PDF')
      }

      const blob = await response.blob()
      if (blob.size === 0) throw new Error('File PDF rỗng')

      // Cleanup blob URL cũ
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
      }

      const blobUrl = URL.createObjectURL(blob)
      blobUrlRef.current = blobUrl

      printJS({
        printable: blobUrl,
        type: 'pdf',
        showModal: false,
        onLoadingEnd: () => {
          setTimeout(() => {
            if (blobUrlRef.current === blobUrl) {
              URL.revokeObjectURL(blobUrl)
              blobUrlRef.current = null
            }
          }, 500)
        },
        onPrintDialogClose: () => {
          setPrintingId(null)
          setSuccess(`Đã gửi lệnh in "${recipe.recipe_name}"`)
          setTimeout(() => setSuccess(''), 5000)
        },
        onError: (err) => {
          console.error('Print error:', err)
          if (blobUrlRef.current === blobUrl) {
            URL.revokeObjectURL(blobUrl)
            blobUrlRef.current = null
          }
          setPrintingId(null)
          setError('Lỗi khi in: ' + (err?.message || 'Không xác định'))
        }
      })
    } catch (err) {
      console.error('Direct print error:', err)
      setPrintingId(null)
      setError('Lỗi: ' + (err?.message || 'Không thể tải file PDF'))
    }
  }

  // ─── Render ─────────────────────────────────────────────────
  if (permsLoading) {
    return (
      <div className="factory-print-container">
        <div className="loading-state">
          <Loader2 className="spinning" size={32} />
          <p>Đang kiểm tra quyền truy cập...</p>
        </div>
      </div>
    )
  }

  if (!canPrint) {
    return (
      <div className="factory-print-container">
        <div className="access-denied">
          <AlertCircle size={48} />
          <h2>Không có quyền truy cập</h2>
          <p>Bạn chưa được cấp quyền in công thức. Liên hệ quản trị viên để được cấp quyền.</p>
        </div>
      </div>
    )
  }

  const isDefaultView = keyword.trim() === ''

  return (
    <div className="factory-print-container">
      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          <Bell size={18} />
          <span>{toast.message}</span>
          <button className="toast-close"><X size={16} /></button>
        </div>
      )}

      <div className="fp-header">
        <h1 className="simple-page-title">
          <Printer size={24} className="title-icon" />
          Công thức sản xuất
        </h1>
      </div>

      <div className="search-section">
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-input-group">
            <Search className="search-icon" size={20} />
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="Nhập mã hoặc tên công thức..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              disabled={loading}
              autoFocus
            />
            {keyword && (
              <button type="button" className="clear-btn" onClick={handleClearSearch} disabled={loading}>×</button>
            )}
          </div>
          <button type="submit" className="search-btn" disabled={loading}>
            {loading ? (
              <><Loader2 className="spinning" size={20} /> Đang tìm...</>
            ) : (
              <><Search size={20} /> Tìm kiếm</>
            )}
          </button>
        </form>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={20} /><span>{error}</span>
            <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
          </div>
        )}
        {success && (
          <div className="alert alert-success">
            <CheckCircle size={20} /><span>{success}</span>
          </div>
        )}
      </div>

      {recipes.length > 0 && (
        <div className="results-section">
          <div className="results-header">
            <h3>{isDefaultView ? '🔥 Công thức mới trong ngày' : 'Kết quả tìm kiếm'}</h3>
            <span className="results-count badge-count">{recipes.length} công thức</span>
          </div>

          <div className="recipe-grid">
            {recipes.map((item, index) => {
              const isPrinting = printingId === item.id
              const isNewFlash = newFlashIds.has(item.id)
              const showNewBadge = isDefaultView && index < 3

              return (
                <div key={item.id} className={`recipe-card ${isNewFlash ? 'flash-new' : ''}`}>
                  <div className="recipe-card-header">
                    <div className="recipe-icon">
                      <FileText size={24} />
                    </div>
                    <span className="recipe-badge">{item.recipe_code || 'N/A'}</span>
                  </div>

                  <div className="recipe-info">
                    <h3 className="recipe-name">
                      {item.recipe_name}
                      {showNewBadge && <span className="blinking-new-badge">MỚI</span>}
                    </h3>
                    <div className="recipe-meta">
                      {item.category && (
                        <span className="meta-item">
                          <Package size={14} /> {item.category}
                        </span>
                      )}
                      <span className="meta-item meta-version">
                        Phiên bản: <strong>{item.version || 'v1.0'}</strong>
                      </span>
                    </div>
                  </div>

                  <button
                    className={`btn-print ${isPrinting ? 'printing' : ''}`}
                    onClick={() => handleDirectPrint(item)}
                    disabled={isPrinting}
                  >
                    {isPrinting ? (
                      <><Loader2 className="spinning" size={20} /> Đang in...</>
                    ) : (
                      <><Printer size={20} /> IN CÔNG THỨC</>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {recipes.length === 0 && !loading && !error && (
        <div className="empty-state">
          <div className="empty-icon">
            <FileText size={48} />
          </div>
          <h3>Không có công thức</h3>
          <p>{keyword ? `Không tìm thấy kết quả nào cho từ khóa "${keyword}"` : "Chưa có công thức nào được tạo trong ngày hôm nay"}</p>
        </div>
      )}
    </div>
  )
}
