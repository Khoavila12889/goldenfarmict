import React, { useEffect, useState, useCallback } from 'react'
import {
  getWorkflows, createWorkflow, updateWorkflow, deleteWorkflow,
  getWorkflow, addWorkflowStep, updateWorkflowStep, deleteWorkflowStep,
} from '../services/api'
import {
  FileCheck, Plus, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Loader2, CheckCircle,
  Settings, Trash2, Edit3, Save, Eye, EyeOff, GripVertical,
  UserCheck, Users, UserCircle,
} from 'lucide-react'

const APPROVER_TYPE_OPTIONS = [
  { value: 'role', label: 'Theo chức vụ', icon: 'UserCheck' },
  { value: 'specific', label: 'Chỉ định cụ thể', icon: 'UserCircle' },
]

const POSITION_OPTIONS = [
  'Trưởng phòng', 'Phó phòng', 'Giám đốc', 'Phó giám đốc',
  'Quản lý', 'Trưởng nhóm', 'Kế toán trưởng', 'Thủ kho',
]

export default function WorkflowTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const [selectedWf, setSelectedWf] = useState(null)
  const [wfDetail, setWfDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', icon: 'FileCheck' })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  const [showStepForm, setShowStepForm] = useState(false)
  const [stepForm, setStepForm] = useState({
    approver_type: 'role', approver_value: '', department_match: 1, can_edit: 0,
  })
  const [stepEditId, setStepEditId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    getWorkflows(false)
      .then(r => setTemplates(r.data?.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [])

  function showMsg(text) { setMsg(text); setTimeout(() => setMsg(''), 3000) }

  async function selectWf(wf) {
    if (selectedWf?.id === wf.id) { setSelectedWf(null); return }
    setSelectedWf(wf)
    setDetailLoading(true)
    try {
      const r = await getWorkflow(wf.id)
      setWfDetail(r.data)
    } catch { setWfDetail(null) }
    setDetailLoading(false)
  }

  function openCreate() { setEditId(null); setForm({ name: '', description: '', icon: 'FileCheck' }); setShowForm(true) }

  function openEdit(wf) {
    setEditId(wf.id)
    setForm({ name: wf.name || '', description: wf.description || '', icon: wf.icon || 'FileCheck' })
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editId) {
        await updateWorkflow(editId, form)
        showMsg('Đã cập nhật quy trình')
      } else {
        await createWorkflow(form)
        showMsg('Đã tạo quy trình mới')
      }
      setShowForm(false)
      load()
      if (selectedWf) { setSelectedWf(null); setWfDetail(null) }
    } catch { showMsg('Lỗi kết nối') }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!window.confirm('Xóa quy trình này? Các bước duyệt sẽ bị xóa theo.')) return
    try {
      await deleteWorkflow(id)
      showMsg('Đã xóa quy trình')
      if (selectedWf?.id === id) { setSelectedWf(null); setWfDetail(null) }
      load()
    } catch { showMsg('Lỗi xóa quy trình') }
  }

  function openAddStep() {
    setStepForm({ approver_type: 'role', approver_value: '', department_match: 1, can_edit: 0 })
    setStepEditId(null)
    setShowStepForm(true)
  }

  function openEditStep(step) {
    setStepForm({
      approver_type: step.approver_type,
      approver_value: step.approver_value,
      department_match: step.department_match,
      can_edit: step.can_edit,
    })
    setStepEditId(step.id)
    setShowStepForm(true)
  }

  async function handleStepSave(e) {
    e.preventDefault()
    if (!stepForm.approver_value.trim()) return
    setSaving(true)
    try {
      if (stepEditId) {
        await updateWorkflowStep(stepEditId, stepForm)
        showMsg('Đã cập nhật bước duyệt')
      } else {
        await addWorkflowStep(selectedWf.id, stepForm)
        showMsg('Đã thêm bước duyệt')
      }
      setShowStepForm(false)
      if (selectedWf) { const r = await getWorkflow(selectedWf.id); setWfDetail(r.data) }
    } catch { showMsg('Lỗi') }
    setSaving(false)
  }

  async function handleDeleteStep(stepId) {
    if (!window.confirm('Xóa bước duyệt này?')) return
    try {
      await deleteWorkflowStep(stepId)
      showMsg('Đã xóa bước duyệt')
      if (selectedWf) { const r = await getWorkflow(selectedWf.id); setWfDetail(r.data) }
    } catch { showMsg('Lỗi xóa bước') }
  }

  async function toggleActive(wf) {
    try {
      await updateWorkflow(wf.id, { is_active: wf.is_active ? 0 : 1 })
      load()
      showMsg(wf.is_active ? 'Đã vô hiệu hóa quy trình' : 'Đã kích hoạt quy trình')
    } catch { showMsg('Lỗi') }
  }

  useEffect(() => {
    if (!selectedWf) { setShowStepForm(false) }
  }, [selectedWf])

  return (
    <div className="wt-page">
      <style>{`
        .wt-page { font-family: inherit; }
        .wt-page * { box-sizing: border-box; }
        @keyframes wtFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes wtSlideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes wtSkeleton { 0% { background-position: -200px 0; } 100% { background-position: calc(200px + 100%) 0; } }

        .wt-skeleton { background: linear-gradient(90deg,#f1f5f9 25%,#e8ecf0 50%,#f1f5f9 75%); background-size: 200px 100%; animation: wtSkeleton 1.5s ease-in-out infinite; border-radius: 6px; }

        .wt-table-wrap { background: #fff; border-radius: 12px; border: 1px solid #e6edf5; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
        .wt-table-scroll { overflow-x: auto; }
        .wt-table { width: 100%; border-collapse: separate; border-spacing: 0; }
        .wt-table thead th {
          background: #f8fafc; color: #475569; font-weight: 700; padding: 0.6rem 0.75rem;
          text-align: left; white-space: nowrap; border-bottom: 1px solid #e2e8f0;
          font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em;
        }
        .wt-table tbody td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: middle; font-size: 0.82rem; }
        .wt-table tbody tr { cursor: pointer; transition: background 0.1s; }
        .wt-table tbody tr:hover td { background: #f8fafc; }
        .wt-table tbody tr.wt-row-selected td { background: #eff6ff; box-shadow: inset 3px 0 0 #00468C; }
        .wt-table tbody tr:last-child td { border-bottom: none; }

        .wt-badge {
          display: inline-flex; align-items: center; gap: 0.25rem;
          padding: 0.1rem 0.5rem; border-radius: 20px;
          font-size: 0.72rem; font-weight: 600; white-space: nowrap;
        }

        .wt-panel-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.25); z-index: 200; opacity: 0; pointer-events: none; transition: opacity 0.2s; }
        .wt-panel-overlay.open { opacity: 1; pointer-events: auto; }
        .wt-side-panel {
          position: fixed; top: 0; right: -520px; width: 500px; height: 100vh; background: #fff;
          z-index: 201; transition: right 0.25s cubic-bezier(0.4,0,0.2,1);
          box-shadow: -4px 0 24px rgba(0,0,0,0.1); display: flex; flex-direction: column;
        }
        .wt-side-panel.open { right: 0; }

        .wt-step-card {
          background: #f8fafc; border-radius: 8px; padding: 0.65rem 0.85rem;
          margin-bottom: 0.5rem; border: 1px solid #e2e8f0;
          display: flex; align-items: center; gap: 0.75rem;
        }
        .wt-step-num {
          width: 28px; height: 28px; border-radius: 50%; background: #00468C; color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.75rem; font-weight: 700; flex-shrink: 0;
        }
        .wt-step-info { flex: 1; min-width: 0; }
        .wt-step-type { font-size: 0.65rem; color: #94a3b8; font-weight: 600; text-transform: uppercase; }
        .wt-step-value { font-size: 0.85rem; color: #0f172a; font-weight: 500; }
        .wt-step-actions { display: flex; gap: 0.25rem; flex-shrink: 0; }

        .wt-toolbar-btn {
          height: 36px; display: inline-flex; align-items: center; gap: 0.35rem;
          padding: 0 0.8rem; border-radius: 8px; font-size: 0.78rem; font-weight: 500;
          cursor: pointer; font-family: inherit; white-space: nowrap;
          border: 1px solid #e2e8f0; background: #fff; color: #475569; transition: all 0.12s;
        }
        .wt-toolbar-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
        .wt-toolbar-btn.primary { background: #00468C; color: #fff; border-color: #00468C; }
        .wt-toolbar-btn.primary:hover { background: #003570; }
        .wt-toolbar-btn.danger { color: #dc2626; }
        .wt-toolbar-btn.danger:hover { background: #fef2f2; border-color: #fca5a5; }

        .wt-modal-overlay {
          position: fixed; inset: 0; background: rgba(15,23,42,0.45); display: flex;
          align-items: center; justify-content: center; z-index: 300; backdrop-filter: blur(4px);
          animation: wtFadeIn 0.15s ease;
        }
        .wt-modal {
          background: #fff; border-radius: 16px; width: 500px; max-width: 95vw;
          max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.15);
          animation: wtFadeIn 0.15s ease;
        }
        .wt-form-group { margin-bottom: 0.65rem; }
        .wt-form-label { display: block; font-size: 0.72rem; color: #64748b; margin-bottom: 0.2rem; font-weight: 500; }
        .wt-form-input, .wt-form-select {
          width: 100%; padding: 0.45rem 0.65rem; background: #f8fafc; border: 1px solid #e2e8f0;
          border-radius: 8px; font-size: 0.82rem; outline: none; font-family: inherit; color: #0f172a;
        }
        .wt-form-input:focus, .wt-form-select:focus { border-color: #00468C; background: #fff; box-shadow: 0 0 0 3px rgba(0,70,140,0.1); }

        .wt-empty { text-align: center; padding: 3rem 1rem; color: #94a3b8; }
      `}</style>

      {/* Toast */}
      {msg && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12,
          padding: '0.75rem 1rem', color: '#166534', fontSize: '0.85rem', fontWeight: 600,
          boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          animation: 'wtSlideIn 0.25s ease',
        }}>
          <CheckCircle size={18} /> {msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={24} style={{ color: '#00468C' }} />
            Quy trình phê duyệt
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0.15rem 0 0' }}>
            Cấu hình các mẫu quy trình phê duyệt đa cấp
          </p>
        </div>
        <button onClick={openCreate} className="wt-toolbar-btn primary" style={{ height: 40, padding: '0 1.1rem', fontSize: '0.85rem' }}>
          <Plus size={16} /> Tạo quy trình
        </button>
      </div>

      {/* Data table */}
      <div className="wt-table-wrap">
        <div className="wt-table-scroll">
          <table className="wt-table">
            <thead>
              <tr>
                <th style={{ width: 50 }}>ID</th>
                <th style={{ minWidth: 180 }}>Tên quy trình</th>
                <th style={{ minWidth: 200 }}>Mô tả</th>
                <th style={{ minWidth: 80 }}>Số bước</th>
                <th style={{ minWidth: 80 }}>Trạng thái</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1,2,3].map(i => (
                  <tr key={`s-${i}`}>
                    {[1,2,3,4,5,6].map(j => (
                      <td key={j}><div className="wt-skeleton" style={{ height: 12, width: j <= 2 ? '65%' : '40%' }} /></td>
                    ))}
                  </tr>
                ))
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="wt-empty">
                      <Settings size={40} style={{ color: '#cbd5e1', marginBottom: '0.5rem' }} />
                      <div style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 500 }}>Chưa có quy trình nào</div>
                      <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Tạo quy trình phê duyệt đầu tiên</div>
                    </div>
                  </td>
                </tr>
              ) : templates.map(wf => {
                const sel = selectedWf?.id === wf.id
                return (
                  <tr key={wf.id} className={sel ? 'wt-row-selected' : ''} onClick={() => selectWf(wf)}>
                    <td style={{ fontWeight: 600, color: '#00468C', fontSize: '0.78rem' }}>#{wf.id}</td>
                    <td style={{ fontWeight: 500 }}>{wf.name}</td>
                    <td style={{ fontSize: '0.78rem', color: '#64748b', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {wf.description || <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td>
                      <span style={{
                        background: '#e8f0fe', color: '#00468C', padding: '0.08rem 0.4rem',
                        borderRadius: 4, fontSize: '0.72rem', fontWeight: 600,
                      }}>{wf.steps?.length || 0} bước</span>
                    </td>
                    <td>
                      <span className="wt-badge" style={{
                        background: wf.is_active ? '#dcfce7' : '#f1f5f9',
                        color: wf.is_active ? '#16a34a' : '#94a3b8',
                      }}>{wf.is_active ? 'Hoạt động' : 'Tắt'}</span>
                    </td>
                    <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                      {sel ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{
          padding: '0.6rem 1rem', borderTop: '1px solid #e2e8f0',
          fontSize: '0.78rem', color: '#64748b', background: '#fafbfc',
        }}>
          {templates.length} quy trình
        </div>
      </div>

      {/* Panel overlay */}
      <div className={`wt-panel-overlay ${selectedWf ? 'open' : ''}`} onClick={() => setSelectedWf(null)} />

      {/* Detail panel */}
      <div className={`wt-side-panel ${selectedWf ? 'open' : ''}`}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <FileCheck size={20} style={{ color: '#00468C', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{selectedWf?.name}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>#{selectedWf?.id}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button onClick={() => selectedWf && openEdit(selectedWf)} className="wt-toolbar-btn" style={{ height: 32, padding: '0 0.5rem', fontSize: '0.72rem' }}>
              <Edit3 size={13} />
            </button>
            <button onClick={() => selectedWf && toggleActive(selectedWf)} className="wt-toolbar-btn" style={{ height: 32, padding: '0 0.5rem', fontSize: '0.72rem' }}>
              {selectedWf?.is_active ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
            <button onClick={() => selectedWf && handleDelete(selectedWf.id)} className="wt-toolbar-btn danger" style={{ height: 32, padding: '0 0.5rem', fontSize: '0.72rem' }}>
              <Trash2 size={13} />
            </button>
            <button onClick={() => setSelectedWf(null)} style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#64748b',
            }}><X size={16} /></button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
          {detailLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
              <Loader2 size={20} />
            </div>
          ) : wfDetail ? (
            <>
              {/* Description */}
              {wfDetail.description && (
                <div style={{ marginBottom: '1rem', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5, background: '#f8fafc', borderRadius: 8, padding: '0.5rem 0.7rem', border: '1px solid #f1f5f9' }}>
                  {wfDetail.description}
                </div>
              )}

              {/* Steps */}
              <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '0.75rem', color: '#00468C', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <UserCheck size={14} /> Các bước phê duyệt ({wfDetail.steps?.length || 0})
                </div>
                <button onClick={openAddStep} className="wt-toolbar-btn" style={{ height: 30, padding: '0 0.6rem', fontSize: '0.72rem' }}>
                  <Plus size={13} /> Thêm bước
                </button>
              </div>

              {(!wfDetail.steps || wfDetail.steps.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8', fontSize: '0.82rem', background: '#f8fafc', borderRadius: 8, border: '1px dashed #e2e8f0' }}>
                  Chưa có bước phê duyệt nào. Thêm bước đầu tiên.
                </div>
              ) : wfDetail.steps.map((step, idx) => (
                <div key={step.id} className="wt-step-card">
                  <div className="wt-step-num">{idx + 1}</div>
                  <div className="wt-step-info">
                    <div className="wt-step-type">
                      {step.approver_type === 'specific' ? 'Chỉ định' : 'Theo chức vụ'}
                      {step.department_match ? ' (cùng bộ phận)' : ''}
                    </div>
                    <div className="wt-step-value">{step.approver_value || '—'}</div>
                  </div>
                  <div className="wt-step-actions">
                    <button onClick={() => openEditStep(step)} className="wt-toolbar-btn" style={{ height: 28, padding: '0 0.4rem', fontSize: '0.7rem' }}>
                      <Edit3 size={12} />
                    </button>
                    <button onClick={() => handleDeleteStep(step.id)} className="wt-toolbar-btn danger" style={{ height: 28, padding: '0 0.4rem', fontSize: '0.7rem' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : null}
        </div>
      </div>

      {/* Create/Edit workflow modal */}
      {showForm && (
        <div className="wt-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="wt-modal" onClick={e => e.stopPropagation()}>
            <form onSubmit={handleSave}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {editId ? <><Edit3 size={18} /> Sửa quy trình</> : <><Plus size={18} /> Tạo quy trình mới</>}
                </h3>
                <button type="button" onClick={() => setShowForm(false)} style={{
                  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#64748b',
                }}><X size={16} /></button>
              </div>
              <div style={{ padding: '1rem 1.5rem' }}>
                <div className="wt-form-group">
                  <label className="wt-form-label">Tên quy trình *</label>
                  <input type="text" className="wt-form-input" value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })} required
                    placeholder="VD: Phê duyệt mua thiết bị" />
                </div>
                <div className="wt-form-group">
                  <label className="wt-form-label">Mô tả</label>
                  <input type="text" className="wt-form-input" value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="Mô tả ngắn về quy trình này" />
                </div>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'flex-end', gap: '0.5rem',
                padding: '0.85rem 1.5rem', borderTop: '1px solid #e2e8f0', background: '#fafbfc',
              }}>
                <button type="button" onClick={() => setShowForm(false)} className="wt-toolbar-btn" style={{ height: 38, padding: '0 1rem' }}>
                  Hủy bỏ
                </button>
                <button type="submit" disabled={saving} className="wt-toolbar-btn primary" style={{ height: 38, padding: '0 1.25rem' }}>
                  {saving ? <><Loader2 size={15} /> Đang lưu...</> : <><Save size={15} /> Lưu</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit step modal */}
      {showStepForm && (
        <div className="wt-modal-overlay" onClick={() => setShowStepForm(false)}>
          <div className="wt-modal" onClick={e => e.stopPropagation()}>
            <form onSubmit={handleStepSave}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {stepEditId ? <><Edit3 size={18} /> Sửa bước duyệt</> : <><Plus size={18} /> Thêm bước duyệt</>}
                </h3>
                <button type="button" onClick={() => setShowStepForm(false)} style={{
                  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#64748b',
                }}><X size={16} /></button>
              </div>
              <div style={{ padding: '1rem 1.5rem' }}>
                <div className="wt-form-group">
                  <label className="wt-form-label">Kiểu người duyệt</label>
                  <select className="wt-form-select" value={stepForm.approver_type}
                    onChange={e => setStepForm({ ...stepForm, approver_type: e.target.value })}>
                    {APPROVER_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="wt-form-group">
                  <label className="wt-form-label">
                    {stepForm.approver_type === 'specific' ? 'Mã nhân viên' : 'Chức vụ người duyệt'} *
                  </label>
                  {stepForm.approver_type === 'role' ? (
                    <select className="wt-form-select" value={stepForm.approver_value}
                      onChange={e => setStepForm({ ...stepForm, approver_value: e.target.value })} required>
                      <option value="">-- Chọn chức vụ --</option>
                      {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <input type="text" className="wt-form-input" value={stepForm.approver_value}
                      onChange={e => setStepForm({ ...stepForm, approver_value: e.target.value })}
                      required placeholder="VD: NV001" />
                  )}
                </div>
                {stepForm.approver_type === 'role' && (
                  <div className="wt-form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" id="deptMatch" checked={!!stepForm.department_match}
                      onChange={e => setStepForm({ ...stepForm, department_match: e.target.checked ? 1 : 0 })}
                      style={{ width: 16, height: 16, accentColor: '#00468C' }} />
                    <label htmlFor="deptMatch" style={{ fontSize: '0.82rem', color: '#334155', cursor: 'pointer' }}>
                      Cùng bộ phận với người gửi yêu cầu
                    </label>
                  </div>
                )}
              </div>
              <div style={{
                display: 'flex', justifyContent: 'flex-end', gap: '0.5rem',
                padding: '0.85rem 1.5rem', borderTop: '1px solid #e2e8f0', background: '#fafbfc',
              }}>
                <button type="button" onClick={() => setShowStepForm(false)} className="wt-toolbar-btn" style={{ height: 38, padding: '0 1rem' }}>
                  Hủy bỏ
                </button>
                <button type="submit" disabled={saving} className="wt-toolbar-btn primary" style={{ height: 38, padding: '0 1.25rem' }}>
                  {saving ? <><Loader2 size={15} /> Đang lưu...</> : <><Save size={15} /> {stepEditId ? 'Cập nhật' : 'Thêm'}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}



