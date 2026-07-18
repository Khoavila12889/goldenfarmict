import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  listApprovalRequests, getPendingApprovals, getApprovalRequest,
  createApprovalRequest, submitApprovalRequest, cancelApprovalRequest,
  approveRequest, rejectRequest, getWorkflows,
} from '../services/api'
import {
  FileCheck, FileX, Clock, CheckCircle, XCircle, AlertTriangle,
  Send, Plus, Search, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Loader2,
  Eye, ThumbsUp, ThumbsDown, Undo2, History, UserCheck,
  FileText, ListTodo, Ban,
} from 'lucide-react'

const STATUS_MAP = {
  draft: { label: 'Nháp', color: '#64748b', bg: '#f1f5f9', icon: FileText },
  pending: { label: 'Chờ duyệt', color: '#d97706', bg: '#fef3c7', icon: Clock },
  in_progress: { label: 'Đang duyệt', color: '#2563eb', bg: '#dbeafe', icon: AlertTriangle },
  approved: { label: 'Đã duyệt', color: '#16a34a', bg: '#dcfce7', icon: CheckCircle },
  rejected: { label: 'Từ chối', color: '#dc2626', bg: '#fef2f2', icon: XCircle },
  cancelled: { label: 'Đã hủy', color: '#6b7280', bg: '#f3f4f6', icon: Ban },
}

