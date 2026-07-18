import React, { useEffect, useState, useCallback } from 'react'
import '../styles/shared.css'
import {
  getEmployees, getDepartments, getEmployeeEquipment,
  createEmployee, updateEmployee, deleteEmployee,
  transferEquipment, revokeEquipment,
  createDepartment, updateDepartment, deleteDepartment,
  adminResetPassword,
} from '../services/api'

const STATUS_OPTIONS = [
  { value: 'active', label: 'Đang làm việc', color: '#16a34a', bg: '#dcfce7' },
  { value: 'resigned', label: 'Đã nghỉ việc', color: '#dc2626', bg: '#fee2e2' },
  { value: 'maternity', label: 'Thai sản', color: '#ca8a04', bg: '#fef9c3' },
  { value: 'suspended', label: 'Tạm nghỉ', color: '#64748b', bg: '#f1f5f9' },
]

function getStatusInfo(status) {
  return STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0]
}

export default function Employees() {
  const userRole = sessionStorage.getItem('user_role') || ''
  const userCode = sessionStorage.getItem('user_code') || ''
  const isAdmin = userRole === 'admin' || userRole === 'head'

  const [emps, setEmps] = useState([])
  const [depts, setDepts] = useState([])
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('Tất cả')
  const [statusFilter, setStatusFilter] = useState('Tất cả')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // Reset password state
  const [resetPwTarget, setResetPwTarget] = useState(null)
  const [resetPwNewPass, setResetPwNewPass] = useState('')
  const [resetPwMsg, setResetPwMsg] = useState('')
  const [resetPwLoading, setResetPwLoading] = useState(false)

  const [selectedEmp, setSelectedEmp] = useState(null)
  const [equip, setEquip] = useState([])
  const [equipLoading, setEquipLoading] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const [formData, setFormData] = useState(emptyForm())

  const [transferEqId, setTransferEqId] = useState(null)
  const [transferSearch, setTransferSearch] = useState('')
  const [transferResults, setTransferResults] = useState([])

  const [deptOpen, setDeptOpen] = useState(false)
  const [deptEditId, setDeptEditId] = useState(null)
  const [deptForm, setDeptForm] = useState({ name: '', head_id: '', description: '' })

  const load = useCallback((q, d, s) => {
    getEmployees(q || search, d || deptFilter, s || statusFilter).then(r => setEmps(r.data?.data || [])).catch(() => {})
    getDepartments().then(r => setDepts(r.data?.data || [])).catch(() => {})
    setLoading(false)
  }, [search, deptFilter, statusFilter])

  useEffect(() => { load() }, [])

  function showMsg(text, type) { setMsg(text); setTimeout(() => setMsg(''), 3500) }

  async function selectEmployee(emp) {
    if (selectedEmp?.id === emp.id) { setSelectedEmp(null); return }
    setSelectedEmp(emp); setEquipLoading(true); setTransferEqId(null); setTransferSearch(''); setTransferResults([])
    try {
      const r = await getEmployeeEquipment(emp.id)
      setEquip(r.data?.data || [])
    } catch { setEquip([]) }
    setEquipLoading(false)
  }

  function openAdd() {
    setEditId(null); setFormData(emptyForm()); setFormOpen(true)
  }

  function openEdit(emp) {
    setEditId(emp.id)
    setFormData({
      employee_code: emp.employee_code || '',
      full_name: emp.full_name || '',
      department: emp.department || '',
      position: emp.position || '',
      handover_date: emp.handover_date || '',
      phone: emp.phone || '',
      email: emp.email || '',
      notes: emp.notes || '',
      status: emp.status || 'active',
    })
    setFormOpen(true)
  }

  async function handleFormSubmit(e) {
    e.preventDefault()
    if (!formData.full_name.trim()) { showMsg('Họ tên không được để trống', 'error'); return }
    if (!formData.employee_code.trim()) { showMsg('Mã NV không được để trống', 'error'); return }
    try {
      if (editId) { await updateEmployee(editId, formData); showMsg('✅ Đã cập nhật thông tin nhân viên!') }
      else { await createEmployee({ ...formData, department: formData.department.toUpperCase() }); showMsg('✅ Đã thêm nhân viên thành công!') }
      setFormOpen(false); load()
      if (selectedEmp && (editId === selectedEmp.id || !editId)) {
        const r = await getEmployeeEquipment(selectedEmp?.id)
        setEquip(r.data?.data || [])
      }
    } catch { showMsg('❌ Lỗi kết nối đến máy chủ') }
  }

  async function handleDelete(id) {
    const emp = emps.find(e => e.id === id)
    if (!window.confirm(`Xoá nhân viên ${emp?.full_name}? Toàn bộ thiết bị và license cũng sẽ bị thu hồi.`)) return
    try {
      await deleteEmployee(id)
      showMsg('✅ Đã xoá nhân viên thành công')
      if (selectedEmp?.id === id) setSelectedEmp(null)
      load()
    } catch { showMsg('❌ Lỗi xảy ra khi xoá') }
  }

  async function handleRevoke(eqId) {
    if (!window.confirm('Thu hồi thiết bị này về kho?')) return
    try {
      await revokeEquipment(eqId)
      const r = await getEmployeeEquipment(selectedEmp.id)
      setEquip(r.data?.data || [])
      showMsg('✅ Đã thu hồi thiết bị về kho.')
    } catch { showMsg('❌ Lỗi thu hồi') }
  }

  function openResetPw(emp) {
    setResetPwTarget(emp)
    setResetPwNewPass('')
    setResetPwMsg('')
    setResetPwLoading(false)
  }

  async function handleAdminResetPw() {
    if (!resetPwTarget) return
    const pw = resetPwNewPass.trim() || resetPwTarget.employee_code
    if (pw.length < 4) { setResetPwMsg('Mật khẩu phải có ít nhất 4 ký tự'); return }
    setResetPwLoading(true)
    setResetPwMsg('')
    try {
      const token = sessionStorage.getItem('token')
      await adminResetPassword(userCode, token, resetPwTarget.employee_code, pw)
      showMsg(`✅ Đã reset mật khẩu cho ${resetPwTarget.full_name}`)
      setResetPwTarget(null)
    } catch (err) {
      setResetPwMsg(err.response?.data?.detail || 'Lỗi kết nối')
    } finally { setResetPwLoading(false) }
  }

  async function handleTransfer(eqId, target) {
    if (!window.confirm(`Bàn giao thiết bị cho ${target.full_name}?`)) return
    try {
      await transferEquipment(eqId, { employee_id: target.id, employee_code: target.employee_code, employee_name: target.full_name })
      setTransferEqId(null); setTransferSearch(''); setTransferResults([])
      const r = await getEmployeeEquipment(selectedEmp.id)
      setEquip(r.data?.data || [])
      showMsg(`✅ Đã bàn giao thiết bị cho ${target.full_name}.`)
    } catch { showMsg('❌ Lỗi bàn giao') }
  }

  // ─── Department Management ─────────────────────────────────

  function openDeptAdd() {
    setDeptEditId(null); setDeptForm({ name: '', head_id: '', description: '' }); setDeptOpen(true)
  }

  function openDeptEdit(d) {
    setDeptEditId(d.id); setDeptForm({ name: d.name, head_id: d.head_id || '', description: d.description || '' }); setDeptOpen(true)
  }

  async function handleDeptSubmit(e) {
    e.preventDefault()
    if (!deptForm.name.trim()) { showMsg('Tên phòng ban không được để trống', 'error'); return }
    try {
      if (deptEditId) { await updateDepartment(deptEditId, deptForm); showMsg('✅ Đã cập nhật phòng ban!') }
      else { await createDepartment(deptForm); showMsg('✅ Đã thêm phòng ban mới!') }
      setDeptOpen(false); load()
    } catch { showMsg('❌ Lỗi kết nối đến máy chủ') }
  }

  async function handleDeptDelete(id) {
    if (!window.confirm('Xoá phòng ban này?')) return
    try {
      await deleteDepartment(id); showMsg('✅ Đã xoá phòng ban'); load()
    } catch { showMsg('❌ Lỗi xoá phòng ban') }
  }

  return (
    <div>
      <style>{`
        .eq-card { background: #f8fafc; border-radius: 8px; padding: 0.6rem 0.8rem; margin-bottom: 0.4rem; border: 1px solid #f1f5f9; font-size: 0.8rem; }
        .emp-item:hover { background: #eff6ff !important; }
      `}</style>

      <div className="module-header">
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a' }}>👥 Quản lý Nhân viên</h1>
        <div className="module-header-actions">
          <span style={{ background: '#e8f0fe', color: '#00468C', padding: '0.3rem 0.8rem', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600 }}>
            {loading ? '...' : `${emps.length} NV`}
          </span>
          <button onClick={openDeptAdd} style={{
            padding: '0.45rem 0.9rem', height: 36, background: '#fff', color: '#475569',
            border: '1px solid #e2e8f0', borderRadius: 8, fontWeight: 500, fontSize: '0.82rem',
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>📂 Phòng ban</button>
          <button onClick={openAdd} style={{
            padding: '0.45rem 0.9rem', height: 36, background: '#00468C', color: '#fff',
            border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.82rem',
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>➕ Thêm NV</button>
        </div>
      </div>

      {msg && (
        <div style={{
          background: msg.startsWith('✅') ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${msg.startsWith('✅') ? '#86efac' : '#fca5a5'}`, borderRadius: 12,
          padding: '0.6rem 0.8rem', color: msg.startsWith('✅') ? '#166534' : '#991b1b',
          fontSize: '0.85rem', marginBottom: '1rem',
        }}>{msg}</div>
      )}

      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center',
        background: '#fff', padding: '0.6rem 0.8rem', borderRadius: 12, border: '1px solid #e6edf5',
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <span style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
          <input type="text" placeholder="Tìm theo mã, tên NV..." value={search}
            onChange={e => { setSearch(e.target.value); load(e.target.value, null, null) }}
            style={{
              width: '100%', padding: '0.45rem 0.7rem 0.45rem 1.8rem', background: '#f8fafc',
              border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.82rem',
              outline: 'none', fontFamily: 'inherit', color: '#334155', boxSizing: 'border-box',
            }} />
        </div>
        <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); load(null, e.target.value, null) }}
          style={{
            padding: '0.45rem 0.7rem', background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: 8, fontSize: '0.82rem', outline: 'none', cursor: 'pointer',
            fontFamily: 'inherit', color: '#334155', minWidth: 160,
          }}>
          <option value="Tất cả">Tất cả bộ phận</option>
          {depts.map(d => <option key={d.name || d} value={d.name || d}>
            {d.name || d}{d.head_name ? ` (TP: ${d.head_name})` : ''}
          </option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); load(null, null, e.target.value) }}
          style={{
            padding: '0.45rem 0.7rem', background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: 8, fontSize: '0.82rem', outline: 'none', cursor: 'pointer',
            fontFamily: 'inherit', color: '#334155', minWidth: 140,
          }}>
          <option value="Tất cả">Tất cả trạng thái</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Employee form modal */}
      {formOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, backdropFilter: 'blur(4px)' }}
          onClick={() => setFormOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '1.25rem 1.5rem', width: 540, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>
                {editId ? '✏️ Chỉnh sửa thông tin nhân viên' : '➕ Thêm nhân viên mới'}
              </h3>
              <button onClick={() => setFormOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#94a3b8' }}>✕</button>
            </div>
            <form onSubmit={handleFormSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem' }}>
                <FormField label="Mã nhân viên *" span={false}>
                  <input type="text" value={formData.employee_code} placeholder="VD: NV001"
                    onChange={e => setFormData({ ...formData, employee_code: e.target.value })} style={inputS} />
                </FormField>
                <FormField label="Họ và tên *" span>
                  <input type="text" value={formData.full_name} placeholder="Nhập đầy đủ họ tên"
                    onChange={e => setFormData({ ...formData, full_name: e.target.value })} style={inputS} />
                </FormField>
                <FormField label="Bộ phận / Phòng ban">
                  <select value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })} style={inputS}>
                    <option value="">-- Không chọn --</option>
                    {depts.map(o => <option key={o.name || o} value={o.name || o}>{o.name || o}</option>)}
                  </select>
                </FormField>
                <FormField label="Trạng thái">
                  <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} style={inputS}>
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </FormField>
                <FormField label="Chức vụ">
                  <input type="text" value={formData.position} placeholder="VD: Nhân viên, Trưởng phòng"
                    onChange={e => setFormData({ ...formData, position: e.target.value })} style={inputS} />
                </FormField>
                <FormField label="Ngày bắt đầu bàn giao">
                  <input type="date" value={formData.handover_date}
                    onChange={e => setFormData({ ...formData, handover_date: e.target.value })} style={inputS} />
                </FormField>
                <FormField label="Số điện thoại">
                  <input type="text" value={formData.phone} placeholder="Nhập SĐT liên hệ"
                    onChange={e => setFormData({ ...formData, phone: e.target.value })} style={inputS} />
                </FormField>
                <FormField label="Địa chỉ Email" span>
                  <input type="email" value={formData.email} placeholder="VD: name@goldenfarm.com.vn"
                    onChange={e => setFormData({ ...formData, email: e.target.value })} style={inputS} />
                </FormField>
                <FormField label="Ghi chú hệ thống" span>
                  <textarea value={formData.notes} placeholder="Thông tin bổ sung..."
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    rows={2} style={{ ...inputS, resize: 'vertical', minHeight: 44 }} />
                </FormField>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setFormOpen(false)} style={{
                  padding: '0.45rem 1rem', background: '#fff', border: '1px solid #e2e8f0',
                  borderRadius: 8, fontSize: '0.85rem', fontWeight: 500, color: '#475569',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Hủy bỏ</button>
                <button type="submit" style={{
                  padding: '0.45rem 1.25rem', background: '#00468C', border: 'none',
                  borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, color: '#fff',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>💾 Lưu thông tin</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Department management modal */}
      {deptOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, backdropFilter: 'blur(4px)' }}
          onClick={() => setDeptOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '1.25rem 1.5rem', width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>📂 Quản lý Phòng ban</h3>
              <button onClick={() => setDeptOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#94a3b8' }}>✕</button>
            </div>

            {/* Department form */}
            <form onSubmit={handleDeptSubmit} style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div style={{ gridColumn: '1 / span 2' }}>
                  <label style={deptLabelS}>Tên phòng ban</label>
                  <input type="text" value={deptForm.name} placeholder="VD: Phòng Kỹ thuật"
                    onChange={e => setDeptForm({ ...deptForm, name: e.target.value })} style={inputS} />
                </div>
                <div>
                  <label style={deptLabelS}>Trưởng phòng (ID)</label>
                  <input type="number" value={deptForm.head_id} placeholder="Nhập ID nhân viên"
                    onChange={e => setDeptForm({ ...deptForm, head_id: e.target.value ? Number(e.target.value) : '' })} style={inputS} />
                </div>
                <div>
                  <label style={deptLabelS}>Mô tả</label>
                  <input type="text" value={deptForm.description} placeholder="Mô tả ngắn"
                    onChange={e => setDeptForm({ ...deptForm, description: e.target.value })} style={inputS} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="submit" style={{
                  padding: '0.4rem 0.9rem', background: '#00468C', border: 'none',
                  borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, color: '#fff',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{deptEditId ? '💾 Cập nhật' : '➕ Thêm'}</button>
              </div>
            </form>

            {/* Department list */}
            <div className="tbl-wrap" style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Tên phòng ban</th>
                    <th style={{ width: 120 }}>Trưởng phòng</th>
                    <th style={{ width: 80, textAlign: 'center' }}>Số NV</th>
                    <th style={{ width: 80, textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {depts.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Chưa có phòng ban nào.</td></tr>
                  ) : depts.map(d => (
                    <tr key={d.id || d.name}>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>{d.name}</td>
                      <td>{d.head_name || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ background: '#f1f5f9', padding: '0.1rem 0.45rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, color: '#475569' }}>{d.emp_count || 0}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                          <button onClick={() => openDeptEdit(d)} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 4, padding: '0.2rem 0.4rem', fontSize: '0.72rem', color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>✏️</button>
                          <button onClick={() => handleDeptDelete(d.id)} style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 4, padding: '0.2rem 0.4rem', fontSize: '0.72rem', color: '#dc2626', cursor: 'pointer', fontFamily: 'inherit' }}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Data table */}
      <div className="tbl-wrap" style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 85 }}>Mã NV</th>
              <th style={{ minWidth: 150 }}>Họ và tên</th>
              <th style={{ minWidth: 120 }}>Bộ phận</th>
              <th style={{ width: 100 }}>Trạng thái</th>
              <th style={{ width: 60, textAlign: 'center' }}>T. bị</th>
              <th style={{ width: 36, textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1,2,3,4,5].map(i => (
                <tr key={`s-${i}`}>
                  {[1,2,3,4,5,6].map(j => (
                    <td key={`c-${j}`}>
                      <div style={{ height: 12, background: '#f1f5f9', borderRadius: 4, width: j === 4 ? '60%' : '75%' }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : emps.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
                  Không tìm thấy nhân viên nào.
                </td>
              </tr>
            ) : emps.map(emp => {
              const sel = selectedEmp?.id === emp.id
              const st = getStatusInfo(emp.status)
              return (
                <tr key={emp.id} className={sel ? 'selected' : ''} onClick={() => selectEmployee(emp)}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.78rem', color: sel ? '#00468C' : '#475569' }}>{emp.employee_code}</td>
                  <td style={{ fontWeight: 500, color: '#0f172a' }}>{emp.full_name}</td>
                  <td>
                    {emp.department ? (
                      <span style={{ display: 'inline-block', padding: '0.08rem 0.4rem', borderRadius: 4, background: '#f1f5f9', color: '#475569', fontSize: '0.72rem', fontWeight: 500 }}>{emp.department}</span>
                    ) : <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>}
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-block', padding: '0.1rem 0.5rem', borderRadius: 20,
                      background: st.bg, color: st.color, fontSize: '0.72rem', fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}>{st.label}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{
                      background: emp.eq_count > 0 ? '#e8f0fe' : '#f1f5f9',
                      color: emp.eq_count > 0 ? '#00468C' : '#94a3b8',
                      padding: '0.1rem 0.45rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600,
                    }}>{emp.eq_count || 0}</span>
                  </td>
                  <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>{sel ? '◀' : '▶'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Side panel */}
      <div className={`panel-overlay ${selectedEmp ? 'open' : ''}`} onClick={() => setSelectedEmp(null)} />
      <div className={`side-panel ${selectedEmp ? 'open' : ''}`}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>👤 {selectedEmp?.full_name}</div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontFamily: 'monospace' }}>
              {selectedEmp?.employee_code}
              {selectedEmp?.department && <span style={{ marginLeft: '0.4rem', fontFamily: 'inherit' }}>— {selectedEmp.department}</span>}
            </div>
          </div>
          <button onClick={() => setSelectedEmp(null)} style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '1rem', color: '#64748b',
          }}>✕</button>
        </div>

        <div className="panel-body">
          {selectedEmp && (
            <>
              {/* Employee details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 1rem', marginBottom: '1rem' }}>
                <DetailItem label="Trạng thái" value={
                  <span style={{
                    display: 'inline-block', padding: '0.05rem 0.45rem', borderRadius: 20,
                    background: getStatusInfo(selectedEmp.status).bg, color: getStatusInfo(selectedEmp.status).color,
                    fontSize: '0.75rem', fontWeight: 600,
                  }}>{getStatusInfo(selectedEmp.status).label}</span>
                } />
                <DetailItem label="Chức vụ" value={selectedEmp.position} />
                <DetailItem label="Số điện thoại" value={selectedEmp.phone} />
                <DetailItem label="Địa chỉ Email" value={selectedEmp.email} />
                <DetailItem label="Ngày bàn giao" value={selectedEmp.handover_date} />
              </div>
              {selectedEmp.notes && (
                <div style={{ fontSize: '0.78rem', color: '#64748b', background: '#f8fafc', borderRadius: 8, padding: '0.5rem 0.7rem', marginBottom: '1rem', border: '1px solid #f1f5f9' }}>
                  <strong>📝 Ghi chú:</strong> {selectedEmp.notes}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <button onClick={() => openEdit(selectedEmp)} style={panelBtnS}>✏️ Sửa</button>
                <button onClick={() => handleDelete(selectedEmp.id)} style={{ ...panelBtnS, background: '#fef2f2', color: '#dc2626', borderColor: '#fca5a5' }}>🗑️ Xoá</button>
                {isAdmin && (
                  <button onClick={() => openResetPw(selectedEmp)} style={{ ...panelBtnS, background: '#eef2ff', color: '#4338ca', borderColor: '#c7d2fe' }}>🔑 Reset MK</button>
                )}
              </div>

              {/* Equipment list */}
              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#0f172a', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                📦 Thiết bị ({equip.length})
              </div>

              {equipLoading ? (
                <div style={{ color: '#94a3b8', fontSize: '0.78rem', padding: '1rem', textAlign: 'center' }}>Đang tải...</div>
              ) : equip.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center', padding: '1.5rem', background: '#f8fafc', borderRadius: 8, border: '1px dashed #e2e8f0' }}>
                  Chưa có thiết bị nào được bàn giao.
                </div>
              ) : equip.map(eq => (
                <div key={eq.id} className="eq-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '0.15rem', fontSize: '0.82rem' }}>
                        {eq.equipment_type}
                        {eq.asset_code && <span style={{ marginLeft: '0.3rem', color: '#00468C', background: '#eff6ff', padding: '0.05rem 0.3rem', borderRadius: 4, fontSize: '0.72rem' }}>{eq.asset_code}</span>}
                      </div>
                      {eq.specs && <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.2rem' }}>{eq.specs}</div>}
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>S/N: {eq.serial_number || '—'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                      <button onClick={() => handleRevoke(eq.id)} style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 4, padding: '0.2rem 0.4rem', fontSize: '0.72rem', color: '#dc2626', cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit' }}>📥</button>
                      <button onClick={() => setTransferEqId(transferEqId === eq.id ? null : eq.id)} style={{
                        background: 'none', border: '1px solid #cbd5e1', borderRadius: 4, padding: '0.2rem 0.4rem',
                        fontSize: '0.72rem', color: '#475569', cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit',
                      }}>🔄</button>
                    </div>
                  </div>

                  {transferEqId === eq.id && (
                    <div style={{ marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px dashed #e2e8f0' }}>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
                        <input type="text" placeholder="Tìm NV nhận..." value={transferSearch}
                          onChange={async e => {
                            setTransferSearch(e.target.value)
                            if (e.target.value.trim()) {
                              const r = await getEmployees(e.target.value.trim())
                              setTransferResults(r.data?.data || [])
                            } else { setTransferResults([]) }
                          }}
                          style={{
                            width: '100%', padding: '0.3rem 0.5rem 0.3rem 1.4rem', background: '#fff',
                            border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.75rem',
                            outline: 'none', fontFamily: 'inherit', color: '#334155', boxSizing: 'border-box',
                          }} />
                      </div>
                      {transferResults.length > 0 && (
                        <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, marginTop: '0.2rem', background: '#fff' }}>
                          {transferResults.filter(t => t.id !== selectedEmp.id).map(t => (
                            <div key={t.id} className="emp-item"
                              onClick={() => handleTransfer(eq.id, t)}
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', color: '#0f172a' }}>
                              <strong>{t.full_name}</strong>
                              <span style={{ color: '#64748b', fontSize: '0.7rem' }}> ({t.employee_code} — {t.department})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Admin Reset Password Dialog */}
      {resetPwTarget && (<>
        <div className="panel-overlay open" onClick={() => setResetPwTarget(null)} />
        <div style={{
          position: 'fixed', top: 0, right: 0, width: 380, height: '100vh', background: '#fff',
          zIndex: 201, boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>🔑 Reset mật khẩu</div>
            <button onClick={() => setResetPwTarget(null)} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '1rem', color: '#64748b' }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
            <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
              Reset mật khẩu cho <strong>{resetPwTarget.full_name}</strong> ({resetPwTarget.employee_code})
            </div>
            {resetPwMsg && (
              <div style={{
                background: resetPwMsg.includes('✅') ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${resetPwMsg.includes('✅') ? '#86efac' : '#fca5a5'}`,
                borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '0.82rem',
                color: resetPwMsg.includes('✅') ? '#166534' : '#991b1b', marginBottom: '1rem',
              }}>{resetPwMsg}</div>
            )}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Mật khẩu mới</label>
              <input type="text" value={resetPwNewPass}
                placeholder={`Để trống để reset về mã NV (${resetPwTarget.employee_code})`}
                onChange={e => setResetPwNewPass(e.target.value)}
                style={{ width: '100%', padding: '0.45rem 0.65rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.82rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <button onClick={handleAdminResetPw} disabled={resetPwLoading}
              style={{ width: '100%', padding: '0.55rem', background: '#4338ca', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              {resetPwLoading ? 'Đang reset...' : 'Xác nhận reset'}
            </button>
          </div>
        </div>
      </>)}
    </div>
  )
}

function FormField({ label, span, children }) {
  const s = span ? { gridColumn: '1 / span 2' } : {}
  return (
    <div style={{ marginBottom: '0.5rem', ...s }}>
      <label style={{ fontSize: '0.78rem', color: '#475569', display: 'block', marginBottom: '0.2rem', fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  )
}

function DetailItem({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '0.82rem', color: '#0f172a', fontWeight: 500 }}>{value || <span style={{ color: '#cbd5e1', fontWeight: 400 }}>—</span>}</div>
    </div>
  )
}

function emptyForm() {
  return { employee_code: '', full_name: '', department: '', position: '', handover_date: '', phone: '', email: '', notes: '', status: 'active' }
}

const inputS = {
  width: '100%', padding: '0.4rem 0.65rem', boxSizing: 'border-box',
  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
  fontSize: '0.82rem', outline: 'none', fontFamily: 'inherit',
}

const panelBtnS = {
  padding: '0.35rem 0.75rem', background: '#f1f5f9', border: '1px solid #e2e8f0',
  borderRadius: 7, color: '#475569', fontWeight: 500, fontSize: '0.78rem',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}

const deptLabelS = {
  display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#475569', marginBottom: '0.15rem',
}
