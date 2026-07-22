import React, { useState, useEffect, useCallback } from 'react'
import {
  Shield, Search, Save, Loader, User, Check, X,
  Users, BookOpen, FolderOpen, Building, Trash2, Plus, ChevronDown
} from 'lucide-react'
import '../styles/booking.css'

const MODULES = [
  { key: 'employees', label: 'Nhân viên', group: 'admin', desc: 'Quản lý thông tin nhân viên' },
  { key: 'equipment', label: 'Thiết bị', group: 'admin', desc: 'Quản lý tài sản thiết bị' },
  { key: 'licenses', label: 'License Keys', group: 'admin', desc: 'Quản lý bản quyền phần mềm' },
  { key: 'workflows', label: 'Quy trình', group: 'admin', desc: 'Tạo quy trình phê duyệt' },
  { key: 'salary-admin', label: 'Quản lý lương', group: 'admin', desc: 'Import & xuất phiếu lương' },
  { key: 'tickets', label: 'Tickets', group: 'support', desc: 'Yêu cầu hỗ trợ IT' },
  { key: 'approvals', label: 'Phê duyệt', group: 'support', desc: 'Phê duyệt yêu cầu' },
  { key: 'bookings', label: 'Lịch', group: 'support', desc: 'Đặt lịch xe & phòng họp' },
  { key: 'documents', label: 'Tài liệu', group: 'support', desc: 'Truy cập tài liệu dùng chung' },
  { key: 'salary', label: 'Phiếu lương', group: 'support', desc: 'Xem phiếu lương cá nhân' },
]

const ADMIN_MODULES = new Set(MODULES.filter(m => m.group === 'admin').map(m => m.key))