export default function Approvals() {
  const userCode = sessionStorage.getItem('user_code')
  const userRole = sessionStorage.getItem('user_role')
  const isAdmin = userRole === 'admin'

  const [activeTab, setActiveTab] = useState('my')
  const [requests, setRequests] = useState([])
  const [pendingList, setPendingList] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [msg, setMsg] = useState('')

  const [selectedReq, setSelectedReq] = useState(null)
  const [reqDetail, setReqDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [workflows, setWorkflows] = useState([])
  const [form, setForm] = useState({ template_id: '', title: '', description: '', metadata: {} })
  const [saving, setSaving] = useState(false)

  // Approve/reject modal
  const [actionModal, setActionModal] = useState(null)

  const loadMy = useCallback(() => {
    setLoading(true)
    listApprovalRequests({ status: statusFilter, requester: userCode, search })
      .then(r => setRequests(r.data?.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [statusFilter, userCode, search])

  const loadPending = useCallback(() => {
    if (!userCode) return
    getPendingApprovals(userCode)
      .then(r => setPendingList(r.data?.data || []))
      .catch(() => {})
  }, [userCode])

  useEffect(() => {
    if (activeTab === 'my') loadMy()
    else loadPending()
  }, [activeTab, loadMy, loadPending])

  function showMsg(text) {
    setMsg(text)
    setTimeout(() => setMsg(''), 3000)
  }

  async function selectRequest(req) {
    if (selectedReq?.id === req.id) { setSelectedReq(null); return }
    setSelectedReq(req)
    setDetailLoading(true)
    try {
      const r = await getApprovalRequest(req.id)
      setReqDetail(r.data)
    } catch { setReqDetail(null) }
    setDetailLoading(false)
  }

  async function openCreateForm() {
    try {
      const r = await getWorkflows(true)
      setWorkflows(r.data?.data || [])
    } catch { setWorkflows([]) }
    setForm({ template_id: '', title: '', description: '', metadata: {} })
    setShowForm(true)
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.template_id || !form.title.trim()) return
    setSaving(true)
    try {
      await createApprovalRequest({
        ...form,
        requester_code: userCode,
        template_id: parseInt(form.template_id),
      })
      setShowForm(false)
      showMsg('Đã tạo phiếu yêu cầu')
      loadMy()
    } catch { showMsg('Lỗi tạo phiếu') }
    setSaving(false)
  }

  async function handleSubmit(reqId) {
    try {
      await submitApprovalRequest(reqId)
      showMsg('Đã gửi phiếu yêu cầu duyệt')
      if (activeTab === 'my') loadMy()
      if (selectedReq?.id === reqId) { setSelectedReq(null); setReqDetail(null) }
    } catch { showMsg('Lỗi gửi phiếu') }
  }

  async function handleCancel(reqId) {
    if (!window.confirm('Hủy phiếu yêu cầu này?')) return
    try {
      await cancelApprovalRequest(reqId)
      showMsg('Đã hủy phiếu')
      if (activeTab === 'my') loadMy()
      if (selectedReq?.id === reqId) { setSelectedReq(null); setReqDetail(null) }
    } catch { showMsg('Lỗi hủy phiếu') }
  }

  async function handleAction(action) {
    if (!actionModal) return
    setSaving(true)
    try {
      if (action === 'approve') {
        await approveRequest(actionModal.id, { approver_code: userCode, comment: actionModal.comment })
        showMsg('Đã phê duyệt')
      } else {
        await rejectRequest(actionModal.id, { approver_code: userCode, comment: actionModal.comment })
        showMsg('Đã từ chối')
      }
      setActionModal(null)
      loadPending()
      if (selectedReq?.id === actionModal.id) { setSelectedReq(null); setReqDetail(null) }
    } catch { showMsg('Lỗi xử lý') }
    setSaving(false)
  }

  function badge(label, bg, color) {
    return <span className="ap-badge" style={{ background: bg, color }}>{label}</span>
  }

  const statusOpts = ['all', 'draft', 'pending', 'in_progress', 'approved', 'rejected', 'cancelled']

  return (
    <div className="ap-page">
      <style>{`
        .ap-page { font-family: inherit; }
        .ap-page * { box-sizing: border-box; }
        @keyframes apFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes apSlideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes apSkeleton { 0% { background-position: -200px 0; } 100% { background-position: calc(200px + 100%) 0; } }

        .ap-skeleton { background: linear-gradient(90deg,#f1f5f9 25%,#e8ecf0 50%,#f1f5f9 75%); background-size: 200px 100%; animation: apSkeleton 1.5s ease-in-out infinite; border-radius: 6px; }

        .ap-tabs { display: flex; gap: 0; background: #fff; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; }
        .ap-tab {
          padding: 0.5rem 1.2rem; font-size: 0.82rem; font-weight: 500; border: none;
          cursor: pointer; background: transparent; color: #64748b; font-family: inherit;
          transition: all 0.12s; border-right: 1px solid #e2e8f0;
          display: flex; align-items: center; gap: 0.35rem;
        }
        .ap-tab:last-child { border-right: none; }
        .ap-tab:hover { background: #f8fafc; }
        .ap-tab.active { background: #00468C; color: #fff; }

        .ap-toolbar {
          display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
          background: #fff; border-radius: 12px; border: 1px solid #e6edf5;
          padding: 0.65rem 1rem; box-shadow: 0 1px 4px rgba(0,0,0,0.04);
        }
        .ap-search-wrap { position: relative; flex: 1; min-width: 180px; }
        .ap-search-wrap input {
          width: 100%; height: 36px; padding: 0 0.7rem 0 2rem;
          background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
          font-size: 0.82rem; outline: none; font-family: inherit; color: #0f172a;
        }
        .ap-search-wrap input:focus { border-color: #00468C; background: #fff; box-shadow: 0 0 0 3px rgba(0,70,140,0.1); }
        .ap-search-wrap .ap-search-icon { position: absolute; left: 0.6rem; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; }

        .ap-toolbar-select {
          height: 36px; padding: 0 0.6rem; border: 1px solid #e2e8f0; border-radius: 8px;
          background: #fff; font-size: 0.78rem; color: #334155; cursor: pointer; font-family: inherit;
          outline: none; min-width: 130px;
        }
        .ap-toolbar-btn {
          height: 36px; display: inline-flex; align-items: center; gap: 0.35rem;
          padding: 0 0.8rem; border-radius: 8px; font-size: 0.78rem; font-weight: 500;
          cursor: pointer; font-family: inherit; white-space: nowrap;
          border: 1px solid #e2e8f0; background: #fff; color: #475569; transition: all 0.12s;
        }
        .ap-toolbar-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
        .ap-toolbar-btn.primary { background: #00468C; color: #fff; border-color: #00468C; }
        .ap-toolbar-btn.primary:hover { background: #003570; }
        .ap-toolbar-btn.danger { background: #fef2f2; color: #dc2626; border-color: #fca5a5; }
        .ap-toolbar-btn.danger:hover { background: #fee2e2; }
        .ap-toolbar-btn.success { background: #f0fdf4; color: #16a34a; border-color: #86efac; }
        .ap-toolbar-btn.success:hover { background: #dcfce7; }

        .ap-badge {
          display: inline-flex; align-items: center; gap: 0.25rem;
          padding: 0.12rem 0.5rem; border-radius: 20px;
          font-size: 0.72rem; font-weight: 600; white-space: nowrap; line-height: 1.5;
        }

        .ap-table-wrap { background: #fff; border-radius: 12px; border: 1px solid #e6edf5; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
        .ap-table-scroll { overflow-x: auto; }
        .ap-table { width: 100%; border-collapse: separate; border-spacing: 0; }
        .ap-table thead { position: sticky; top: 0; z-index: 10; }
        .ap-table thead th {
          background: #f8fafc; color: #475569; font-weight: 700; padding: 0.6rem 0.75rem;
          text-align: left; white-space: nowrap; border-bottom: 1px solid #e2e8f0;
          font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em;
        }
        .ap-table tbody td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: middle; font-size: 0.82rem; }
        .ap-table tbody tr { cursor: pointer; transition: background 0.1s; }
        .ap-table tbody tr:hover td { background: #f8fafc; }
        .ap-table tbody tr.ap-row-selected td { background: #eff6ff; }
        .ap-table tbody tr.ap-row-selected td:first-child { box-shadow: inset 3px 0 0 #00468C; }
        .ap-table tbody tr:last-child td { border-bottom: none; }

        .ap-panel-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.25); z-index: 200; opacity: 0; pointer-events: none; transition: opacity 0.2s; }
        .ap-panel-overlay.open { opacity: 1; pointer-events: auto; }
        .ap-side-panel {
          position: fixed; top: 0; right: -480px; width: 460px; height: 100vh; background: #fff;
          z-index: 201; transition: right 0.25s cubic-bezier(0.4,0,0.2,1);
          box-shadow: -4px 0 24px rgba(0,0,0,0.1); display: flex; flex-direction: column;
        }
        .ap-side-panel.open { right: 0; }

        .ap-section { margin-bottom: 1rem; }
        .ap-section-title {
          font-size: 0.68rem; color: #94a3b8; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.05em; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.35rem;
        }
        .ap-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem 1rem; }
        .ap-detail-label { font-size: 0.65rem; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
        .ap-detail-value { font-size: 0.82rem; color: #0f172a; font-weight: 500; }

        .ap-timeline { position: relative; padding-left: 1.5rem; }
        .ap-timeline::before { content: ''; position: absolute; left: 7px; top: 0; bottom: 0; width: 2px; background: #e2e8f0; }
        .ap-timeline-entry { position: relative; padding-bottom: 0.75rem; }
        .ap-timeline-dot {
          position: absolute; left: -1.5rem; top: 4px; width: 16px; height: 16px;
          border-radius: 50%; display: flex; align-items: center; justify-content: center;
          z-index: 1;
        }
        .ap-timeline-content { font-size: 0.8rem; color: #334155; line-height: 1.4; }
        .ap-timeline-meta { font-size: 0.7rem; color: #94a3b8; margin-top: 2px; }

        .ap-step-indicator { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
        .ap-step-dot {
          width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center;
          justify-content: center; font-size: 0.7rem; font-weight: 700; flex-shrink: 0;
        }
        .ap-step-line { width: 20px; height: 2px; background: #e2e8f0; flex-shrink: 0; }
        .ap-step-label { font-size: 0.72rem; color: #64748b; }

        .ap-modal-overlay {
          position: fixed; inset: 0; background: rgba(15,23,42,0.45); display: flex;
          align-items: center; justify-content: center; z-index: 300; backdrop-filter: blur(4px);
          animation: apFadeIn 0.15s ease;
        }
        .ap-modal {
          background: #fff; border-radius: 16px; width: 520px; max-width: 95vw;
          max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.15);
          animation: apFadeIn 0.15s ease;
        }
        .ap-modal::-webkit-scrollbar { width: 4px; }
        .ap-modal::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }

        .ap-form-group { margin-bottom: 0.65rem; }
        .ap-form-label { display: block; font-size: 0.72rem; color: #64748b; margin-bottom: 0.2rem; font-weight: 500; }
        .ap-form-input, .ap-form-select, .ap-form-textarea {
          width: 100%; padding: 0.45rem 0.65rem; background: #f8fafc; border: 1px solid #e2e8f0;
          border-radius: 8px; font-size: 0.82rem; outline: none; font-family: inherit; color: #0f172a;
        }
        .ap-form-input:focus, .ap-form-select:focus, .ap-form-textarea:focus {
          border-color: #00468C; background: #fff; box-shadow: 0 0 0 3px rgba(0,70,140,0.1);
        }
        .ap-form-textarea { resize: vertical; min-height: 60px; }

        .ap-count {
          background: #e8f0fe; color: #00468C; padding: 0.15rem 0.5rem; border-radius: 20px;
          font-size: 0.7rem; font-weight: 600; margin-left: 0.3rem;
        }
      `}</style>

      {/* Toast */}
      {msg && (
        <div className="ap-toast" style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12,
          padding: '0.75rem 1rem', color: '#166534', fontSize: '0.85rem', fontWeight: 600,
          boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          animation: 'apSlideIn 0.25s ease',
        }}>
          <CheckCircle size={18} /> {msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileCheck size={24} style={{ color: '#00468C' }} />
            Phê duyệt
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0.15rem 0 0' }}>Quy trình phê duyệt đa cấp — phiếu yêu cầu và luồng duyệt</p>
        </div>
        <button onClick={openCreateForm} className="ap-toolbar-btn primary" style={{ height: 40, padding: '0 1.1rem', fontSize: '0.85rem' }}>
          <Plus size={16} /> Tạo phiếu
        </button>
      </div>

      {/* Tabs */}
      <div className="ap-tabs" style={{ marginBottom: '0.75rem' }}>
        <button className={`ap-tab ${activeTab === 'my' ? 'active' : ''}`} onClick={() => setActiveTab('my')}>
          <FileText size={15} /> Yêu cầu của tôi
        </button>
        <button className={`ap-tab ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => { setActiveTab('pending'); loadPending() }}>
          <Clock size={15} /> Cần duyệt
          {pendingList.length > 0 && <span className="ap-count">{pendingList.length}</span>}
        </button>
      </div>

      {/* Toolbar (shown for "my" tab) */}
      {activeTab === 'my' && (
        <div className="ap-toolbar" style={{ marginBottom: '0.75rem' }}>
          <div className="ap-search-wrap">
            <Search size={15} className="ap-search-icon" />
            <input type="text" placeholder="Tìm theo tiêu đề, người gửi..." value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="ap-toolbar-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            {statusOpts.filter(s => s !== 'all').map(s => (
              <option key={s} value={s}>{STATUS_MAP[s]?.label || s}</option>
            ))}
          </select>
        </div>
      )}

      {/* Pending summary bar */}
      {activeTab === 'pending' && pendingList.length > 0 && (
        <div style={{
          background: '#eff6ff', border: '1px solid #b3d0f0', borderRadius: 10,
          padding: '0.55rem 0.85rem', marginBottom: '0.75rem',
          fontSize: '0.82rem', color: '#00468C', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: '0.4rem',
        }}>
          <AlertTriangle size={16} />
          Bạn có <strong style={{ margin: '0 0.25rem' }}>{pendingList.length}</strong> phiếu cần xử lý
        </div>
      )}

      {/* Data table */}
      <div className="ap-table-wrap">
        <div className="ap-table-scroll">
          <table className="ap-table">
            <thead>
              <tr>
                <th style={{ minWidth: 50 }}>ID</th>
                <th style={{ minWidth: 180 }}>Tiêu đề</th>
                <th style={{ minWidth: 130 }}>Người gửi</th>
                <th style={{ minWidth: 110 }}>Bộ phận</th>
                {activeTab === 'my' && <th style={{ minWidth: 110 }}>Bước</th>}
                {activeTab === 'pending' && <th style={{ minWidth: 120 }}>Bước cần duyệt</th>}
                <th style={{ minWidth: 110 }}>Trạng thái</th>
                <th style={{ minWidth: 90 }}>Ngày tạo</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1,2,3,4].map(i => (
                  <tr key={`s-${i}`}>
                    {[1,2,3,4,5,6,7].map(j => (
                      <td key={j}><div className="ap-skeleton" style={{ height: 12, width: j === 2 ? '65%' : '50%' }} /></td>
                    ))}
                  </tr>
                ))
              ) : (activeTab === 'my' ? requests : pendingList).length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '3rem 1rem', textAlign: 'center' }}>
                    <FileCheck size={40} style={{ color: '#cbd5e1', marginBottom: '0.5rem' }} />
                    <div style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 500 }}>
                      {activeTab === 'my' ? 'Chưa có phiếu yêu cầu nào' : 'Không có phiếu cần duyệt'}
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                      {activeTab === 'my' ? 'Tạo phiếu yêu cầu mới để bắt đầu' : 'Tất cả phiếu đã được xử lý'}
                    </div>
                  </td>
                </tr>
              ) : (activeTab === 'my' ? requests : pendingList).map(req => {
                const st = STATUS_MAP[req.status] || STATUS_MAP.draft
                const sel = selectedReq?.id === req.id
                const StIcon = st.icon
                return (
                  <tr key={req.id} className={sel ? 'ap-row-selected' : ''} onClick={() => selectRequest(req)}>
                    <td style={{ fontWeight: 600, color: '#00468C', fontSize: '0.78rem' }}>#{req.id}</td>
                    <td style={{ fontWeight: 500 }}>{req.title}</td>
                    <td>
                      <div style={{ fontSize: '0.82rem' }}>{req.requester_name || req.requester_code}</div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>{req.requester_code}</div>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{req.requester_dept || '—'}</td>
                    {activeTab === 'my' && (
                      <td style={{ fontSize: '0.78rem' }}>
                        <span style={{
                          background: '#f1f5f9', padding: '0.08rem 0.4rem', borderRadius: 4,
                          fontSize: '0.7rem', color: '#475569', fontWeight: 600,
                        }}>
                          {req.current_step}/{req.total_steps}
                        </span>
                      </td>
                    )}
                    {activeTab === 'pending' && (
                      <td style={{ fontSize: '0.78rem' }}>
                        <span style={{
                          background: '#dbeafe', padding: '0.08rem 0.4rem', borderRadius: 4,
                          fontSize: '0.7rem', color: '#2563eb', fontWeight: 600,
                        }}>
                          Bước {req.current_step}/{req.total_steps}
                        </span>
                      </td>
                    )}
                    <td>{badge(st.label, st.bg, st.color)}</td>
                    <td style={{ fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {req.created_at?.split(' ')[0] || '—'}
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
          {(activeTab === 'my' ? requests : pendingList).length} phiếu
        </div>
      </div>

      {/* Panel overlay */}
      <div className={`ap-panel-overlay ${selectedReq ? 'open' : ''}`} onClick={() => setSelectedReq(null)} />

      {/* Detail drawer */}
      <div className={`ap-side-panel ${selectedReq ? 'open' : ''}`}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <FileCheck size={20} style={{ color: '#00468C', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>#{selectedReq?.id} — {selectedReq?.title}</div>
              {reqDetail?.template?.name && (
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Quy trình: {reqDetail.template.name}</div>
              )}
            </div>
          </div>
          <button onClick={() => setSelectedReq(null)} style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#64748b',
          }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
          {detailLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
              <Loader2 size={20} style={{ animation: 'apFadeIn 1s infinite' }} />
            </div>
          ) : reqDetail ? (
            <>
              {/* Status badge */}
              <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {(() => {
                  const st = STATUS_MAP[reqDetail.status] || STATUS_MAP.draft
                  const StIcon = st.icon
                  return badge(st.label, st.bg, st.color)
                })()}
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{reqDetail.created_at}</span>
              </div>

              {/* Step indicator */}
              {reqDetail.steps?.length > 0 && (
                <div className="ap-section">
                  <div className="ap-section-title"><ListTodo size={13} /> Các bước phê duyệt</div>
                  <div className="ap-step-indicator">
                    {reqDetail.steps.map((step, idx) => {
                      const isPast = step.step_order < reqDetail.current_step
                      const isCurrent = step.step_order === reqDetail.current_step
                      const isFuture = step.step_order > reqDetail.current_step
                      const done = ['approved', 'rejected'].includes(reqDetail.status) && isPast
                      return (
                        <React.Fragment key={step.id}>
                          {idx > 0 && <div className="ap-step-line" style={{ background: isPast ? '#16a34a' : '#e2e8f0' }} />}
                          <div style={{ textAlign: 'center' }}>
                            <div className="ap-step-dot" style={{
                              background: done || reqDetail.status === 'approved' ? '#dcfce7' : isCurrent ? '#dbeafe' : '#f1f5f9',
                              color: done || reqDetail.status === 'approved' ? '#16a34a' : isCurrent ? '#2563eb' : '#94a3b8',
                              border: isCurrent ? '2px solid #2563eb' : 'none',
                            }}>
                              {done || reqDetail.status === 'approved' ? <CheckCircle size={14} /> : step.step_order}
                            </div>
                            <div className="ap-step-label">{step.approver_value || 'Cấp ' + step.step_order}</div>
                          </div>
                        </React.Fragment>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="ap-section">
                <div className="ap-section-title"><FileText size={13} /> Thông tin chung</div>
                <div className="ap-detail-grid">
                  <div>
                    <div className="ap-detail-label">Người gửi</div>
                    <div className="ap-detail-value">{reqDetail.requester_name || reqDetail.requester_code}</div>
                  </div>
                  <div>
                    <div className="ap-detail-label">Bộ phận</div>
                    <div className="ap-detail-value">{reqDetail.requester_dept || '—'}</div>
                  </div>
                  <div>
                    <div className="ap-detail-label">Trạng thái</div>
                    <div className="ap-detail-value">{STATUS_MAP[reqDetail.status]?.label || reqDetail.status}</div>
                  </div>
                  <div>
                    <div className="ap-detail-label">Bước hiện tại</div>
                    <div className="ap-detail-value">{reqDetail.current_step}/{reqDetail.total_steps}</div>
                  </div>
                </div>
              </div>

              {/* Description */}
              {reqDetail.description && (
                <div className="ap-section">
                  <div className="ap-section-title"><FileText size={13} /> Mô tả</div>
                  <div style={{
                    fontSize: '0.82rem', color: '#475569', lineHeight: 1.5,
                    background: '#f8fafc', borderRadius: 8, padding: '0.5rem 0.7rem',
                    border: '1px solid #f1f5f9',
                  }}>{reqDetail.description}</div>
                </div>
              )}

              {/* Actions (for pending tab - user is approver) */}
              {activeTab === 'pending' && selectedReq && (
                <div className="ap-section" style={{
                  padding: '0.85rem', background: '#f8fafc', borderRadius: 10,
                  border: '1px solid #e2e8f0',
                }}>
                  <div className="ap-section-title" style={{ marginBottom: '0.6rem' }}>
                    <UserCheck size={13} /> Hành động phê duyệt
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      className="ap-toolbar-btn success"
                      onClick={() => setActionModal({ id: selectedReq.id, action: 'approve', comment: '' })}
                    >
                      <ThumbsUp size={14} /> Duyệt
                    </button>
                    <button
                      className="ap-toolbar-btn danger"
                      onClick={() => setActionModal({ id: selectedReq.id, action: 'reject', comment: '' })}
                    >
                      <ThumbsDown size={14} /> Từ chối
                    </button>
                  </div>
                </div>
              )}

              {/* Actions for my tab (requester) */}
              {activeTab === 'my' && ['draft'].includes(reqDetail.status) && (
                <div className="ap-section" style={{ display: 'flex', gap: '0.4rem' }}>
                  <button className="ap-toolbar-btn success" onClick={() => handleSubmit(reqDetail.id)}>
                    <Send size={14} /> Gửi duyệt
                  </button>
                  <button className="ap-toolbar-btn" onClick={() => handleCancel(reqDetail.id)}>
                    <Ban size={14} /> Hủy
                  </button>
                </div>
              )}
              {activeTab === 'my' && ['pending', 'in_progress'].includes(reqDetail.status) && (
                <div className="ap-section">
                  <button className="ap-toolbar-btn" onClick={() => handleCancel(reqDetail.id)}>
                    <Undo2 size={14} /> Thu hồi yêu cầu
                  </button>
                </div>
              )}

              {/* Timeline logs */}
              {reqDetail.logs?.length > 0 && (
                <div className="ap-section">
                  <div className="ap-section-title"><History size={13} /> Nhật ký phê duyệt</div>
                  <div className="ap-timeline">
                    {reqDetail.logs.map(log => {
                      const LogIcon = log.action === 'approved' ? CheckCircle : log.action === 'rejected' ? XCircle : Clock
                      const dotColor = log.action === 'approved' ? '#16a34a' : log.action === 'rejected' ? '#dc2626' : '#d97706'
                      const dotBg = log.action === 'approved' ? '#dcfce7' : log.action === 'rejected' ? '#fef2f2' : '#fef3c7'
                      return (
                        <div key={log.id} className="ap-timeline-entry">
                          <div className="ap-timeline-dot" style={{ background: dotBg }}>
                            <LogIcon size={10} style={{ color: dotColor }} />
                          </div>
                          <div>
                            <div className="ap-timeline-content">
                              <strong>{log.approver_name || log.approver_code}</strong>
                              {' '}{log.action === 'approved' ? 'đã phê duyệt' : log.action === 'rejected' ? 'đã từ chối' : log.action}
                              {log.comment && <span style={{ color: '#64748b' }}>: "{log.comment}"</span>}
                            </div>
                            <div className="ap-timeline-meta">Bước {log.step_order} — {log.created_at}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Create form modal */}
      {showForm && (
        <div className="ap-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="ap-modal" onClick={e => e.stopPropagation()}>
            <form onSubmit={handleCreate}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0',
              }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Plus size={18} /> Tạo phiếu yêu cầu duyệt
                </h3>
                <button type="button" onClick={() => setShowForm(false)} style={{
                  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#64748b',
                }}><X size={16} /></button>
              </div>
              <div style={{ padding: '1rem 1.5rem' }}>
                <div className="ap-form-group">
                  <label className="ap-form-label">Quy trình *</label>
                  <select className="ap-form-select" value={form.template_id}
                    onChange={e => setForm({ ...form, template_id: e.target.value })} required>
                    <option value="">-- Chọn quy trình --</option>
                    {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div className="ap-form-group">
                  <label className="ap-form-label">Tiêu đề *</label>
                  <input type="text" className="ap-form-input" value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })} required
                    placeholder="VD: Đề nghị mua máy tính cho nhân viên mới" />
                </div>
                <div className="ap-form-group">
                  <label className="ap-form-label">Mô tả chi tiết</label>
                  <textarea className="ap-form-textarea" value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="Nhập nội dung yêu cầu, lý do, thông tin kèm theo..." rows={4} />
                </div>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'flex-end', gap: '0.5rem',
                padding: '0.85rem 1.5rem', borderTop: '1px solid #e2e8f0', background: '#fafbfc',
              }}>
                <button type="button" onClick={() => setShowForm(false)} className="ap-toolbar-btn" style={{ height: 38, padding: '0 1rem' }}>
                  Hủy bỏ
                </button>
                <button type="submit" disabled={saving} className="ap-toolbar-btn primary" style={{ height: 38, padding: '0 1.25rem', fontSize: '0.85rem' }}>
                  {saving ? <><Loader2 size={15} /> Đang tạo...</> : <><CheckCircle size={16} /> Tạo phiếu (Nháp)</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Approve/Reject confirmation modal */}
      {actionModal && (
        <div className="ap-modal-overlay" onClick={() => setActionModal(null)}>
          <div className="ap-modal" onClick={e => e.stopPropagation()}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0',
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {actionModal.action === 'approve' ? <><ThumbsUp size={18} style={{ color: '#16a34a' }} /> Xác nhận phê duyệt</> : <><ThumbsDown size={18} style={{ color: '#dc2626' }} /> Xác nhận từ chối</>}
              </h3>
              <button type="button" onClick={() => setActionModal(null)} style={{
                width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#64748b',
              }}><X size={16} /></button>
            </div>
            <div style={{ padding: '1rem 1.5rem' }}>
              <div className="ap-form-group">
                <label className="ap-form-label">Ý kiến / Lý do</label>
                <textarea className="ap-form-textarea"
                  value={actionModal.comment}
                  onChange={e => setActionModal({ ...actionModal, comment: e.target.value })}
                  placeholder={actionModal.action === 'approve' ? 'Nhập ý kiến duyệt (không bắt buộc)...' : 'Nhập lý do từ chối...'}
                  rows={3} />
              </div>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: '0.5rem',
              padding: '0.85rem 1.5rem', borderTop: '1px solid #e2e8f0', background: '#fafbfc',
            }}>
              <button onClick={() => setActionModal(null)} className="ap-toolbar-btn" style={{ height: 38, padding: '0 1rem' }}>
                Quay lại
              </button>
              {actionModal.action === 'approve' ? (
                <button onClick={() => handleAction('approve')} disabled={saving} className="ap-toolbar-btn success" style={{ height: 38, padding: '0 1.25rem' }}>
                  {saving ? <Loader2 size={15} /> : <><ThumbsUp size={15} /> Xác nhận duyệt</>}
                </button>
              ) : (
                <button onClick={() => handleAction('reject')} disabled={saving} className="ap-toolbar-btn danger" style={{ height: 38, padding: '0 1.25rem' }}>
                  {saving ? <Loader2 size={15} /> : <><ThumbsDown size={15} /> Xác nhận từ chối</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



