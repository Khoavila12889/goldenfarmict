import React, { useEffect, useState, useCallback } from 'react'
import '../styles/shared.css'
import './Licenses.css'
import {
  getLicenses, getLicenseStats, deleteLicense, updateLicense,
  bulkImportLicenses, scanLicenses,
  getEmployees, getEmployeeEquipment,
  getSoftwareCategories, createSoftwareCategory, updateSoftwareCategory, deleteSoftwareCategory,
  getSoftwareItems, createSoftwareItem, updateSoftwareItem, deleteSoftwareItem, uploadSoftwareContract,
} from '../services/api'

const EDITABLE = ['license_key', 'product_name', 'activated', 'expiry_date', 'notes']
const LABELS = {
  license_key: 'License Key', product_name: 'Product', activated: 'Kích hoạt',
  expiry_date: 'Hết hạn', notes: 'Ghi chú',
}

function getExpiryInfo(dateStr) {
  if (!dateStr) return { class: '', label: '', badge: '' }
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const exp = new Date(dateStr)
  if (isNaN(exp.getTime())) return { class: '', label: '', badge: '' }
  const diffDays = Math.floor((exp - now) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { class: 'sw-exp-danger', label: 'Quá hạn', badge: 'sw-badge-danger' }
  if (diffDays <= 30) return { class: 'sw-exp-warning', label: 'Sắp hết hạn', badge: 'sw-badge-warning' }
  return { class: '', label: '', badge: '' }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return dateStr }
}

