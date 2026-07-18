import React, { useState, useEffect, useCallback } from 'react'
import { Shield, Search, Save, Loader, User, Check, X as XIcon, Filter } from 'lucide-react'
import '../styles/booking.css'

const MODULES = [
  { key: 'employees', label: 'Nhân viên' },
  { key: 'equipment', label: 'Thiết bị' },
  { key: 'licenses', label: 'License Keys' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'approvals', label: 'Phê duyệt' },
  { key: 'workflows', label: 'Quy trình' },
  { key: 'bookings', label: 'Lịch' },
  { key: 'documents', label: 'Tài liệu' },
  { key: 'salary', label: 'Phiếu lương' },
  { key: 'salary-admin', label: 'Quản lý lương' },
]

export default function Permissions() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)
  const [permissions, setPermissions] = useState({})
  const [permLoading, setPermLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('all')

  const adminCode = sessionStorage.getItem('user_code') || ''
  const token = sessionStorage.getItem('token') || ''
  const role = sessionStorage.getItem('user_role') || ''

  const apiBase = '/api/auth'

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ admin_code: adminCode, token, role })
      const res = await fetch(`${apiBase}/users?${params}`)
      const data = await res.json()
      if (res.ok) setUsers(data.data || [])
    } catch (_) {} finally {
      setLoading(false)
    }
  }, [adminCode, token, role])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const fetchPermissions = useCallback(async (empCode) => {
    setPermLoading(true)
    setSaveMsg('')
    try {
      const params = new URLSearchParams({ admin_code: adminCode, token, role })
      const res = await fetch(`${apiBase}/permissions/${empCode}?${params}`)
      const data = await res.json()
      if (res.ok) setPermissions(data.data || {})
      else setPermissions({})
    } catch (_) {
      setPermissions({})
    } finally {
      setPermLoading(false)
    }
  }, [adminCode, token, role])

  function selectUser(user) {
    setSelectedUser(user)
    setSaveMsg('')
    fetchPermissions(user.employee_code)
  }

  function togglePerm(moduleKey, field) {
    setPermissions(prev => {
      const current = prev[moduleKey] || { can_view: false, can_edit: false }
      const updated = { ...current, [field]: !current[field] }
      if (field === 'can_edit' && updated.can_edit) {
        updated.can_view = true
      }
      if (field === 'can_view' && !updated.can_view) {
        updated.can_edit = false
      }
      return { ...prev, [moduleKey]: updated }
    })
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg('')
    try {
      const body = MODULES.map(m => ({
        module: m.key,
        can_view: !!(permissions[m.key]?.can_view),
        can_edit: !!(permissions[m.key]?.can_edit),
      }))
      const params = new URLSearchParams({ admin_code: adminCode, token, role })
      const res = await fetch(`${apiBase}/permissions/${selectedUser.employee_code}?${params}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        setSaveMsg('Lưu thành công')
      } else {
        setSaveMsg(data.detail || 'Lỗi lưu')
      }
    } catch (err) {
      setSaveMsg('Lỗi kết nối')
    } finally {
      setSaving(false)
    }
  }

  const filtered = users.filter(u => {
    if (filterRole !== 'all' && u.role !== filterRole) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (u.employee_code || '').toLowerCase().includes(q)
        || (u.full_name || '').toLowerCase().includes(q)
        || (u.department || '').toLowerCase().includes(q)
  })

  const hasChanges = selectedUser && !permLoading

  return (
    <div className="booking-module" style={{ minHeight: 0, height: '100%' }}>
      <div className="bk-layout">
        <div className="bk-layout-main">
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--bk-bg)', padding: '1rem' }}>
            <div className="bk-header" style={{ marginBottom: '0.75rem' }}>
              <Shield size={22} />
              Phân quyền người dùng
            </div>

            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
              {/* ─── User List ─── */}
              <div className="bk-card" style={{ padding: '1rem', flex: '1 1 320px', minWidth: 280, maxWidth: 420 }}>
                <div className="bk-form-group" style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <Search size={14} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--bk-text-muted)' }} />
                      <input
                        className="bk-form-input"
                        placeholder="Tìm kiếm..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ paddingLeft: '1.6rem', height: '32px', fontSize: '0.82rem' }}
                      />
                    </div>
                    <select
                      value={filterRole}
                      onChange={e => setFilterRole(e.target.value)}
                      className="bk-form-input"
                      style={{ width: 'auto', height: '32px', fontSize: '0.82rem' }}
                    >
                      <option value="all">Tất cả</option>
                      <option value="admin">Admin</option>
                      <option value="head">Trưởng phòng</option>
                      <option value="user">NV</option>
                    </select>
                  </div>
                </div>

                {loading ? (
                  <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--bk-text-muted)' }}>
                    <Loader size={20} className="spin" style={{ marginBottom: '0.5rem' }} />
                    <div style={{ fontSize: '0.85rem' }}>Đang tải...</div>
                  </div>
                ) : filtered.length === 0 ? (
                  <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--bk-text-muted)', fontSize: '0.85rem' }}>Không tìm thấy người dùng</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '500px', overflowY: 'auto' }}>
                    {filtered.map(u => (
                      <div
                        key={u.employee_code}
                        onClick={() => selectUser(u)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.5rem 0.65rem',
                          borderRadius: 'var(--bk-radius-sm)',
                          cursor: 'pointer',
                          background: selectedUser?.employee_code === u.employee_code ? 'var(--bk-primary)' : 'var(--bk-surface-hover)',
                          color: selectedUser?.employee_code === u.employee_code ? '#fff' : 'var(--bk-text)',
                          transition: 'all 0.15s',
                        }}
                      >
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

              {/* ─── Permission Grid ─── */}
              <div className="bk-card" style={{ padding: '1.25rem', flex: '1 1 500px', minWidth: 320 }}>
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
                        {selectedUser.employee_code} · {selectedUser.department || '—'} · {selectedUser.position || '—'}
                        <span style={{ marginLeft: '0.5rem', padding: '0.15rem 0.45rem', borderRadius: '99px', background: 'var(--bk-surface)', fontSize: '0.7rem', fontWeight: 600 }}>
                          {selectedUser.role === 'admin' ? 'Admin' : selectedUser.role === 'head' ? 'Trưởng phòng' : 'Nhân viên'}
                        </span>
                      </div>
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                      gap: '0.5rem',
                    }}>
                      {MODULES.map(m => {
                        const perm = permissions[m.key] || { can_view: false, can_edit: false }
                        const isAdminMod = ['employees', 'equipment', 'licenses', 'workflows', 'salary-admin'].includes(m.key)

                        return (
                          <div key={m.key} style={{
                            padding: '0.6rem 0.75rem',
                            background: 'var(--bk-surface-hover)',
                            borderRadius: 'var(--bk-radius-sm)',
                            border: '1px solid var(--bk-border)',
                          }}>
                            <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.4rem', color: 'var(--bk-text)' }}>
                              {m.label}
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', cursor: 'pointer', color: 'var(--bk-text-secondary)' }}>
                                <input
                                  type="checkbox"
                                  checked={perm.can_view}
                                  onChange={() => togglePerm(m.key, 'can_view')}
                                  style={{ accentColor: 'var(--bk-primary)' }}
                                />
                                Xem
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', cursor: 'pointer', color: isAdminMod ? 'var(--bk-text-muted)' : 'var(--bk-text-secondary)' }}>
                                <input
                                  type="checkbox"
                                  checked={perm.can_edit}
                                  onChange={() => togglePerm(m.key, 'can_edit')}
                                  style={{ accentColor: 'var(--bk-primary)' }}
                                />
                                Sửa
                              </label>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {saveMsg && (
                      <div style={{
                        marginTop: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--bk-radius-sm)',
                        fontSize: '0.85rem',
                        background: saveMsg === 'Lưu thành công' ? '#f0fdf4' : '#fef2f2',
                        border: `1px solid ${saveMsg === 'Lưu thành công' ? '#bbf7d0' : '#fecaca'}`,
                        color: saveMsg === 'Lưu thành công' ? 'var(--bk-success)' : 'var(--bk-danger)',
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                      }}>
                        {saveMsg === 'Lưu thành công' ? <Check size={14} /> : <XIcon size={14} />}
                        {saveMsg}
                      </div>
                    )}

                    <button
                      className="bk-btn bk-btn-primary"
                      style={{ marginTop: '1rem', width: '100%', height: '36px' }}
                      onClick={handleSave}
                      disabled={saving || !hasChanges}
                    >
                      {saving ? <><Loader size={16} className="spin" /> Đang lưu...</> : <><Save size={16} /> Lưu phân quyền</>}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
