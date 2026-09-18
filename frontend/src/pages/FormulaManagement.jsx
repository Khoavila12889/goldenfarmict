/**
 * FormulaManagement.jsx - Quản lý Công Thức Sản Xuất (Văn phòng)
 *
 * CHỨC NĂNG:
 * - Upload công thức Excel (.xlsx/.xls/.pdf) mới
 * - Xem danh sách công thức đầy đủ (sorted by ngày tạo mới nhất)
 * - Sửa/Xóa công thức
 * - Xem lịch sử in / Thống kê
 * - SSE Real-time: tự động nhận event khi có công thức mới/đã xóa/đã cập nhật
 *
 * QUYỀN HẠN (dựa trên module "formula-management"):
 * - can_view: Xem danh sách, lịch sử in, thống kê
 * - can_edit: Upload mới, chỉnh sửa, kích hoạt/vô hiệu hóa
 * - admin/head role: Tất cả chức năng + Xóa công thức
 */

import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  Upload, FileSpreadsheet, Search, Plus, Trash2, Eye,
  History, BarChart3, RefreshCw, X, AlertCircle,
  CheckCircle, Loader2, Package, Printer,
  TrendingUp, FileText, Clock, Calendar
} from 'lucide-react'
import { apiUrl } from '../services/api'
import useFormulaSSE from '../hooks/useFormulaSSE'
import './FormulaManagement.css'