export default function Licenses() {
  const [activeTab, setActiveTab] = useState('license')
  const [categories, setCategories] = useState([])

  // License tab state
  const [licenses, setLicenses] = useState([])
  const [stats, setStats] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('success')
  const [selectedLic, setSelectedLic] = useState(null)
  const [editData, setEditData] = useState({})
  const [saving, setSaving] = useState(false)

  // Items tab state
  const [items, setItems] = useState([])
  const [itemSearch, setItemSearch] = useState('')
  const [itemsLoading, setItemsLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [itemForm, setItemForm] = useState({ name: '', registered_date: '', expiration_date: '', notes: '' })
  const [itemFormOpen, setItemFormOpen] = useState(false)
  const [itemEditId, setItemEditId] = useState(null)

  // Category management
  const [catOpen, setCatOpen] = useState(false)
  const [catEditId, setCatEditId] = useState(null)
  const [catForm, setCatForm] = useState({ name: '', icon_name: '📄' })

  const isLicenseTab = activeTab === 'license'

  function showMsg(text, type) {
    setMsg(text)
    setMsgType(type || 'success')
    setTimeout(() => setMsg(''), 3500)
  }

  // ─── Load ─────────────────────────────────────────────────

  const loadLicenses = useCallback((q) => {
    getLicenses(q || search).then(r => setLicenses(r.data?.data || [])).catch(() => {})
    getLicenseStats().then(r => setStats(r.data)).catch(() => {})
  }, [search])

  const loadCategories = useCallback(() => {
    getSoftwareCategories().then(r => setCategories(r.data?.data || [])).catch(() => {})
  }, [])

  const loadItems = useCallback((catId, q) => {
    if (!catId) return
    setItemsLoading(true)
    getSoftwareItems(catId, q || itemSearch)
      .then(r => setItems(r.data?.data || []))
      .catch(() => setItems([]))
      .finally(() => setItemsLoading(false))
  }, [itemSearch])

  useEffect(() => {
    setLoading(true)
    loadLicenses()
    loadCategories()
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!isLicenseTab && activeTab !== 'license') {
      loadItems(activeTab, '')
    }
  }, [activeTab])

  // ─── License Tab ──────────────────────────────────────────

  function selectLicense(lic) {
    if (selectedLic?.id === lic.id) { setSelectedLic(null); return }
    setSelectedLic(lic)
    const data = {}
    EDITABLE.forEach(k => { data[k] = lic[k] || '' })
    setEditData(data)
  }

  async function saveEdit() {
    if (!selectedLic) return
    setSaving(true)
    try {
      await updateLicense(selectedLic.id, editData)
      showMsg('Đã cập nhật license!')
      setSelectedLic(prev => ({ ...prev, ...editData }))
      loadLicenses()
    } catch { showMsg('Lỗi khi cập nhật', 'error') }
    setSaving(false)
  }

  async function handleDeleteLicense(id) {
    if (!window.confirm('Xoá license này?')) return
    try {
      await deleteLicense(id)
      showMsg('Đã xoá license')
      if (selectedLic?.id === id) setSelectedLic(null)
      loadLicenses()
    } catch { showMsg('Lỗi khi xoá') }
  }

  async function handleScan() {
    if (!window.confirm('Quét license từ cấu hình thiết bị?')) return
    try {
      const r = await scanLicenses()
      showMsg(`Đã quét xong! Thêm ${r.data.added} license mới.`)
      loadLicenses()
    } catch { showMsg('Lỗi khi quét') }
  }

  // ─── Items Tab ────────────────────────────────────────────

  function openItemAdd() {
    setItemEditId(null)
    setItemForm({ name: '', registered_date: '', expiration_date: '', notes: '' })
    setItemFormOpen(true)
  }

  function openItemEdit(item) {
    setItemEditId(item.id)
    setItemForm({
      name: item.name || '',
      registered_date: item.registered_date || '',
      expiration_date: item.expiration_date || '',
      notes: item.notes || '',
    })
    setItemFormOpen(true)
  }

  async function handleItemSubmit(e) {
    e.preventDefault()
    if (!itemForm.name.trim()) { showMsg('Tên không được để trống', 'error'); return }
    try {
      if (itemEditId) {
        await updateSoftwareItem(itemEditId, itemForm)
        showMsg('Đã cập nhật!')
      } else {
        await createSoftwareItem(activeTab, itemForm)
        showMsg('Đã thêm mới!')
      }
      setItemFormOpen(false)
      loadItems(activeTab, '')
    } catch {
      showMsg('Lỗi kết nối', 'error')
    }
  }

  async function handleDeleteItem(id) {
    if (!window.confirm('Xoá mục này?')) return
    try {
      await deleteSoftwareItem(id)
      showMsg('Đã xoá')
      if (selectedItem?.id === id) setSelectedItem(null)
      loadItems(activeTab, '')
    } catch { showMsg('Lỗi khi xoá', 'error') }
  }

  async function handleUploadContract(itemId, file) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) { showMsg('Chỉ hỗ trợ file PDF', 'error'); return }
    try {
      await uploadSoftwareContract(itemId, file)
      showMsg('Đã tải lên hợp đồng!')
      loadItems(activeTab, '')
    } catch { showMsg('Lỗi tải lên', 'error') }
  }

  // ─── Category Management ──────────────────────────────────

  function openCatAdd() {
    setCatEditId(null)
    setCatForm({ name: '', icon_name: '📄' })
    setCatOpen(true)
  }

  function openCatEdit(cat) {
    setCatEditId(cat.id)
    setCatForm({ name: cat.name, icon_name: cat.icon_name || '📄' })
    setCatOpen(true)
  }

  function closeCatDrawer() {
    setCatOpen(false)
    setCatForm({ name: '', icon_name: '📄' })
    setCatEditId(null)
  }

  async function handleCatSubmit(e) {
    e.preventDefault()
    if (!catForm.name.trim()) { showMsg('Tên tab không được để trống', 'error'); return }
    try {
      if (catEditId) {
        await updateSoftwareCategory(catEditId, catForm)
        showMsg('Đã cập nhật tab!')
      } else {
        await createSoftwareCategory(catForm)
        showMsg('Đã thêm tab mới!')
      }
      loadCategories()
    } catch (err) {
      const detail = err.response?.data?.detail || 'Lỗi kết nối'
      showMsg(detail, 'error')
    }
  }

  async function handleCatDelete(id) {
    if (!window.confirm('Xoá tab này?')) return
    try {
      await deleteSoftwareCategory(id)
      showMsg('Đã xoá tab')
      if (activeTab === id) setActiveTab('license')
      loadCategories()
    } catch (err) {
      const detail = err.response?.data?.detail || 'Lỗi xoá tab'
      showMsg(detail, 'error')
    }
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="sw-wrap">
      {/* Module header */}
      <div className="sw-header">
        <h2>Quản lý License & Phần mềm</h2>
        <div className="sw-header-actions">
          <span className="sw-tab-count">
            <span>{categories.length}</span> tab
          </span>
          <button className="bk-btn" onClick={openCatAdd}>Quản lý Tab</button>
        </div>
      </div>

      {msg && (
        <div className={`sw-msg ${msgType === 'error' ? 'error' : 'success'}`}>{msg}</div>
      )}

      {/* Tab bar */}
      <div className="sw-tabs">
        <button
          className={`sw-tab ${isLicenseTab ? 'active' : ''}`}
          onClick={() => setActiveTab('license')}
        >
          License Key
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`sw-tab ${activeTab === cat.id ? 'active' : ''}`}
            onClick={() => setActiveTab(cat.id)}
          >
            {cat.icon_name || '📄'} {cat.name}
          </button>
        ))}
      </div>

      {/* ─── LICENSE TAB ──────────────────────────────────────── */}
      {isLicenseTab && (
        <>
          {stats && (
            <div className="sw-stats">
              <div className="sw-stat-card">
                <div className="sw-stat-header">
                  <span className="sw-stat-label">Tổng License</span>
                  <span>🔑</span>
                </div>
                <div className="sw-stat-value">{stats.total}</div>
              </div>
              <div className="sw-stat-card">
                <div className="sw-stat-header">
                  <span className="sw-stat-label">Có Product</span>
                  <span>📦</span>
                </div>
                <div className="sw-stat-value">{stats.has_product}</div>
              </div>
              <div className="sw-stat-card">
                <div className="sw-stat-header">
                  <span className="sw-stat-label">Có hạn dùng</span>
                  <span>📅</span>
                </div>
                <div className="sw-stat-value">{stats.has_expiry}</div>
              </div>
            </div>
          )}

          <div className="bk-toolbar-root">
            <div className="bk-toolbar-row">
              <div className="bk-toolbar-left">
                <div className="sw-search">
                  <span className="sw-search-icon">🔍</span>
                  <input
                    type="text" placeholder="Tìm key, product, tên NV..."
                    value={search}
                    onChange={e => { const v = e.target.value; setSearch(v); loadLicenses(v) }}
                  />
                </div>
                <button className="bk-btn" onClick={handleScan}>Quét License</button>
                <BulkImportButton onDone={() => { showMsg('Đã nhập hàng loạt!'); loadLicenses() }} />
              </div>
            </div>
          </div>

          <div className="tbl-wrap sw-grid">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ minWidth: 140 }}>License Key</th>
                  <th style={{ minWidth: 120 }}>Product</th>
                  <th style={{ minWidth: 130 }}>Người sử dụng</th>
                  <th style={{ minWidth: 100 }}>Bộ phận</th>
                  <th>Thiết bị</th>
                  <th style={{ minWidth: 95 }}>S/N</th>
                  <th style={{ width: 90 }}>Kích hoạt</th>
                  <th style={{ width: 90 }}>Hết hạn</th>
                  <th style={{ width: 36, textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1,2,3,4,5].map(i => (
                    <tr key={`s-${i}`}>
                      {[1,2,3,4,5,6,7,8,9].map(j => (
                        <td key={`c-${j}`}><div className="bk-skeleton-bar" style={{ height: 12, width: '75%' }} /></td>
                      ))}
                    </tr>
                  ))
                ) : licenses.length === 0 ? (
                  <tr><td colSpan={9} className="bk-empty">Chưa có License Key nào.</td></tr>
                ) : licenses.map(lic => {
                  const sel = selectedLic?.id === lic.id
                  return (
                    <tr key={lic.id} className={sel ? 'selected' : ''} onClick={() => selectLicense(lic)}>
                      <td><span className="ticket-badge license-key">{lic.license_key}</span></td>
                      <td style={{ fontWeight: 500 }}>{lic.product_name || <span className="sw-cell-muted">—</span>}</td>
                      <td>{lic.full_name || <span className="sw-cell-muted">—</span>}</td>
                      <td style={{ fontSize: '0.78rem' }}>{lic.department || <span className="sw-cell-muted">—</span>}</td>
                      <td style={{ fontSize: '0.78rem' }}>{lic.equipment_type || <span className="sw-cell-muted">—</span>}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{lic.serial_number || <span className="sw-cell-muted">—</span>}</td>
                      <td style={{ fontSize: '0.78rem' }}>{lic.activated || <span className="sw-cell-muted">—</span>}</td>
                      <td style={{ fontSize: '0.78rem' }}>{lic.expiry_date || <span className="sw-cell-muted">—</span>}</td>
                      <td className="sw-cell-action">{sel ? '◀' : '▶'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* License side panel */}
          <div className={`panel-overlay ${selectedLic ? 'open' : ''}`} onClick={() => setSelectedLic(null)} />
          <div className={`side-panel ${selectedLic ? 'open' : ''}`}>
            <div className="bk-drawer-header">
              <div>
                <div className="bk-drawer-title">Chi tiết License</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--bk-text-secondary, #64748b)', fontFamily: 'monospace' }}>{selectedLic?.license_key}</div>
              </div>
              <button className="bk-drawer-close" onClick={() => setSelectedLic(null)}>✕</button>
            </div>
            <div className="panel-body">
              {selectedLic && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 1rem', marginBottom: '1rem' }}>
                    <DetailItem label="Người sử dụng" value={selectedLic.full_name} />
                    <DetailItem label="Bộ phận" value={selectedLic.department} />
                    <DetailItem label="Thiết bị" value={selectedLic.equipment_type} />
                    <DetailItem label="S/N" value={selectedLic.serial_number} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--bk-text, #0f172a)', marginBottom: '0.5rem' }}>Chỉnh sửa</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    {EDITABLE.map(k => (
                      <div key={k} style={k === 'notes' ? { gridColumn: '1 / span 2' } : {}}>
                        <label className="bk-form-label">{LABELS[k]}</label>
                        <input type="text" value={editData[k] || ''}
                          onChange={e => setEditData({ ...editData, [k]: e.target.value })}
                          className="bk-input" />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button onClick={saveEdit} disabled={saving} className="bk-btn bk-btn-primary">{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
                    <button onClick={() => handleDeleteLicense(selectedLic.id)} className="bk-btn" style={{ color: 'var(--bk-danger, #dc2626)', borderColor: '#fca5a5' }}>Xoá</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── ITEMS TABS ───────────────────────────────────────── */}
      {!isLicenseTab && (
        <>
          <div className="bk-toolbar-root">
            <div className="bk-toolbar-row">
              <div className="bk-toolbar-left">
                <div className="sw-search">
                  <span className="sw-search-icon">🔍</span>
                  <input
                    type="text" placeholder="Tìm kiếm..."
                    value={itemSearch}
                    onChange={e => { const v = e.target.value; setItemSearch(v); loadItems(activeTab, v) }}
                  />
                </div>
              </div>
              <div className="bk-toolbar-right">
                <button className="bk-btn bk-btn-primary" onClick={openItemAdd}>+ Thêm mới</button>
              </div>
            </div>
          </div>

          <div className="tbl-wrap sw-grid">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>Tên</th>
                  <th style={{ width: 110 }}>Ngày đăng ký</th>
                  <th style={{ width: 130 }}>Ngày hết hạn</th>
                  <th style={{ width: 110 }}>Hợp đồng</th>
                  <th style={{ minWidth: 150 }}>Ghi chú</th>
                  <th style={{ width: 80, textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {itemsLoading ? (
                  [1,2,3].map(i => (
                    <tr key={`s-${i}`}>
                      {[1,2,3,4,5,6].map(j => <td key={`c-${j}`}><div className="bk-skeleton-bar" style={{ height: 12, width: '75%' }} /></td>)}
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr><td colSpan={6} className="bk-empty" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--bk-text-muted, #94a3b8)', fontSize: '0.9rem' }}>Chưa có dữ liệu.</td></tr>
                ) : items.map(item => {
                  const expInfo = getExpiryInfo(item.expiration_date)
                  return (
                    <tr key={item.id}>
                      <td className="sw-item-name">
                        {item.name}
                        {expInfo.badge && (
                          <span className={`sw-badge ${expInfo.badge}`}>{expInfo.label}</span>
                        )}
                      </td>
                      <td className={item.registered_date ? '' : 'sw-cell-muted'} style={{ fontSize: '0.78rem' }}>
                        {formatDate(item.registered_date) || <span className="sw-cell-muted">—</span>}
                      </td>
                      <td style={{ fontSize: '0.78rem' }}>
                        {item.expiration_date ? (
                          <span className={expInfo.class}>{formatDate(item.expiration_date)}</span>
                        ) : <span className="sw-cell-muted">—</span>}
                      </td>
                      <td>
                        {item.contract_info ? (
                          <a href={`/api/software/contracts/${item.contract_info}`} target="_blank" rel="noopener noreferrer"
                            style={{ color: 'var(--bk-primary, #00468C)', fontSize: '0.78rem', fontWeight: 500, textDecoration: 'none' }}>
                            Xem PDF
                          </a>
                        ) : <span className="sw-cell-muted" style={{ fontSize: '0.75rem' }}>—</span>}
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--bk-text-secondary, #64748b)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.notes || <span className="sw-cell-muted">—</span>}
                      </td>
                      <td className="sw-cell-action">
                        <div className="sw-action-group">
                          <button className="sw-action-btn" onClick={() => openItemEdit(item)}>✏️</button>
                          <button className="sw-action-btn sw-action-btn-danger" onClick={() => handleDeleteItem(item.id)}>🗑️</button>
                          <label className="sw-action-btn sw-action-btn-upload" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                            📎
                            <input type="file" accept=".pdf" style={{ display: 'none' }}
                              onChange={e => { if (e.target.files[0]) handleUploadContract(item.id, e.target.files[0]); e.target.value = '' }} />
                          </label>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Item form dialog */}
          {itemFormOpen && (
            <div className="bk-dialog-overlay" onClick={() => setItemFormOpen(false)}>
              <div className="bk-dialog" onClick={e => e.stopPropagation()}>
                <div className="bk-dialog-header">
                  <div className="bk-dialog-title">{itemEditId ? 'Chỉnh sửa' : 'Thêm mới'}</div>
                  <button className="bk-dialog-close" onClick={() => setItemFormOpen(false)}>✕</button>
                </div>
                <form onSubmit={handleItemSubmit}>
                  <div className="bk-form-group">
                    <label className="bk-form-label">Tên *</label>
                    <input type="text" value={itemForm.name} placeholder="Nhập tên..."
                      onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
                      className="bk-input" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="bk-form-group">
                      <label className="bk-form-label">Ngày đăng ký</label>
                      <input type="date" value={itemForm.registered_date}
                        onChange={e => setItemForm({ ...itemForm, registered_date: e.target.value })}
                        className="bk-input" />
                    </div>
                    <div className="bk-form-group">
                      <label className="bk-form-label">Ngày hết hạn</label>
                      <input type="date" value={itemForm.expiration_date}
                        onChange={e => setItemForm({ ...itemForm, expiration_date: e.target.value })}
                        className="bk-input" />
                    </div>
                  </div>
                  <div className="bk-form-group">
                    <label className="bk-form-label">Ghi chú</label>
                    <textarea value={itemForm.notes} placeholder="Ghi chú..." rows={2}
                      onChange={e => setItemForm({ ...itemForm, notes: e.target.value })}
                      className="bk-input" style={{ resize: 'vertical', minHeight: 44 }} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', borderTop: '1px solid var(--bk-border, #f1f5f9)', paddingTop: '0.85rem', marginTop: '0.5rem' }}>
                    <button type="button" className="bk-btn" onClick={() => setItemFormOpen(false)}>Hủy bỏ</button>
                    <button type="submit" className="bk-btn bk-btn-primary">Lưu</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── CATEGORY MANAGEMENT DRAWER ─────────────────────────── */}
      <div className={`bk-drawer-overlay ${catOpen ? 'open' : ''}`} onClick={closeCatDrawer} />
      <div className={`bk-drawer ${catOpen ? 'open' : ''}`}>
        <div className="bk-drawer-header">
          <div className="bk-drawer-title">Quản lý Tab</div>
          <button className="bk-drawer-close" onClick={closeCatDrawer}>✕</button>
        </div>
        <div className="bk-drawer-body">
          {/* Category form */}
          <form onSubmit={handleCatSubmit} style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bk-surface-alt, #f8fafc)', borderRadius: 'var(--bk-radius-sm, 10px)', border: '1px solid var(--bk-border, #e2e8f0)' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label className="bk-form-label">Tên tab</label>
                <input type="text" value={catForm.name} placeholder="VD: Phần mềm"
                  onChange={e => setCatForm({ ...catForm, name: e.target.value })}
                  className="bk-input" />
              </div>
              <div style={{ width: 70 }}>
                <label className="bk-form-label">Icon</label>
                <input type="text" value={catForm.icon_name} placeholder="📄"
                  onChange={e => setCatForm({ ...catForm, icon_name: e.target.value })}
                  className="bk-input" style={{ textAlign: 'center' }} />
              </div>
              <button type="submit" className="bk-btn bk-btn-primary" style={{ height: 32, whiteSpace: 'nowrap' }}>
                {catEditId ? 'Cập nhật' : 'Thêm'}
              </button>
            </div>
          </form>

          {/* Category list */}
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Tên tab</th>
                  <th style={{ width: 50, textAlign: 'center' }}>SL</th>
                  <th style={{ width: 80, textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--bk-text-muted, #94a3b8)', fontSize: '0.85rem' }}>Chưa có tab nào.</td></tr>
                ) : categories.map(cat => (
                  <tr key={cat.id}>
                    <td style={{ textAlign: 'center', fontSize: '1rem' }}>{cat.icon_name || '📄'}</td>
                    <td style={{ fontWeight: 600, color: 'var(--bk-text, #0f172a)' }}>{cat.name}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="sw-tab-count" style={{ fontSize: '0.7rem' }}>{cat.item_count || 0}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="sw-action-group">
                        <button className="sw-action-btn" onClick={() => openCatEdit(cat)}>✏️</button>
                        <button className="sw-action-btn sw-action-btn-danger" onClick={() => handleCatDelete(cat.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────

function BulkImportButton({ onDone }) {
  const [open, setOpen] = useState(false)
  const [empList, setEmpList] = useState([])
  const [selectedEmp, setSelectedEmp] = useState('')
  const [equipList, setEquipList] = useState([])
  const [selectedEquip, setSelectedEquip] = useState('')
  const [bulkKeys, setBulkKeys] = useState('')
  const [bulkProduct, setBulkProduct] = useState('')

  async function openBulk() { setOpen(true); const r = await getEmployees(); setEmpList(r.data?.data || []) }

  async function handleEmpChange(e) {
    const id = e.target.value; setSelectedEmp(id)
    if (id) { const r = await getEmployeeEquipment(id); setEquipList(r.data?.data || []) }
    else { setEquipList([]) }
    setSelectedEquip('')
  }

  async function handleBulkSubmit() {
    if (!selectedEquip || !bulkKeys.trim()) return
    const keys = bulkKeys.split('\n').filter(k => k.trim())
    await bulkImportLicenses(parseInt(selectedEquip), keys, bulkProduct.trim())
    setOpen(false); setBulkKeys(''); setBulkProduct(''); setSelectedEmp(''); setSelectedEquip('')
    onDone()
  }

  if (!open) return (
    <button className="bk-btn" onClick={openBulk}>Nhập hàng loạt</button>
  )

  return (
    <div className="bk-dialog-overlay" onClick={() => setOpen(false)}>
      <div className="bk-dialog" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="bk-dialog-header">
          <div className="bk-dialog-title">Nhập hàng loạt License Key</div>
          <button className="bk-dialog-close" onClick={() => setOpen(false)}>✕</button>
        </div>
        <select value={selectedEmp} onChange={handleEmpChange} className="bk-input" style={{ marginBottom: '0.5rem' }}>
          <option value="">Chọn nhân viên...</option>
          {empList.map(e => <option key={e.id} value={e.id}>{e.full_name}{e.department ? ` - ${e.department}` : ''}</option>)}
        </select>
        {equipList.length > 0 && (
          <select value={selectedEquip} onChange={e => setSelectedEquip(e.target.value)} className="bk-input" style={{ marginBottom: '0.5rem' }}>
            <option value="">Chọn thiết bị...</option>
            {equipList.map(eq => <option key={eq.id} value={eq.id}>{eq.equipment_type || `#${eq.id}`}</option>)}
          </select>
        )}
        <textarea placeholder="License Key (mỗi dòng 1 key)" value={bulkKeys} onChange={e => setBulkKeys(e.target.value)} rows={5}
          className="bk-input" style={{ resize: 'vertical', minHeight: 80, marginBottom: '0.5rem' }} />
        <input type="text" placeholder="Product name (chung)" value={bulkProduct} onChange={e => setBulkProduct(e.target.value)}
          className="bk-input" style={{ marginBottom: '0.75rem' }} />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={handleBulkSubmit} className="bk-btn bk-btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Lưu tất cả</button>
          <button onClick={() => setOpen(false)} className="bk-btn">Hủy</button>
        </div>
      </div>
    </div>
  )
}

function DetailItem({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '0.65rem', color: 'var(--bk-text-muted, #94a3b8)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '0.82rem', color: 'var(--bk-text, #0f172a)', fontWeight: 500 }}>{value || <span style={{ color: 'var(--bk-border, #cbd5e1)', fontWeight: 400 }}>—</span>}</div>
    </div>
  )
}