export default function Permissions() {
  const [activeTab, setActiveTab] = useState('modules')
  const [saveMsg, setSaveMsg] = useState(null)

  const adminCode = sessionStorage.getItem('user_code') || ''
  const token = sessionStorage.getItem('token') || ''
  const userRole = sessionStorage.getItem('user_role') || ''
  const apiBase = '/api/auth'

  function apiUrl(path, extra = {}) {
    const p = new URLSearchParams({ admin_code: adminCode, token, role: userRole, ...extra })
    return `${apiBase}${path}?${p}`
  }

  return (
    <div className="booking-module" style={{ minHeight: 0, height: '100%' }}>
      <div className="bk-layout">
        <div className="bk-layout-main">
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--bk-bg)', padding: '1rem' }}>
            <div className="bk-header" style={{ marginBottom: '0.75rem' }}>
              <Shield size={22} />
              Phân quyền hệ thống
            </div>

            {/* ─── Tabs ─── */}
            <div className="sa-tabs" style={{ marginBottom: '1rem' }}>
              <button className={`sa-tab${activeTab === 'modules' ? ' active' : ''}`}
                onClick={() => setActiveTab('modules')}>
                <Shield size={16} /> Phân quyền Module
              </button>
              <button className={`sa-tab${activeTab === 'documents' ? ' active' : ''}`}
                onClick={() => setActiveTab('documents')}>
                <FolderOpen size={16} /> Chia sẻ Tài liệu
              </button>
              <button className={`sa-tab${activeTab === 'roles' ? ' active' : ''}`}
                onClick={() => setActiveTab('roles')}>
                <Users size={16} /> Vai trò người dùng
              </button>
            </div>

            {activeTab === 'modules' && <ModulePermissionsTab apiBase={apiBase} apiUrl={apiUrl} saveMsg={saveMsg} setSaveMsg={setSaveMsg} />}
            {activeTab === 'documents' && <DocumentPermissionsTab saveMsg={saveMsg} setSaveMsg={setSaveMsg} />}
            {activeTab === 'roles' && <UserRolesTab apiUrl={apiUrl} saveMsg={saveMsg} setSaveMsg={setSaveMsg} />}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Tab 1: Module Permissions ─── */

function ModulePermissionsTab({ apiBase, apiUrl, saveMsg, setSaveMsg }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)
  const [permissions, setPermissions] = useState({})
  const [permLoading, setPermLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('all')

  const adminCode = sessionStorage.getItem('user_code') || ''
  const token = sessionStorage.getItem('token') || ''
  const role = sessionStorage.getItem('user_role') || ''

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/users'))
      const data = await res.json()
      if (res.ok) setUsers(data.data || [])
    } catch (_) {} finally { setLoading(false) }
  }, [apiUrl])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const fetchPermissions = useCallback(async (empCode) => {
    setPermLoading(true)
    try {
      const res = await fetch(apiUrl(`/permissions/${empCode}`))
      const data = await res.json()
      if (res.ok) setPermissions(data.data || {})
      else setPermissions({})
    } catch (_) { setPermissions({}) }
    finally { setPermLoading(false) }
  }, [apiUrl])

  function selectUser(user) {
    setSelectedUser(user)
    setSaveMsg(null)
    fetchPermissions(user.employee_code)
  }

  function togglePerm(moduleKey, field) {
    setPermissions(prev => {
      const current = prev[moduleKey] || { can_view: false, can_edit: false }
      const updated = { ...current, [field]: !current[field] }
      if (field === 'can_edit' && updated.can_edit) updated.can_view = true
      if (field === 'can_view' && !updated.can_view) updated.can_edit = false
      return { ...prev, [moduleKey]: updated }
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const body = MODULES.map(m => ({
        module: m.key,
        can_view: !!(permissions[m.key]?.can_view),
        can_edit: !!(permissions[m.key]?.can_edit),
      }))
      const p = new URLSearchParams({ admin_code: adminCode, token, role })
      const res = await fetch(`${apiBase}/permissions/${selectedUser.employee_code}?${p}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) setSaveMsg({ type: 'success', text: 'Đã lưu phân quyền' })
      else {
        const d = await res.json()
        setSaveMsg({ type: 'error', text: d.detail || 'Lỗi lưu' })
      }
    } catch (err) {
      setSaveMsg({ type: 'error', text: 'Lỗi kết nối' })
    } finally { setSaving(false) }
  }

  const filtered = users.filter(u => {
    if (filterRole !== 'all' && u.role !== filterRole) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (u.employee_code || '').toLowerCase().includes(q)
      || (u.full_name || '').toLowerCase().includes(q)
      || (u.department || '').toLowerCase().includes(q)
  })

  const adminMods = MODULES.filter(m => m.group === 'admin')
  const supportMods = MODULES.filter(m => m.group === 'support')

  return (
    <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
      <div className="bk-card" style={{ padding: '1rem', flex: '1 1 300px', minWidth: 260, maxWidth: 400 }}>
        <div className="bk-form-group" style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--bk-text-muted)' }} />
              <input className="bk-form-input" placeholder="Tìm kiếm..." value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: '1.6rem', height: '32px', fontSize: '0.82rem' }} />
            </div>
            <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
              className="bk-form-input" style={{ width: 'auto', height: '32px', fontSize: '0.82rem' }}>
              <option value="all">Tất cả</option>
              <option value="admin">Admin</option>
              <option value="head">Trưởng phòng</option>
              <option value="user">NV</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--bk-text-muted)' }}>
            <Loader size={20} className="spin" />
            <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Đang tải...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--bk-text-muted)', fontSize: '0.85rem' }}>Không tìm thấy</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '480px', overflowY: 'auto' }}>
            {filtered.map(u => (
              <div key={u.employee_code} onClick={() => selectUser(u)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.5rem 0.65rem', borderRadius: 'var(--bk-radius-sm)', cursor: 'pointer',
                  background: selectedUser?.employee_code === u.employee_code ? 'var(--bk-primary)' : 'var(--bk-surface-hover)',
                  color: selectedUser?.employee_code === u.employee_code ? '#fff' : 'var(--bk-text)',
                  transition: 'all 0.15s',
                }}>
                <User size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.full_name || u.employee_code}
                  </div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.employee_code} · {u.department || '—'}
                  </div>
                </div>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.45rem',
                  borderRadius: '99px',
                  background: selectedUser?.employee_code === u.employee_code ? 'rgba(255,255,255,0.2)' : 'var(--bk-surface)',
                  color: selectedUser?.employee_code === u.employee_code ? '#fff' : 'var(--bk-text-muted)',
                  flexShrink: 0,
                }}>
                  {u.role === 'admin' ? 'Admin' : u.role === 'head' ? 'TP' : 'NV'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bk-card" style={{ padding: '1.25rem', flex: '1 1 520px', minWidth: 340 }}>
        {!selectedUser ? (
          <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--bk-text-muted)', fontSize: '0.9rem' }}>
            <User size={40} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
            <div>Chọn người dùng để phân quyền</div>
          </div>
        ) : permLoading ? (
          <div style={{ padding: '2rem 0', textAlign: 'center' }}>
            <Loader size={24} className="spin" style={{ marginBottom: '0.5rem' }} />
            <div style={{ fontSize: '0.85rem', color: 'var(--bk-text-muted)' }}>Đang tải...</div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--bk-text)' }}>
                {selectedUser.full_name || selectedUser.employee_code}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--bk-text-secondary)', marginTop: '0.15rem' }}>
                {selectedUser.employee_code} · {selectedUser.department || '—'}
                <span style={{ marginLeft: '0.5rem', padding: '0.15rem 0.45rem', borderRadius: '99px', background: 'var(--bk-surface)', fontSize: '0.7rem', fontWeight: 600 }}>
                  {selectedUser.role === 'admin' ? 'Admin' : selectedUser.role === 'head' ? 'Trưởng phòng' : 'Nhân viên'}
                </span>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--bk-danger)', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Shield size={14} /> Quản trị
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.4rem' }}>
                {adminMods.map(m => renderModuleCard(m, permissions, togglePerm))}
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--bk-primary)', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <BookOpen size={14} /> Nghiệp vụ
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.4rem' }}>
                {supportMods.map(m => renderModuleCard(m, permissions, togglePerm))}
              </div>
            </div>

            {saveMsg && (
              <div style={{
                marginTop: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--bk-radius-sm)',
                fontSize: '0.85rem',
                background: saveMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${saveMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                color: saveMsg.type === 'success' ? 'var(--bk-success)' : 'var(--bk-danger)',
                display: 'flex', alignItems: 'center', gap: '0.4rem',
              }}>
                {saveMsg.type === 'success' ? <Check size={14} /> : <X size={14} />}
                {saveMsg.text}
              </div>
            )}

            <button className="bk-btn bk-btn-primary"
              style={{ marginTop: '0.75rem', width: '100%', height: '36px' }}
              onClick={handleSave} disabled={saving}>
              {saving ? <><Loader size={16} className="spin" /> Đang lưu...</> : <><Save size={16} /> Lưu phân quyền</>}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function renderModuleCard(m, permissions, togglePerm) {
  const perm = permissions[m.key] || { can_view: false, can_edit: false }
  const isAdminMod = ADMIN_MODULES.has(m.key)
  return (
    <div key={m.key} style={{
      padding: '0.5rem 0.65rem',
      background: 'var(--bk-surface-hover)',
      borderRadius: 'var(--bk-radius-sm)',
      border: '1px solid var(--bk-border)',
    }}>
      <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.35rem', color: 'var(--bk-text)' }}>
        {m.label}
      </div>
      <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem', cursor: 'pointer', color: 'var(--bk-text-secondary)' }}>
          <input type="checkbox" checked={perm.can_view}
            onChange={() => togglePerm(m.key, 'can_view')}
            style={{ accentColor: 'var(--bk-primary)' }} />
          Xem
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem', cursor: 'pointer',
          color: isAdminMod ? 'var(--bk-text-muted)' : 'var(--bk-text-secondary)' }}>
          <input type="checkbox" checked={perm.can_edit}
            onChange={() => togglePerm(m.key, 'can_edit')}
            style={{ accentColor: 'var(--bk-primary)' }}
            disabled={isAdminMod} />
          Sửa
        </label>
      </div>
    </div>
  )
}

/* ─── Tab 2: Document Permissions ─── */

function DocumentPermissionsTab({ saveMsg, setSaveMsg }) {
  const [storages, setStorages] = useState([])
  const [selectedStorage, setSelectedStorage] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [permLoading, setPermLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newDept, setNewDept] = useState('')
  const [newPerm, setNewPerm] = useState('read')

  const userCode = sessionStorage.getItem('user_code') || ''
  const token = sessionStorage.getItem('token') || ''
  const role = sessionStorage.getItem('user_role') || ''
  const adminCode = userCode

  useEffect(() => {
    Promise.all([
      fetch(`/api/documents/config?user_code=${userCode}&user_role=${role}`).then(r => r.json()),
      fetch('/api/documents/departments').then(r => r.json()),
    ]).then(([sRes, dRes]) => {
      if (sRes.data) setStorages(sRes.data)
      if (dRes.data) setDepartments(dRes.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function loadPermissions(storageId) {
    setPermLoading(true)
    try {
      const p = new URLSearchParams({ admin_code: adminCode, token, role })
      const res = await fetch(`/api/documents/permissions/${storageId}?${p}`)
      const data = await res.json()
      setPermissions(data.data || [])
    } catch (_) { setPermissions([]) }
    finally { setPermLoading(false) }
  }

  function selectStorage(s) {
    setSelectedStorage(s)
    setNewDept('')
    loadPermissions(s.id)
  }

  async function addDepartmentPerm() {
    if (!newDept || !selectedStorage) return
    setAdding(true)
    try {
      const p = new URLSearchParams({ admin_code: adminCode, token, role })
      const res = await fetch(`/api/documents/permissions/department?${p}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storage_id: selectedStorage.id,
          folder_path: '/',
          department: newDept,
          permission: newPerm,
        }),
      })
      if (res.ok) {
        setSaveMsg({ type: 'success', text: `Đã cấp quyền cho phòng ${newDept}` })
        loadPermissions(selectedStorage.id)
        setNewDept('')
      } else {
        const d = await res.json()
        setSaveMsg({ type: 'error', text: d.detail || 'Lỗi' })
      }
    } catch (err) {
      setSaveMsg({ type: 'error', text: 'Lỗi kết nối' })
    } finally { setAdding(false) }
  }

  async function removePerm(permId) {
    if (!window.confirm('Xóa quyền này?')) return
    try {
      const p = new URLSearchParams({ admin_code: adminCode, token, role })
      await fetch(`/api/documents/permissions/${permId}?${p}`, { method: 'DELETE' })
      loadPermissions(selectedStorage.id)
    } catch (_) {}
  }

  const deptPerms = permissions.filter(p => p.department && !p.role && !p.employee_code)
  const otherPerms = permissions.filter(p => p.role || p.employee_code)
  const usedDepts = new Set(deptPerms.map(p => p.department))
  const availDepts = departments.filter(d => !usedDepts.has(d.name))

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--bk-text-muted)' }}>
      <Loader size={20} className="spin" />
    </div>
  }

  return (
    <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
      <div className="bk-card" style={{ padding: '1rem', flex: '1 1 280px', minWidth: 240, maxWidth: 360 }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <FolderOpen size={16} /> Kho tài liệu
        </div>
        {storages.length === 0 ? (
          <div style={{ padding: '1rem 0', textAlign: 'center', fontSize: '0.82rem', color: 'var(--bk-text-muted)' }}>
            Chưa có cấu hình lưu trữ
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {storages.map(s => (
              <div key={s.id} onClick={() => selectStorage(s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.55rem 0.65rem', borderRadius: 'var(--bk-radius-sm)', cursor: 'pointer',
                  background: selectedStorage?.id === s.id ? 'var(--bk-primary)' : 'var(--bk-surface-hover)',
                  color: selectedStorage?.id === s.id ? '#fff' : 'var(--bk-text)',
                }}>
                <Building size={16} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', opacity: 0.7 }}>{s.type?.toUpperCase()} · {s.host || '—'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bk-card" style={{ padding: '1.25rem', flex: '1 1 500px', minWidth: 320 }}>
        {!selectedStorage ? (
          <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--bk-text-muted)', fontSize: '0.9rem' }}>
            <FolderOpen size={40} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
            <div>Chọn kho tài liệu để quản lý quyền chia sẻ</div>
          </div>
        ) : permLoading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <Loader size={20} className="spin" />
          </div>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Building size={16} />
              {selectedStorage.name}
              <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--bk-text-secondary)', marginLeft: '0.35rem' }}>
                · {selectedStorage.type?.toUpperCase()}
              </span>
            </div>

            {/* Department permissions */}
            <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--bk-primary)', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Building size={14} /> Phòng ban được chia sẻ
            </h4>

            {deptPerms.length === 0 ? (
              <div style={{ padding: '0.75rem', fontSize: '0.82rem', color: 'var(--bk-text-muted)', background: 'var(--bk-surface-hover)', borderRadius: 'var(--bk-radius-sm)', marginBottom: '0.75rem' }}>
                Chưa có phòng ban nào được cấp quyền
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
                {deptPerms.map(p => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    padding: '0.3rem 0.5rem 0.3rem 0.65rem',
                    background: '#eef2ff', borderRadius: '99px',
                    border: '1px solid #c7d2fe', fontSize: '0.78rem',
                    fontWeight: 500, color: '#4338ca',
                  }}>
                    <Building size={12} />
                    {p.department_name || p.department}
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 600, marginLeft: '0.15rem',
                      color: p.permission === 'write' ? '#16a34a' : '#64748b',
                    }}>
                      ({p.permission === 'write' ? 'Ghi' : 'Đọc'})
                    </span>
                    <button onClick={() => removePerm(p.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px', display: 'flex' }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add department permission */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <select value={newDept} onChange={e => setNewDept(e.target.value)}
                style={{
                  flex: 1, minWidth: 140, padding: '0.4rem 0.5rem', borderRadius: '6px',
                  border: '1px solid var(--bk-border)', fontSize: '0.8rem', fontFamily: 'inherit',
                  background: 'var(--bk-surface)',
                }}>
                <option value="">Chọn phòng ban...</option>
                {availDepts.map(d => <option key={d.id || d.name} value={d.name}>{d.name}</option>)}
              </select>
              <select value={newPerm} onChange={e => setNewPerm(e.target.value)}
                style={{
                  padding: '0.4rem 0.5rem', borderRadius: '6px',
                  border: '1px solid var(--bk-border)', fontSize: '0.8rem', fontFamily: 'inherit',
                  background: 'var(--bk-surface)',
                }}>
                <option value="read">Đọc</option>
                <option value="write">Ghi</option>
              </select>
              <button className="bk-btn bk-btn-primary" style={{ height: '32px', whiteSpace: 'nowrap' }}
                onClick={addDepartmentPerm} disabled={!newDept || adding}>
                {adding ? <Loader size={14} className="spin" /> : <Plus size={14} />}
                Thêm
              </button>
            </div>

            {/* Other permissions */}
            {otherPerms.length > 0 && (
              <>
                <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--bk-text-secondary)', margin: '0 0 0.5rem' }}>
                  Quyền khác
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {otherPerms.map(p => (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.4rem 0.6rem', background: 'var(--bk-surface-hover)',
                      borderRadius: 'var(--bk-radius-sm)', fontSize: '0.8rem',
                    }}>
                      <User size={14} style={{ color: 'var(--bk-text-muted)' }} />
                      <span style={{ flex: 1 }}>
                        {p.role && <span>Vai trò: <strong>{p.role}</strong></span>}
                        {p.employee_code && <span>NV: <strong>{p.employee_code}</strong></span>}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--bk-text-muted)' }}>
                        {p.folder_path} · {p.permission === 'write' ? 'Ghi' : 'Đọc'}
                      </span>
                      <button onClick={() => removePerm(p.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ─── Tab 3: User Roles ─── */

function UserRolesTab({ apiUrl, saveMsg, setSaveMsg }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [savingRole, setSavingRole] = useState(null)

  const adminCode = sessionStorage.getItem('user_code') || ''

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/users'))
      const data = await res.json()
      if (res.ok) setUsers(data.data || [])
    } catch (_) {} finally { setLoading(false) }
  }, [apiUrl])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function changeRole(user, newRole) {
    if (user.employee_code === adminCode) {
      setSaveMsg({ type: 'error', text: 'Không thể thay đổi role của chính mình' })
      return
    }
    setSavingRole(user.employee_code)
    try {
      const res = await fetch(apiUrl(`/role/${user.employee_code}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (res.ok) {
        setSaveMsg({ type: 'success', text: `Đã đổi role ${user.employee_code} → ${newRole}` })
        fetchUsers()
      } else {
        const d = await res.json()
        setSaveMsg({ type: 'error', text: d.detail || 'Lỗi' })
      }
    } catch (err) {
      setSaveMsg({ type: 'error', text: 'Lỗi kết nối' })
    } finally { setSavingRole(null) }
  }

  const roleColors = { admin: '#dc2626', head: '#2563eb', user: '#64748b' }
  const roleLabels = { admin: 'Admin', head: 'Trưởng phòng', user: 'Nhân viên' }

  const filtered = users.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return (u.employee_code || '').toLowerCase().includes(q)
      || (u.full_name || '').toLowerCase().includes(q)
      || (u.department || '').toLowerCase().includes(q)
  })

  return (
    <div className="bk-card" style={{ padding: '1.25rem', maxWidth: 800 }}>
      <div className="bk-form-group" style={{ marginBottom: '0.75rem', position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--bk-text-muted)' }} />
        <input className="bk-form-input" placeholder="Tìm kiếm người dùng..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ paddingLeft: '1.8rem', height: '34px', fontSize: '0.85rem' }} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--bk-text-muted)' }}>
          <Loader size={20} className="spin" />
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--bk-border)' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.65rem', fontWeight: 700, color: 'var(--bk-text-secondary)' }}>NV</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.65rem', fontWeight: 700, color: 'var(--bk-text-secondary)' }}>Họ tên</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.65rem', fontWeight: 700, color: 'var(--bk-text-secondary)' }}>Phòng ban</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.65rem', fontWeight: 700, color: 'var(--bk-text-secondary)' }}>Vai trò</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0.65rem', fontWeight: 700, color: 'var(--bk-text-secondary)' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.employee_code} style={{ borderBottom: '1px solid var(--bk-border)' }}>
                  <td style={{ padding: '0.55rem 0.65rem', fontWeight: 600 }}>{u.employee_code}</td>
                  <td style={{ padding: '0.55rem 0.65rem' }}>{u.full_name || '—'}</td>
                  <td style={{ padding: '0.55rem 0.65rem', color: 'var(--bk-text-secondary)' }}>{u.department || '—'}</td>
                  <td style={{ padding: '0.55rem 0.65rem' }}>
                    <span style={{
                      display: 'inline-block', padding: '0.2rem 0.55rem', borderRadius: '99px',
                      fontSize: '0.72rem', fontWeight: 600,
                      background: u.role === 'admin' ? '#fef2f2' : u.role === 'head' ? '#eff6ff' : '#f1f5f9',
                      color: roleColors[u.role],
                    }}>
                      {roleLabels[u.role]}
                    </span>
                  </td>
                  <td style={{ padding: '0.55rem 0.65rem', textAlign: 'right' }}>
                    <select value={u.role} onChange={e => changeRole(u, e.target.value)}
                      disabled={savingRole === u.employee_code || u.employee_code === adminCode}
                      style={{
                        padding: '0.3rem 0.5rem', borderRadius: '6px',
                        border: '1px solid var(--bk-border)', fontSize: '0.78rem',
                        fontFamily: 'inherit', cursor: 'pointer',
                        background: u.employee_code === adminCode ? 'var(--bk-surface-hover)' : 'var(--bk-surface)',
                        color: u.employee_code === adminCode ? 'var(--bk-text-muted)' : 'var(--bk-text)',
                      }}>
                      <option value="user">Nhân viên</option>
                      <option value="head">Trưởng phòng</option>
                      <option value="admin">Admin</option>
                    </select>
                    {u.employee_code === adminCode && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--bk-text-muted)', marginLeft: '0.35rem' }}>(Bạn)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