export default function FormulaManagement() {
  const [recipes, setRecipes] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showLogsModal, setShowLogsModal] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [printLogs, setPrintLogs] = useState([])

  const [filters, setFilters] = useState({
    keyword: '',
    date_from: '',
    date_to: '',
    is_active: 'true' // Đặt dạng chuỗi để truyền URL clean hơn
  })

  const getUserParams = () => {
    const userCode = sessionStorage.getItem('user_code') || ''
    const userRole = sessionStorage.getItem('user_role') || ''
    const userDept = sessionStorage.getItem('user_department') || ''
    const token = sessionStorage.getItem('token') || ''
    return { user_code: userCode, user_role: userRole, user_dept: userDept, token }
  }

  const currentUser = getUserParams()
  const isAdmin = currentUser.user_role === 'admin' || currentUser.user_role === 'head'
  const _perms = (() => {
    try { return JSON.parse(sessionStorage.getItem('user_permissions') || '{}') } catch { return {} }
  })()
  const canViewFormulas = isAdmin || !!(_perms['formula-management'] || {}).can_view
  const canEditFormulas = isAdmin || !!(_perms['formula-management'] || {}).can_edit

  const [permsLoading, setPermsLoading] = useState(true)

  // ─── Tải danh sách công thức (Đã sửa lỗi build query & parse response) ───
  const loadRecipes = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const userParams = getUserParams()
      
      // Chỉ đóng gói các params có giá trị hợp lệ
      const queryObj = { ...userParams }

      if (filters.keyword.trim()) queryObj.keyword = filters.keyword.trim()
      if (filters.date_from) queryObj.date_from = filters.date_from
      if (filters.date_to) queryObj.date_to = filters.date_to
      if (filters.is_active !== 'all') queryObj.is_active = filters.is_active

      // Lọc bỏ key rỗng/null/undefined
      Object.keys(queryObj).forEach((key) => {
        if (queryObj[key] === '' || queryObj[key] === null || queryObj[key] === undefined) {
          delete queryObj[key]
        }
      })

      const queryString = new URLSearchParams(queryObj).toString()
      const response = await fetch(apiUrl(`/formulas/list?${queryString}`))
      
      if (!response.ok) {
        let detail = 'Không thể tải danh sách công thức'
        try {
          const errData = await response.json()
          detail = errData.detail || errData.message || detail
        } catch (_) {}
        throw new Error(detail)
      }

      const data = await response.json()
      // Nhận linh hoạt mảng trực tiếp hoặc data.data
      const list = Array.isArray(data) ? data : (data.data || [])
      setRecipes(list)
    } catch (err) {
      console.error('Error loading recipes:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filters])

  const loadStats = useCallback(async () => {
    try {
      const params = getUserParams()
      const queryString = new URLSearchParams(params).toString()
      const response = await fetch(apiUrl(`/formulas/stats?${queryString}`))
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (err) {
      console.error('Error loading stats:', err)
    }
  }, [])

  const loadPrintLogs = async (recipeId) => {
    try {
      const params = getUserParams()
      const queryString = new URLSearchParams(params).toString()
      const response = await fetch(apiUrl(`/formulas/${recipeId}/print-logs?${queryString}`))
      if (!response.ok) throw new Error('Không thể tải lịch sử in')
      const data = await response.json()
      setPrintLogs(data.logs || [])
      setSelectedRecipe(data.recipe)
      setShowLogsModal(true)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (recipe) => {
    if (!isAdmin) { setError('Chỉ Admin mới có quyền xóa công thức'); return }
    if (!confirm(`Xác nhận xóa công thức "${recipe.recipe_name}"?\n\nThao tác này không thể hoàn tác!`)) return
    try {
      const params = getUserParams()
      const queryString = new URLSearchParams(params).toString()
      const response = await fetch(apiUrl(`/formulas/${recipe.id}?${queryString}`), { method: 'DELETE' })
      if (!response.ok) {
        let detail = 'Lỗi khi xóa công thức'
        try { const errData = await response.json(); detail = errData.detail || detail } catch (_) {}
        throw new Error(detail)
      }
      setSuccess(`Đã xóa công thức "${recipe.recipe_name}"`)
      loadRecipes()
      loadStats()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleToggleActive = async (recipe) => {
    try {
      const params = getUserParams()
      const formData = new FormData()
      formData.append('is_active', !recipe.is_active)
      const queryString = new URLSearchParams(params).toString()
      const response = await fetch(apiUrl(`/formulas/${recipe.id}?${queryString}`), { method: 'PUT', body: formData })
      if (!response.ok) throw new Error('Không thể cập nhật trạng thái')
      setSuccess(`Đã ${recipe.is_active ? 'vô hiệu hóa' : 'kích hoạt'} công thức`)
      loadRecipes()
    } catch (err) {
      setError(err.message)
    }
  }

  // ─── SSE Real-time ────────────────────────────────────────────
  useFormulaSSE({
    onCreated: (data) => {
      setRecipes((prev) => [data, ...prev])
      setSuccess(`Công thức mới "${data.recipe_name}" vừa được upload!`)
      setTimeout(() => setSuccess(''), 5000)
      loadStats()
    },
    onDeleted: (data) => {
      setRecipes((prev) => prev.filter((r) => r.id !== data.id))
      loadStats()
    },
    onUpdated: (data) => {
      setRecipes((prev) => prev.map((r) => r.id === data.id ? { ...r, ...data } : r))
      loadStats()
    }
  })

  useEffect(() => {
    const timer = setTimeout(() => setPermsLoading(false), 300)
    if (canViewFormulas) {
      loadStats()
    }
    return () => clearTimeout(timer)
  }, [canViewFormulas, loadStats])

  useEffect(() => {
    if (canViewFormulas) {
      loadRecipes()
    }
  }, [canViewFormulas, loadRecipes])

  if (permsLoading) {
    return (
      <div className="formula-management">
        <div className="loading-state">
          <Loader2 className="spinning" size={32} />
          <p>Đang kiểm tra quyền truy cập...</p>
        </div>
      </div>
    )
  }

  if (!canViewFormulas) {
    return (
      <div className="formula-management">
        <div className="access-denied">
          <AlertCircle size={48} />
          <h2>Không có quyền truy cập</h2>
          <p>Bạn chưa được cấp quyền xem module Công thức / In ấn. Liên hệ quản trị viên để được cấp quyền.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="formula-management">
      {/* Header */}
      <div className="fm-header">
        <div className="fm-header-content">
          <div>
            <h1>📋 Quản lý Công Thức Sản Xuất</h1>
            <p className="fm-subtitle">Văn phòng - Upload và quản lý công thức</p>
          </div>
          <div className="fm-header-actions">
            <button className="btn-stats" onClick={() => setShowStatsModal(true)}>
              <BarChart3 size={18} /> Thống kê
            </button>
            {canEditFormulas && (
              <button className="btn-primary" onClick={() => setShowUploadModal(true)}>
                <Plus size={18} /> Upload công thức mới
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="stats-overview">
          <div className="stat-card">
            <div className="stat-icon stat-icon-blue"><FileText size={24} /></div>
            <div className="stat-content">
              <div className="stat-label">Tổng công thức</div>
              <div className="stat-value">{stats.total_recipes}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon-green"><CheckCircle size={24} /></div>
            <div className="stat-content">
              <div className="stat-label">Đang hoạt động</div>
              <div className="stat-value">{stats.active_recipes}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon-orange"><Printer size={24} /></div>
            <div className="stat-content">
              <div className="stat-label">Lượt in tháng này</div>
              <div className="stat-value">{stats.prints_this_month}</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters — Horizontal row */}
      <div className="fm-filters">
        <div className="filter-group filter-keyword">
          <Search size={16} className="filter-icon" />
          <input
            type="text"
            placeholder="Tìm theo mã hoặc tên..."
            value={filters.keyword}
            onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
          />
        </div>
        <div className="filter-group filter-date">
          <Calendar size={16} className="filter-icon" />
          <input
            type="date"
            title="Từ ngày"
            value={filters.date_from}
            onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
          />
        </div>
        <div className="filter-group filter-date">
          <Calendar size={16} className="filter-icon" />
          <input
            type="date"
            title="Đến ngày"
            value={filters.date_to}
            onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
          />
        </div>
        <select
          value={filters.is_active}
          onChange={(e) => setFilters({ ...filters, is_active: e.target.value })}
          className="filter-select"
        >
          <option value="true">Đang hoạt động</option>
          <option value="false">Đã vô hiệu hóa</option>
          <option value="all">Tất cả</option>
        </select>
        <button className="btn-filter" onClick={loadRecipes}>
          <RefreshCw size={16} /> Làm mới
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="alert alert-error">
          <AlertCircle size={20} /><span>{error}</span>
          <button onClick={() => setError('')}>×</button>
        </div>
      )}
      {success && (
        <div className="alert alert-success">
          <CheckCircle size={20} /><span>{success}</span>
          <button onClick={() => setSuccess('')}>×</button>
        </div>
      )}

      {/* Recipe List */}
      <div className="recipe-list">
        {loading ? (
          <div className="loading-state">
            <Loader2 className="spinning" size={32} /><p>Đang tải...</p>
          </div>
        ) : recipes.length === 0 ? (
          <div className="empty-state">
            <FileSpreadsheet size={48} />
            <h3>Chưa có công thức nào</h3>
            <p>Bấm "Upload công thức mới" để thêm công thức đầu tiên</p>
          </div>
        ) : (
          <div className="recipe-table">
            <table>
              <thead>
                <tr>
                  <th>Mã công thức</th>
                  <th>Tên công thức</th>
                  <th>Dòng sản phẩm</th>
                  <th>Phiên bản</th>
                  <th>Trạng thái</th>
                  <th>Người tạo</th>
                  <th>Ngày tạo</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((recipe) => (
                  <tr key={recipe.id} className={!recipe.is_active ? 'inactive-row' : ''}>
                    <td><span className="recipe-code-badge">{recipe.recipe_code}</span></td>
                    <td className="recipe-name-col">{recipe.recipe_name}</td>
                    <td>
                      {recipe.category && (
                        <span className="category-tag"><Package size={14} />{recipe.category}</span>
                      )}
                    </td>
                    <td><span className="version-badge">{recipe.version}</span></td>
                    <td>
                      <span className={`status-badge ${recipe.is_active ? 'active' : 'inactive'}`}>
                        {recipe.is_active ? 'Hoạt động' : 'Vô hiệu'}
                      </span>
                    </td>
                    <td>{recipe.created_by || '-'}</td>
                    <td>
                      {recipe.created_at ? new Date(recipe.created_at).toLocaleDateString('vi-VN') : '-'}
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn-icon" title="Xem lịch sử in" onClick={() => loadPrintLogs(recipe.id)}>
                          <History size={16} />
                        </button>
                        {canEditFormulas && (
                          <button className="btn-icon" title={recipe.is_active ? 'Vô hiệu hóa' : 'Kích hoạt'}
                            onClick={() => handleToggleActive(recipe)}>
                            <Eye size={16} />
                          </button>
                        )}
                        {isAdmin && (
                          <button className="btn-icon btn-icon-danger" title="Xóa"
                            onClick={() => handleDelete(recipe)}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            setShowUploadModal(false)
            loadRecipes()
            loadStats()
            setSuccess('Đã upload công thức thành công!')
          }}
          onError={(msg) => setError(msg)}
          getUserParams={getUserParams}
        />
      )}
      {showLogsModal && (
        <PrintLogsModal
          recipe={selectedRecipe}
          logs={printLogs}
          onClose={() => { setShowLogsModal(false); setSelectedRecipe(null); setPrintLogs([]) }}
        />
      )}
      {showStatsModal && stats && (
        <StatsModal stats={stats} onClose={() => setShowStatsModal(false)} />
      )}
    </div>
  )
}

/* ─── Upload Modal ──────────────────────────────────────────── */
function UploadModal({ onClose, onSuccess, onError, getUserParams }) {
  const [formData, setFormData] = useState({ recipe_code: '', recipe_name: '', category: '', version: 'v1.0' })
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) { onError('Vui lòng chọn file Excel hoặc PDF'); return }
    if (!formData.recipe_code || !formData.recipe_name) { onError('Vui lòng nhập đầy đủ thông tin'); return }
    setUploading(true)
    try {
      const params = getUserParams()
      const data = new FormData()
      data.append('recipe_code', formData.recipe_code)
      data.append('recipe_name', formData.recipe_name)
      data.append('category', formData.category)
      data.append('version', formData.version)
      data.append('file', file)
      const queryString = new URLSearchParams(params).toString()
      const response = await fetch(apiUrl(`/formulas/upload?${queryString}`), { method: 'POST', body: data })
      if (!response.ok) {
        let detail = 'Lỗi khi upload'
        try { const errData = await response.json(); detail = errData.detail || detail } catch (_) { detail = `Lỗi server: ${response.status}` }
        throw new Error(detail)
      }
      onSuccess()
    } catch (err) {
      onError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2><Upload size={24} /> Upload Công Thức Mới</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="upload-form">
          <div className="form-group">
            <label>Mã công thức *</label>
            <input type="text" placeholder="VD: CT-NPK-01" value={formData.recipe_code}
              onChange={(e) => setFormData({ ...formData, recipe_code: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Tên công thức *</label>
            <input type="text" placeholder="VD: Phân bón NPK 16-16-8" value={formData.recipe_name}
              onChange={(e) => setFormData({ ...formData, recipe_name: e.target.value })} required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Dòng sản phẩm</label>
              <input type="text" placeholder="VD: Phân bón" value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Phiên bản</label>
              <input type="text" placeholder="v1.0" value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label>File công thức (.xlsx, .xls hoặc .pdf) *</label>
            <div className="file-input-wrapper">
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.pdf"
                onChange={(e) => { const s = e.target.files[0]; setFile(s); setTimeout(() => { if (fileInputRef.current) fileInputRef.current.value = '' }, 0) }}
                style={{ display: 'none' }} />
              <button type="button" className="btn-file-select" onClick={() => fileInputRef.current?.click()}>
                <FileSpreadsheet size={18} /> Chọn file Excel hoặc PDF
              </button>
              {file && <span className="file-name">{file.name} ({(file.size / 1024).toFixed(0)} KB)</span>}
            </div>
            <p className="file-hint">
              {file
                ? file.name.toLowerCase().endsWith('.pdf') ? 'File PDF sẽ được giữ nguyên' : 'File Excel sẽ được convert sang PDF tự động'
                : 'Hỗ trợ upload file Excel (.xlsx, .xls) hoặc PDF (.pdf)'}
            </p>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={uploading}>Hủy</button>
            <button type="submit" className="btn-primary" disabled={uploading}>
              {uploading ? <><Loader2 className="spinning" size={18} /> Đang upload...</> : <><Upload size={18} /> Upload</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── Print Logs Modal ─────────────────────────────────────── */
function PrintLogsModal({ recipe, logs, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2><History size={24} /> Lịch sử in - {recipe?.recipe_code}</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <p className="recipe-name-modal">{recipe?.recipe_name}</p>
          {logs.length === 0 ? (
            <div className="empty-logs"><Printer size={32} /><p>Chưa có lịch sử in</p></div>
          ) : (
            <div className="logs-table">
              <table>
                <thead><tr><th>Người in</th><th>Thời gian</th><th>IP Address</th></tr></thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td><div className="user-cell"><Clock size={14} />{log.printed_by_name}</div></td>
                      <td><div className="time-cell"><Clock size={14} />{new Date(log.printed_at).toLocaleString('vi-VN')}</div></td>
                      <td>{log.ip_address || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Stats Modal ──────────────────────────────────────────── */
function StatsModal({ stats, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2><BarChart3 size={24} /> Thống kê tổng quan</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-item-label">Tổng công thức</div>
              <div className="stat-item-value">{stats.total_recipes}</div>
            </div>
            <div className="stat-item">
              <div className="stat-item-label">Đang hoạt động</div>
              <div className="stat-item-value stat-green">{stats.active_recipes}</div>
            </div>
            <div className="stat-item">
              <div className="stat-item-label">Đã vô hiệu hóa</div>
              <div className="stat-item-value stat-gray">{stats.inactive_recipes}</div>
            </div>
            <div className="stat-item">
              <div className="stat-item-label">Lượt in tháng này</div>
              <div className="stat-item-value stat-blue">{stats.prints_this_month}</div>
            </div>
          </div>
          {stats.top_printed && stats.top_printed.length > 0 && (
            <div className="top-printed-section">
              <h3><TrendingUp size={20} /> Top 10 công thức được in nhiều nhất</h3>
              <div className="top-printed-list">
                {stats.top_printed.map((item, idx) => (
                  <div key={idx} className="top-item">
                    <span className="top-rank">#{idx + 1}</span>
                    <div className="top-info">
                      <div className="top-code">{item.recipe_code}</div>
                      <div className="top-name">{item.recipe_name}</div>
                    </div>
                    <div className="top-count"><Printer size={14} />{item.print_count} lần</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}