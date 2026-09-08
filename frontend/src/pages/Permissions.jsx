import React, { useState, useEffect, useCallback } from 'react'
import {
  Shield, Search, Save, Loader, User, Check, X,
  Users, BookOpen, FolderOpen, Building, Trash2, Plus, ChevronDown, CheckSquare, Square
} from 'lucide-react'
import '../styles/booking.css'
import './Permissions.css'
import { PERM_KEYS, PERM_LABELS, EXTRA_PERMS, ALL_PERM_INFO, toPermObject, resolveEffectivePermissions } from '../utils/permission'
import { getApiBase } from '../services/api'

const MODULES = [
  { key: 'employees', label: 'Nhân viên', group: 'admin', desc: 'Quản lý thông tin nhân viên (xem, thêm, sửa)' },
  { key: 'employees.import', label: 'NV — Import Excel', group: 'admin', desc: 'Cho phép import nhân viên từ file Excel' },
  { key: 'employees.delete', label: 'NV — Xóa', group: 'admin', desc: 'Cho phép xóa nhân viên' },
  { key: 'equipment', label: 'Thiết bị', group: 'admin', desc: 'Quản lý tài sản thiết bị' },
  { key: 'licenses', label: 'License Keys', group: 'admin', desc: 'Quản lý bản quyền phần mềm' },
  { key: 'workflows', label: 'Quy trình', group: 'admin', desc: 'Tạo quy trình phê duyệt' },
  { key: 'salary-admin', label: 'Quản lý lương', group: 'admin', desc: 'Import & xuất phiếu lương' },
  { key: 'todos', label: 'Công việc (Todos)', group: 'support', desc: 'Quản lý công việc cá nhân & phòng ban' },
  { key: 'tickets', label: 'Tickets', group: 'support', desc: 'Yêu cầu hỗ trợ IT' },
  { key: 'approvals', label: 'Phê duyệt', group: 'support', desc: 'Phê duyệt yêu cầu' },
  { key: 'bookings', label: 'Lịch (Booking)', group: 'support', desc: 'Đặt lịch xe & phòng họp' },
  { key: 'nghiphep', label: 'Nghỉ phép', group: 'support', desc: 'Đăng ký & theo dõi đơn nghỉ phép / việc' },
  { key: 'documents', label: 'Tài liệu', group: 'support', desc: 'Truy cập tài liệu dùng chung' },
  { key: 'salary', label: 'Phiếu lương', group: 'support', desc: 'Xem phiếu lương cá nhân' },
  { key: 'salary-pdf', label: 'Tải PDF lương', group: 'support', desc: 'Cho phép tải PDF phiếu lương' },
  { key: 'dashboard', label: 'Dashboard', group: 'support', desc: 'Quyền truy cập trang Dashboard (Mặc định: Tất cả)' },
  { key: 'announcements', label: 'Tạo thông báo Dashboard', group: 'support', desc: 'Tạo / sửa / xóa thông báo trên Dashboard. Mặc định: Admin & Trưởng phòng. Tick Xem hoặc Sửa để cấp cho nhân viên đặc biệt.' },
  { key: 'password-reset', label: 'Reset mật khẩu', group: 'support', desc: 'Cho phép reset mật khẩu người khác. Mặc định: Admin & Trưởng phòng. Tick Xem hoặc Sửa để cấp cho nhân viên đặc biệt.' },
  { key: 'drawio', label: 'Vẽ sơ đồ (Draw.io)', group: 'support', desc: 'Truy cập công cụ vẽ sơ đồ Draw.io' },
]

const ADMIN_MODULES = new Set(MODULES.filter(m => m.group === 'admin').map(m => m.key))

export default function Permissions() {
  const [activeTab, setActiveTab] = useState('modules')
  const [saveMsg, setSaveMsg] = useState(null)

  const adminCode = sessionStorage.getItem('user_code') || ''
  const token = sessionStorage.getItem('token') || ''
  const userRole = sessionStorage.getItem('user_role') || ''
  const apiBase = `${getApiBase()}/auth`

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
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [targetType, setTargetType] = useState(null)
  const [selectedRole, setSelectedRole] = useState(null)
  const [selectedDept, setSelectedDept] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [permissions, setPermissions] = useState({})
  const [rolePermissions, setRolePermissions] = useState({})
  const [deptPermissions, setDeptPermissions] = useState({})
  const [userOverrides, setUserOverrides] = useState({})
  const [permLoading, setPermLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('all')
  const [expandedSection, setExpandedSection] = useState('roles')

  const adminCode = sessionStorage.getItem('user_code') || ''
  const token = sessionStorage.getItem('token') || ''
  const role = sessionStorage.getItem('user_role') || ''

  const qp = new URLSearchParams({ admin_code: adminCode, token, role })
  const authQ = `?${qp}`
  const authQRole = new URLSearchParams({ admin_code: adminCode, token, admin_role: role })

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const [uRes, dRes] = await Promise.all([
        fetch(apiUrl('/users')),
        fetch(`${getApiBase()}/employees/departments/list`),
      ])
      const uData = await uRes.json()
      const dData = await dRes.json()
      if (uRes.ok) setUsers(uData.data || [])
      if (dRes.ok) setDepartments(dData.data || [])
    } catch (_) {} finally { setLoading(false) }
  }, [apiUrl])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  function buildPermBody(perms) {
    return MODULES.map(m => ({
      module: m.key,
      can_view: !!(perms[m.key]?.can_view),
      can_edit: !!(perms[m.key]?.can_edit),
    }))
  }

  async function selectRole(r) {
    setTargetType('role')
    setSelectedRole(r)
    setSelectedDept(null)
    setSelectedUser(null)
    setSaveMsg(null)
    setPermLoading(true)
    try {
      const res = await fetch(`${apiBase}/permissions/role/${r}?${authQRole}`)
      const data = await res.json()
      if (res.ok) setPermissions(data.data || {})
    } catch (_) { setPermissions({}) }
    finally { setPermLoading(false) }
  }

  async function selectDept(dept) {
    setTargetType('department')
    setSelectedDept(dept)
    setSelectedRole(null)
    setSelectedUser(null)
    setSaveMsg(null)
    setPermLoading(true)
    try {
      const res = await fetch(`${apiBase}/permissions/department/${encodeURIComponent(dept.name)}?${authQRole}`)
      const data = await res.json()
      if (res.ok) setPermissions(data.data || {})
    } catch (_) { setPermissions({}) }
    finally { setPermLoading(false) }
  }

  async function selectUser(user) {
    setTargetType('individual')
    setSelectedUser(user)
    setSelectedRole(null)
    setSelectedDept(null)
    setSaveMsg(null)
    setPermLoading(true)
    try {
      const res = await fetch(`${apiBase}/permissions/${user.employee_code}${authQ}`)
      const data = await res.json()
      if (res.ok) {
        setPermissions(data.data || {})
        setRolePermissions(data.role_permissions || {})
        setDeptPermissions(data.department_permissions || {})
        setUserOverrides(data.user_overrides || {})
      } else {
        setPermissions({})
        setRolePermissions({})
        setDeptPermissions({})
        setUserOverrides({})
      }
    } catch (_) {
      setPermissions({})
      setRolePermissions({})
      setDeptPermissions({})
      setUserOverrides({})
    }
    finally { setPermLoading(false) }
  }

  function togglePerm(moduleKey, field) {
    if (targetType === 'individual') {
      setUserOverrides(prev => {
        const existing = prev[moduleKey] || { can_view: false, can_edit: false }
        const updated = { ...existing, [field]: !existing[field] }
        if (field === 'can_edit' && updated.can_edit) updated.can_view = true
        if (field === 'can_view' && !updated.can_view) updated.can_edit = false
        return { ...prev, [moduleKey]: updated }
      })
      setPermissions(prev => {
        const u = userOverrides[moduleKey] || {}
        const nu = { ...u, [field]: !u[field] }
        if (field === 'can_edit' && nu.can_edit) nu.can_view = true
        if (field === 'can_view' && !nu.can_view) nu.can_edit = false
        return {
          ...prev,
          [moduleKey]: {
            can_view: nu.can_view,
            can_edit: nu.can_edit,
          }
        }
      })
    } else {
      setPermissions(prev => {
        const current = prev[moduleKey] || { can_view: false, can_edit: false }
        const updated = { ...current, [field]: !current[field] }
        if (field === 'can_edit' && updated.can_edit) updated.can_view = true
        if (field === 'can_view' && !updated.can_view) updated.can_edit = false
        return { ...prev, [moduleKey]: updated }
      })
    }
  }

  function selectAll(val) {
    const updated = {}
    MODULES.forEach(m => {
      const isA = ADMIN_MODULES.has(m.key)
      updated[m.key] = { can_view: val, can_edit: isA ? false : val }
    })
    setPermissions(updated)
    if (targetType === 'individual') {
      setUserOverrides(updated)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      let url, body
      if (targetType === 'role') {
        url = `${apiBase}/permissions/role/${selectedRole}?${authQRole}`
        body = buildPermBody(permissions)
      } else if (targetType === 'department') {
        url = `${apiBase}/permissions/department/${encodeURIComponent(selectedDept.name)}?${authQRole}`
        body = buildPermBody(permissions)
      } else {
        url = `${apiBase}/permissions/${selectedUser.employee_code}${authQ}`
        body = Object.entries(userOverrides).map(([k, v]) => ({
          module: k,
          can_view: !!v.can_view,
          can_edit: !!v.can_edit,
        }))
      }
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setSaveMsg({ type: 'success', text: 'Đã lưu phân quyền hệ thống thành công' })
        if (targetType === 'individual') {
          const r = await fetch(`${apiBase}/permissions/${selectedUser.employee_code}${authQ}`)
          const data = await r.json()
          if (r.ok) {
            setPermissions(data.data || {})
            setRolePermissions(data.role_permissions || {})
            setDeptPermissions(data.department_permissions || {})
            setUserOverrides(data.user_overrides || {})
          }
        }
      } else {
        const d = await res.json()
        setSaveMsg({ type: 'error', text: d.detail || 'Lỗi khi lưu phân quyền' })
      }
    } catch (err) {
      setSaveMsg({ type: 'error', text: 'Lỗi kết nối máy chủ' })
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

  const roleList = [
    { key: 'admin', label: 'Admin', color: '#dc2626' },
    { key: 'head', label: 'Trưởng phòng', color: '#2563eb' },
    { key: 'user', label: 'Nhân viên', color: '#64748b' },
  ]

  return (
    <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
      {/* ── Left Sidebar ── */}
      <div className="bk-card" style={{ padding: '0.75rem', flex: '1 1 300px', minWidth: 260, maxWidth: 400 }}>
        {loading ? (
          <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--bk-text-muted)' }}>
            <Loader size={20} className="spin" />
            <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Đang tải danh sách...</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '520px', overflowY: 'auto' }}>
            {/* ── Roles ── */}
            <div>
              <div onClick={() => setExpandedSection(expandedSection === 'roles' ? null : 'roles')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.5rem', cursor: 'pointer', borderRadius: 'var(--bk-radius-sm)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--bk-text-secondary)', background: 'var(--bk-surface-hover)' }}>
                <Shield size={14} />
                <span style={{ flex: 1 }}>Vai trò</span>
                <ChevronDown size={14} style={{ transform: expandedSection === 'roles' ? 'rotate(180deg)' : '', transition: 'transform 0.15s' }} />
              </div>
              {expandedSection === 'roles' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.25rem', paddingLeft: '0.25rem' }}>
                  {roleList.map(r => (
                    <div key={r.key} onClick={() => selectRole(r.key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 0.6rem',
                        borderRadius: 'var(--bk-radius-sm)', cursor: 'pointer', fontSize: '0.82rem',
                        background: selectedRole === r.key && targetType === 'role' ? 'var(--bk-primary)' : 'var(--bk-surface-hover)',
                        color: selectedRole === r.key && targetType === 'role' ? '#fff' : 'var(--bk-text)',
                      }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 600 }}>{r.label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.7rem', opacity: 0.6 }}>{r.key}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Departments ── */}
            <div>
              <div onClick={() => setExpandedSection(expandedSection === 'departments' ? null : 'departments')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.5rem', cursor: 'pointer', borderRadius: 'var(--bk-radius-sm)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--bk-text-secondary)', background: 'var(--bk-surface-hover)' }}>
                <Building size={14} />
                <span style={{ flex: 1 }}>Phòng ban</span>
                <ChevronDown size={14} style={{ transform: expandedSection === 'departments' ? 'rotate(180deg)' : '', transition: 'transform 0.15s' }} />
              </div>
              {expandedSection === 'departments' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.25rem', paddingLeft: '0.25rem' }}>
                  {departments.length === 0 ? (
                    <div style={{ padding: '0.5rem', fontSize: '0.78rem', color: 'var(--bk-text-muted)', textAlign: 'center' }}>Không có phòng ban</div>
                  ) : departments.map(d => (
                    <div key={d.name} onClick={() => selectDept(d)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 0.6rem',
                        borderRadius: 'var(--bk-radius-sm)', cursor: 'pointer', fontSize: '0.82rem',
                        background: selectedDept?.name === d.name && targetType === 'department' ? 'var(--bk-primary)' : 'var(--bk-surface-hover)',
                        color: selectedDept?.name === d.name && targetType === 'department' ? '#fff' : 'var(--bk-text)',
                      }}>
                      <Building size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
                      <span style={{ fontWeight: 600 }}>{d.name}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.68rem', opacity: 0.6 }}>{d.emp_count || 0}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Individuals ── */}
            <div>
              <div onClick={() => setExpandedSection(expandedSection === 'individuals' ? null : 'individuals')}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.5rem', cursor: 'pointer', borderRadius: 'var(--bk-radius-sm)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--bk-text-secondary)', background: 'var(--bk-surface-hover)' }}>
                <User size={14} />
                <span style={{ flex: 1 }}>Cá nhân</span>
                <ChevronDown size={14} style={{ transform: expandedSection === 'individuals' ? 'rotate(180deg)' : '', transition: 'transform 0.15s' }} />
              </div>
              {expandedSection === 'individuals' && (
                <>
                  <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.25rem', marginBottom: '0.3rem' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <Search size={13} style={{ position: 'absolute', left: '0.45rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--bk-text-muted)' }} />
                      <input className="bk-form-input" placeholder="Tìm kiếm..." value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ paddingLeft: '1.5rem', height: '30px', fontSize: '0.78rem' }} />
                    </div>
                    <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
                      className="bk-form-input" style={{ width: 'auto', height: '30px', fontSize: '0.75rem' }}>
                      <option value="all">All</option>
                      <option value="admin">Admin</option>
                      <option value="head">TP</option>
                      <option value="user">NV</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', paddingLeft: '0.25rem' }}>
                    {filtered.length === 0 ? (
                      <div style={{ padding: '0.5rem', fontSize: '0.78rem', color: 'var(--bk-text-muted)', textAlign: 'center' }}>Không tìm thấy</div>
                    ) : filtered.map(u => (
                      <div key={u.employee_code} onClick={() => selectUser(u)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 0.6rem',
                          borderRadius: 'var(--bk-radius-sm)', cursor: 'pointer',
                          background: selectedUser?.employee_code === u.employee_code && targetType === 'individual' ? 'var(--bk-primary)' : 'var(--bk-surface-hover)',
                          color: selectedUser?.employee_code === u.employee_code && targetType === 'individual' ? '#fff' : 'var(--bk-text)',
                        }}>
                        <User size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {u.full_name || u.employee_code}
                          </div>
                          <div style={{ fontSize: '0.7rem', opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {u.employee_code} · {u.department || '—'}
                          </div>
                        </div>
                        <span style={{
                          fontSize: '0.65rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: '99px',
                          background: selectedUser?.employee_code === u.employee_code && targetType === 'individual' ? 'rgba(255,255,255,0.2)' : 'var(--bk-surface)',
                          color: selectedUser?.employee_code === u.employee_code && targetType === 'individual' ? '#fff' : 'var(--bk-text-muted)',
                          flexShrink: 0,
                        }}>
                          {u.role === 'admin' ? 'Admin' : u.role === 'head' ? 'TP' : 'NV'}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Right Panel ── */}
      <div className="bk-card" style={{ padding: '1.25rem', flex: '1 1 520px', minWidth: 340 }}>
        {!targetType ? (
          <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--bk-text-muted)', fontSize: '0.9rem' }}>
            <Shield size={40} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
            <div>Chọn Vai trò, Phòng ban hoặc Cá nhân để phân quyền</div>
          </div>
        ) : permLoading ? (
          <div style={{ padding: '2rem 0', textAlign: 'center' }}>
            <Loader size={24} className="spin" style={{ marginBottom: '0.5rem' }} />
            <div style={{ fontSize: '0.85rem', color: 'var(--bk-text-muted)' }}>Đang tải dữ liệu phân quyền...</div>
          </div>
        ) : (
          <>
            {/* ── Header ── */}
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                {targetType === 'role' && (
                  <>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--bk-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Shield size={16} />
                      {roleList.find(r => r.key === selectedRole)?.label}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--bk-text-secondary)', marginTop: '0.15rem' }}>
                      Phân quyền mặc định cho tất cả {roleList.find(r => r.key === selectedRole)?.label}
                    </div>
                  </>
                )}
                {targetType === 'department' && (
                  <>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--bk-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Building size={16} />
                      {selectedDept?.name}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--bk-text-secondary)', marginTop: '0.15rem' }}>
                      Phân quyền cho phòng ban · {selectedDept?.head_name ? `TP: ${selectedDept.head_name}` : ''}
                    </div>
                  </>
                )}
                {targetType === 'individual' && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--bk-text)' }}>
                      {selectedUser.full_name || selectedUser.employee_code}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--bk-text-secondary)', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span>{selectedUser.employee_code} · {selectedUser.department || '—'}</span>
                      <span style={{ padding: '0.15rem 0.45rem', borderRadius: '99px', background: 'var(--bk-surface)', fontSize: '0.7rem', fontWeight: 600 }}>
                        {selectedUser.role === 'admin' ? 'Admin' : selectedUser.role === 'head' ? 'Trưởng phòng' : 'Nhân viên'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Nút chọn nhanh */}
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button type="button" onClick={() => selectAll(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid var(--bk-border)', background: 'var(--bk-surface)', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--bk-text)' }}>
                  <CheckSquare size={13} /> Chọn tất cả
                </button>
                <button type="button" onClick={() => selectAll(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid var(--bk-border)', background: 'var(--bk-surface)', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--bk-text)' }}>
                  <Square size={13} /> Bỏ chọn tất cả
                </button>
              </div>
            </div>

            {/* ── Permission grid: Admin mods ── */}
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--bk-danger)', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Shield size={14} /> Quản trị
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.4rem' }}>
                {adminMods.map(m => (
                  <ModulePermCard key={m.key} mod={m} permissions={permissions}
                    togglePerm={togglePerm} targetType={targetType}
                    rolePerms={rolePermissions} deptPerms={deptPermissions}
                    userOverrides={userOverrides} selectedUser={selectedUser} />
                ))}
              </div>
            </div>

            {/* ── Permission grid: Support mods ── */}
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--bk-primary)', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <BookOpen size={14} /> Nghiệp vụ
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.4rem' }}>
                {supportMods.map(m => (
                  <ModulePermCard key={m.key} mod={m} permissions={permissions}
                    togglePerm={togglePerm} targetType={targetType}
                    rolePerms={rolePermissions} deptPerms={deptPermissions}
                    userOverrides={userOverrides} selectedUser={selectedUser} />
                ))}
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

function ModulePermCard({ mod, permissions, togglePerm, targetType, rolePerms, deptPerms, userOverrides, selectedUser }) {
  const perm = permissions[mod.key] || { can_view: false, can_edit: false }
  const isAdminMod = ADMIN_MODULES.has(mod.key)

  const rp = rolePerms?.[mod.key]
  const dp = deptPerms?.[mod.key]
  const up = userOverrides?.[mod.key]

  let inheritBadge = null
  if (targetType === 'individual' && selectedUser) {
    if (up) {
      inheritBadge = { label: 'Ghi đè', color: '#7c3aed', bg: '#f5f3ff' }
    } else if (dp) {
      inheritBadge = { label: `PB: ${selectedUser.department || ''}`, color: '#2563eb', bg: '#eff6ff' }
    } else if (rp) {
      inheritBadge = { label: `Role: ${selectedUser.role || ''}`, color: '#64748b', bg: '#f1f5f9' }
    }
  }

  return (
    <div style={{
      padding: '0.5rem 0.65rem',
      background: 'var(--bk-surface-hover)',
      borderRadius: 'var(--bk-radius-sm)',
      border: '1px solid var(--bk-border)',
      position: 'relative',
    }}>
      <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.35rem', color: 'var(--bk-text)', display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
        {mod.label}
        {inheritBadge && (
          <span style={{
            fontSize: '0.6rem', padding: '0.05rem 0.35rem', borderRadius: '99px',
            background: inheritBadge.bg, color: inheritBadge.color, fontWeight: 600,
            whiteSpace: 'nowrap',
          }}>{inheritBadge.label}</span>
        )}
      </div>
      {mod.desc && (
        <div style={{ fontSize: '0.68rem', color: 'var(--bk-text-muted)', marginBottom: '0.35rem', lineHeight: 1.35 }}>
          {mod.desc}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem', cursor: 'pointer', color: 'var(--bk-text-secondary)' }}>
          <input type="checkbox" checked={!!perm.can_view}
            onChange={() => togglePerm(mod.key, 'can_view')}
            style={{ accentColor: 'var(--bk-primary)' }} />
          Xem
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem', cursor: 'pointer',
          color: isAdminMod && targetType === 'role' ? 'var(--bk-text-muted)' : 'var(--bk-text-secondary)' }}>
          <input type="checkbox" checked={!!perm.can_edit}
            onChange={() => togglePerm(mod.key, 'can_edit')}
            style={{ accentColor: 'var(--bk-primary)' }}
            disabled={isAdminMod && targetType === 'role'} />
          Sửa
        </label>
      </div>
    </div>
  )
}

/* ─── Tab 2 & 3 Giữ Nguyên Logic Chuẩn ─── */

function PermissionRow({ title, subtitle, icon: Icon, isExpanded, onToggle, onDelete, values = {}, inheritedState = {}, onChange, isGlobal }) {
  const allKeys = [...Object.keys(PERM_LABELS), ...Object.keys(EXTRA_PERMS)]

  return (
    <div className={`pq-row${isExpanded ? ' open' : ''}`}>
      <div className="pq-row-header" onClick={onToggle}>
        <div className="pq-row-icon"><Icon size={16} /></div>
        <div className="pq-row-info">
          <div className="pq-row-title">
            {title}
            {isGlobal && <span className="pq-badge-global">Đã cấp quyền</span>}
          </div>
          {subtitle && <div className="pq-row-subtitle">{subtitle}</div>}
        </div>
        {onDelete && (
          <div className="pq-row-actions">
            <button className="pq-icon-btn" title="Xóa quyền" onClick={(e) => { e.stopPropagation(); onDelete() }}>
              <Trash2 size={14} />
            </button>
          </div>
        )}
        <ChevronDown size={16} className={`pq-chevron${isExpanded ? ' open' : ''}`} />
      </div>

      {isExpanded && (
        <div className="pq-row-body">
          <div className="pq-perm-grid">
            {allKeys.map(k => {
              const info = ALL_PERM_INFO[k]
              const isInherited = Boolean(inheritedState[k])
              const isChecked = Boolean(values[k]) || isInherited

              return (
                <label key={k} title={info.desc}
                  className={`pq-perm-item${isChecked ? ' on' : ''}${isInherited ? ' inherited' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isInherited}
                    onChange={() => !isInherited && onChange(k)}
                  />
                  {info.label}
                  {isInherited && <span className="pq-badge-inherited">Kế thừa</span>}
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function DocumentPermissionsTab({ saveMsg, setSaveMsg }) {
  const [storages, setStorages] = useState([])
  const [selectedStorage, setSelectedStorage] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [permLoading, setPermLoading] = useState(false)

  const [everyonePerms, setEveryonePerms] = useState({ can_read: true, allow_download: true })
  const [everyoneExists, setEveryoneExists] = useState(false)

  const [deptSearch, setDeptSearch] = useState('')
  const [newDept, setNewDept] = useState('')
  const [deptPerms, setDeptPerms] = useState({ can_read: true, allow_download: true })
  const [saving, setSaving] = useState(false)
  const [expandedPerm, setExpandedPerm] = useState(null)
  const [showAddDept, setShowAddDept] = useState(false)
  const [showAddUser, setShowAddUser] = useState(false)

  const [users, setUsers] = useState([])
  const [userSearch, setUserSearch] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [userPerms, setUserPerms] = useState({ can_read: true, can_upload: true, allow_download: true })

  const userCode = sessionStorage.getItem('user_code') || ''
  const token = sessionStorage.getItem('token') || ''
  const role = sessionStorage.getItem('user_role') || ''
  const adminCode = userCode

  function apiParams() {
    return new URLSearchParams({ admin_code: adminCode, token, role })
  }

  useEffect(() => {
    Promise.all([
      fetch(`${getApiBase()}/documents/config?user_code=${userCode}&user_role=${role}`).then(r => r.json()),
      fetch(`${getApiBase()}/documents/departments`).then(r => r.json()),
      fetch(`${getApiBase()}/auth/users?${apiParams()}`).then(r => r.json()),
    ]).then(([sRes, dRes, uRes]) => {
      if (sRes.data) setStorages(sRes.data)
      if (dRes.data) setDepartments(dRes.data)
      if (uRes.data) setUsers(uRes.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [userCode, role])

  async function loadPermissions(storageId) {
    setPermLoading(true)
    try {
      const res = await fetch(`${getApiBase()}/documents/permissions/${storageId}?${apiParams()}`)
      const data = await res.json()
      setPermissions(data.data || [])
    } catch (_) { setPermissions([]) }
    finally { setPermLoading(false) }
  }

  function selectStorage(s) {
    setSelectedStorage(s)
    setEveryoneExists(false)
    setEveryonePerms({ can_read: true, allow_download: true })
    setDeptSearch('')
    setNewDept('')
    setDeptPerms({ can_read: true, allow_download: true })
    setUserSearch('')
    setSelectedEmployee('')
    setUserPerms({ can_read: true, can_upload: true, allow_download: true })
    loadPermissions(s.id)
  }

  useEffect(() => {
    const everyone = permissions.find(p => p.target_type === 'EVERYONE')
    if (everyone) {
      setEveryoneExists(true)
      setEveryonePerms({
        can_read: Boolean(everyone.can_read),
        can_write: Boolean(everyone.can_write),
        can_edit: Boolean(everyone.can_edit),
        can_delete: Boolean(everyone.can_delete),
        allow_download: Boolean(everyone.allow_download),
        can_reshare: Boolean(everyone.can_reshare),
        can_upload: Boolean(everyone.can_upload),
      })
    } else {
      setEveryoneExists(false)
      setEveryonePerms({ can_read: true, allow_download: true })
    }
  }, [permissions])

  const deptPermsList = permissions.filter(p => p.target_type === 'DEPARTMENT' && !p.role && !p.employee_code)
  const userPermsList = permissions.filter(p => p.target_type === 'USER' || (p.employee_code && !p.role))
  const rolePermsList = permissions.filter(p => p.role && !p.employee_code)
  const usedDepts = new Set(deptPermsList.map(p => p.department))
  const availDepts = departments.filter(d => !usedDepts.has(d.name))
    .filter(d => !deptSearch || d.name.toLowerCase().includes(deptSearch.toLowerCase()))
  const usedUsers = new Set(userPermsList.map(p => p.employee_code))
  const availUsers = users.filter(u => !usedUsers.has(u.employee_code))
    .filter(u => !userSearch
      || (u.full_name || '').toLowerCase().includes(userSearch.toLowerCase())
      || (u.employee_code || '').toLowerCase().includes(userSearch.toLowerCase()))

  async function saveEveryone() {
    if (!selectedStorage) return
    setSaving(true)
    try {
      const body = {
        storage_id: selectedStorage.id,
        folder_path: '/',
        target_type: 'EVERYONE',
        can_read: Boolean(everyonePerms.can_read),
        can_write: Boolean(everyonePerms.can_write),
        can_edit: Boolean(everyonePerms.can_edit),
        can_delete: Boolean(everyonePerms.can_delete),
        allow_download: Boolean(everyonePerms.allow_download),
        can_reshare: Boolean(everyonePerms.can_reshare),
        can_upload: Boolean(everyonePerms.can_upload),
      }
      const res = await fetch(`${getApiBase()}/documents/permissions/share?${apiParams()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setSaveMsg({ type: 'success', text: 'Đã cập nhật quyền cho Tất cả nhân viên' })
        await loadPermissions(selectedStorage.id)
      } else {
        const d = await res.json().catch(() => ({}))
        setSaveMsg({ type: 'error', text: d.detail || d.message || 'Lỗi máy chủ' })
      }
    } catch (err) { setSaveMsg({ type: 'error', text: `Lỗi kết nối: ${err.message}` }) }
    finally { setSaving(false) }
  }

  async function addDepartmentPerm() {
    if (!newDept || !selectedStorage) return
    setSaving(true)
    try {
      const body = {
        storage_id: selectedStorage.id,
        folder_path: '/',
        target_type: 'DEPARTMENT',
        department: newDept,
        ...deptPerms,
      }
      const res = await fetch(`${getApiBase()}/documents/permissions/share?${apiParams()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setSaveMsg({ type: 'success', text: `Đã cập nhật quyền cho ${newDept}` })
        loadPermissions(selectedStorage.id)
        setNewDept('')
        setDeptSearch('')
        setDeptPerms({ can_read: true, allow_download: true })
      } else {
        const d = await res.json().catch(() => ({}))
        setSaveMsg({ type: 'error', text: d.detail || d.message || 'Lỗi máy chủ' })
      }
    } catch (err) { setSaveMsg({ type: 'error', text: `Lỗi kết nối: ${err.message}` }) }
    finally { setSaving(false) }
  }

  async function addUserPerm() {
    if (!selectedEmployee || !selectedStorage) return
    setSaving(true)
    try {
      const body = {
        storage_id: selectedStorage.id,
        folder_path: '/',
        target_type: 'USER',
        employee_code: selectedEmployee,
        ...userPerms,
      }
      const res = await fetch(`${getApiBase()}/documents/permissions/share?${apiParams()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const u = users.find(x => x.employee_code === selectedEmployee)
        setSaveMsg({ type: 'success', text: `Đã cấp quyền cho ${u?.full_name || selectedEmployee}` })
        loadPermissions(selectedStorage.id)
        setUserSearch('')
        setSelectedEmployee('')
        setUserPerms({ can_read: true, can_upload: true, allow_download: true })
      } else {
        const d = await res.json().catch(() => ({}))
        setSaveMsg({ type: 'error', text: d.detail || d.message || 'Lỗi máy chủ' })
      }
    } catch (err) { setSaveMsg({ type: 'error', text: `Lỗi kết nối: ${err.message}` }) }
    finally { setSaving(false) }
  }

  async function updateDeptPerm(perm, field) {
    const newVal = !perm[field]
    try {
      const res = await fetch(`${getApiBase()}/documents/permissions/${perm.id}?${apiParams()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: newVal }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setSaveMsg({ type: 'error', text: d.detail || d.message || 'Lỗi cập nhật quyền' })
      }
      loadPermissions(selectedStorage.id)
    } catch (err) { setSaveMsg({ type: 'error', text: `Lỗi kết nối: ${err.message}` }) }
  }

  async function removePerm(permId) {
    if (!window.confirm('Xóa quyền này?')) return
    try {
      const res = await fetch(`${getApiBase()}/documents/permissions/${permId}?${apiParams()}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setSaveMsg({ type: 'error', text: d.detail || d.message || 'Lỗi xóa quyền' })
      }
      loadPermissions(selectedStorage.id)
    } catch (err) { setSaveMsg({ type: 'error', text: `Lỗi kết nối: ${err.message}` }) }
  }

  if (loading) {
    return <div className="pq-loading"><Loader size={20} className="spin" /></div>
  }

  const everyoneRow = permissions.find(p => p.target_type === 'EVERYONE')

  return (
    <div className="pq-wrap">
      <div className="pq-sidebar">
        <div className="pq-card">
          <div className="pq-card-title"><FolderOpen size={16} className="pq-accent" /> Kho tài liệu</div>
          {storages.length === 0 ? (
            <div className="pq-empty">Chưa có cấu hình lưu trữ</div>
          ) : (
            (() => {
              const accessibleStorages = storages.filter(s => {
                if (role === 'admin' || role === 'head') return true
                return permissions.some(p => p.storage_id === s.id && p.can_read)
              })
              return accessibleStorages.length === 0 ? (
                <div className="pq-empty danger">Bạn chưa được cấp quyền truy cập tài liệu nào.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {accessibleStorages.map(s => (
                    <div key={s.id} onClick={() => selectStorage(s)}
                      className={`pq-storage-item${selectedStorage?.id === s.id ? ' active' : ''}`}>
                      <Building size={16} className="pq-icon" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="pq-name">{s.name}</div>
                        <div className="pq-sub">{s.type?.toUpperCase()} · {s.host || '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()
          )}
        </div>
      </div>

      <div className="pq-main">
        <div className="pq-card">
          {!selectedStorage ? (
            <div className="pq-empty" style={{ padding: '2rem 0' }}>
              <FolderOpen size={40} style={{ marginBottom: '0.75rem', opacity: 0.4, display: 'block', marginLeft: 'auto', marginRight: 'auto' }} />
              <div>Chọn kho tài liệu để quản lý quyền chia sẻ</div>
            </div>
          ) : permLoading ? (
            <div className="pq-loading"><Loader size={20} className="spin" /></div>
          ) : (
            <>
              <div className="pq-header-title">
                <Building size={16} className="pq-accent" />
                {selectedStorage.name}
                <span className="pq-muted">· {selectedStorage.type?.toUpperCase()}</span>
              </div>

              {/* ─── KHỐI 1: TẤT CẢ NHÂN VIÊN ─── */}
              <div className="pq-section-title"><Shield size={15} className="pq-accent" /> Cấp quyền toàn cục</div>
              <PermissionRow
                title="Tất cả nhân viên"
                subtitle="Mọi nhân viên nội bộ đều được hưởng các quyền này"
                icon={Users}
                isGlobal={everyoneExists}
                isExpanded={expandedPerm === 'everyone'}
                onToggle={() => setExpandedPerm(expandedPerm === 'everyone' ? null : 'everyone')}
                onDelete={everyoneExists ? () => removePerm(everyoneRow?.id) : null}
                values={everyonePerms}
                inheritedState={{}}
                onChange={k => setEveryonePerms(p => ({ ...p, [k]: !p[k] }))}
              />
              {expandedPerm === 'everyone' && (
                <div className="pq-add-btn-row">
                  <button className="pq-btn pq-btn-primary" onClick={saveEveryone} disabled={saving}>
                    {saving ? <Loader size={13} className="spin" /> : <Save size={13} />}
                    {everyoneExists ? 'Cập nhật quyền' : 'Áp dụng cho hệ thống'}
                  </button>
                </div>
              )}

              <hr className="pq-divider" />

              {/* ─── KHỐI 2: PHÒNG BAN ─── */}
              <div className="pq-toolbar">
                <div className="pq-section-title" style={{ margin: 0 }}><Building size={15} className="pq-accent" /> Phòng ban được chia sẻ</div>
                <button className="pq-btn pq-btn-ghost" onClick={() => setShowAddDept(v => !v)}>
                  <Plus size={14} /> Thêm phòng ban
                </button>
              </div>

              {showAddDept && (
                <div className="pq-add-box">
                  <div className="pq-form-row">
                    <div className="pq-input-wrap">
                      <Search size={13} className="pq-search-ic" />
                      <input className="pq-input" style={{ paddingLeft: '1.6rem' }} placeholder="Tìm phòng ban..."
                        value={deptSearch} onChange={e => setDeptSearch(e.target.value)} />
                    </div>
                    <select className="pq-select" value={newDept} onChange={e => setNewDept(e.target.value)}>
                      <option value="">Chọn phòng ban...</option>
                      {deptSearch && !availDepts.find(d => d.name === deptSearch) && (
                        <option value={deptSearch}>+ Thêm "{deptSearch}"</option>
                      )}
                      {availDepts.map(d => <option key={d.id || d.name} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <PermissionRow
                    title="Quyền mặc định"
                    icon={Building}
                    isExpanded
                    onToggle={() => {}}
                    onDelete={null}
                    values={deptPerms}
                    inheritedState={{}}
                    onChange={k => setDeptPerms(p => ({ ...p, [k]: !p[k] }))}
                  />
                  <div className="pq-add-btn-row">
                    <button className="pq-btn pq-btn-primary" onClick={addDepartmentPerm} disabled={!newDept || saving}>
                      {saving ? <Loader size={13} className="spin" /> : <Plus size={13} />}
                      Thêm
                    </button>
                  </div>
                </div>
              )}

              {deptPermsList.length === 0 ? (
                <div className="pq-empty-state">Chưa có phòng ban nào được cấp quyền</div>
              ) : (
                deptPermsList.map(p => {
                  const inherited = resolveEffectivePermissions(everyonePerms, null, toPermObject(p)).inheritedFrom
                  return (
                    <PermissionRow
                      key={p.id}
                      title={p.department_name || p.department}
                      subtitle={p.folder_path ? `Đường dẫn: ${p.folder_path}` : `Phòng: ${p.department_name || p.department}`}
                      icon={Building}
                      isExpanded={expandedPerm === p.id}
                      onToggle={() => setExpandedPerm(expandedPerm === p.id ? null : p.id)}
                      onDelete={() => removePerm(p.id)}
                      values={toPermObject(p)}
                      inheritedState={inherited}
                      onChange={k => updateDeptPerm(p, k)}
                    />
                  )
                })
              )}

              <hr className="pq-divider" />

              {/* ─── KHỐI 3: CÁ NHÂN ─── */}
              <div className="pq-toolbar">
                <div className="pq-section-title" style={{ margin: 0 }}><User size={15} className="pq-accent" /> Cá nhân được chia sẻ</div>
                <button className="pq-btn pq-btn-ghost" onClick={() => setShowAddUser(v => !v)}>
                  <Plus size={14} /> Thêm cá nhân
                </button>
              </div>

              {showAddUser && (
                <div className="pq-add-box">
                  <div className="pq-form-row">
                    <div className="pq-input-wrap">
                      <Search size={13} className="pq-search-ic" />
                      <input className="pq-input" style={{ paddingLeft: '1.6rem' }} placeholder="Tìm theo tên hoặc mã nhân viên..."
                        value={userSearch} onChange={e => setUserSearch(e.target.value)} />
                    </div>
                    <select className="pq-select" value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}>
                      <option value="">Chọn nhân viên...</option>
                      {availUsers.map(u => (
                        <option key={u.employee_code} value={u.employee_code}>
                          {u.full_name || u.employee_code} — {u.employee_code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <PermissionRow
                    title="Quyền mặc định"
                    icon={User}
                    isExpanded
                    onToggle={() => {}}
                    onDelete={null}
                    values={userPerms}
                    inheritedState={{}}
                    onChange={k => setUserPerms(p => ({ ...p, [k]: !p[k] }))}
                  />
                  <div className="pq-add-btn-row">
                    <button className="pq-btn pq-btn-primary" onClick={addUserPerm} disabled={!selectedEmployee || saving}>
                      {saving ? <Loader size={13} className="spin" /> : <Plus size={13} />}
                      Thêm
                    </button>
                  </div>
                </div>
              )}

              {userPermsList.length === 0 ? (
                <div className="pq-empty-state">Chưa có cá nhân nào được cấp quyền</div>
              ) : (
                userPermsList.map(p => {
                  const u = users.find(x => x.employee_code === p.employee_code)
                  const deptPerm = deptPermsList.find(d => d.department === (u?.department || '')) || null
                  const { inheritedFrom } = resolveEffectivePermissions(everyonePerms, deptPerm, toPermObject(p))
                  return (
                    <PermissionRow
                      key={p.id}
                      title={u?.full_name || p.employee_code}
                      subtitle={`Mã NV: ${p.employee_code}${u?.department ? ` · Phòng: ${u.department}` : ''}`}
                      icon={User}
                      isExpanded={expandedPerm === p.id}
                      onToggle={() => setExpandedPerm(expandedPerm === p.id ? null : p.id)}
                      onDelete={() => removePerm(p.id)}
                      values={toPermObject(p)}
                      inheritedState={inheritedFrom}
                      onChange={k => updateDeptPerm(p, k)}
                    />
                  )
                })
              )}

              {rolePermsList.length > 0 && (
                <>
                  <div className="pq-section-title" style={{ color: '#64748b' }}>Quyền khác</div>
                  {rolePermsList.map(p => (
                    <div key={p.id} className="pq-row">
                      <div className="pq-row-header" style={{ cursor: 'default' }}>
                        <div className="pq-row-icon"><User size={14} /></div>
                        <div className="pq-row-info">
                          <div className="pq-row-title">Vai trò: <strong>{p.role}</strong></div>
                          <div className="pq-row-subtitle">{p.folder_path}</div>
                        </div>
                        <button className="pq-icon-btn" onClick={() => removePerm(p.id)} title="Xóa quyền">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

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