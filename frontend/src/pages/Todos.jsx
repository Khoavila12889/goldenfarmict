import React, { useState, useEffect, useRef } from 'react'
import {
  CheckSquare, Plus, Search, Filter, Calendar, User, Tag,
  Clock, AlertCircle, CheckCircle2, MoreVertical, Trash2, Edit2,
  Users, Building, ListTodo, Layers, RefreshCw, X, ChevronRight,
  MessageCircle, Paperclip, Link as LinkIcon, Send, ExternalLink, 
  FileText, FileSpreadsheet, Image as ImageIcon
} from 'lucide-react'
import { 
  getTodos, getTodoStats, createTodo, updateTodo, updateTodoStatus, 
  deleteTodo, getTodoAssignees, getDepartments, approveTodo,
  getTodoComments, addTodoComment, getTodoAttachments,
  uploadTodoAttachment, addTodoUrl, deleteTodoAttachment,
  apiUrl,
} from '../services/api'
import { formatDate } from '../utils/date'
import './Todos.css'

function normAtt(a) {
  return {
    id: a.id,
    name: a.file_name || a.file_url,
    type: a.file_type === 'url' ? 'url' : 'file',
    url: a.file_url,
    ext: a.file_type,
    uploader_code: a.uploader_code,
    created_at: a.created_at,
  }
}

export default function Todos() {
  const [todos, setTodos] = useState([])
  const [stats, setStats] = useState({ total: 0, todo: 0, in_progress: 0, review: 0, completed: 0, overdue: 0 })
  const [loading, setLoading] = useState(true)
  
  // Filters
  const [scopeFilter, setScopeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  
  // Modal states
  const [showModal, setShowModal] = useState(false)
  const [editingTodo, setEditingTodo] = useState(null)
  
  // JIRA/TRELLO STYLE - DETAIL MODAL STATES
  const [viewingTodo, setViewingTodo] = useState(null)
  const [todoComments, setTodoComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [todoAttachments, setTodoAttachments] = useState([])
  const [detailBusy, setDetailBusy] = useState(false)
  
  // Auxiliary data
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  
  // Form fields
  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formScope, setFormScope] = useState('personal')
  const [formDept, setFormDept] = useState('')
  const [formAssigneeCode, setFormAssigneeCode] = useState('')
  const [formPriority, setFormPriority] = useState('medium')
  const [formDueDate, setFormDueDate] = useState('')
  const [dueDateError, setDueDateError] = useState('')
  const [formTags, setFormTags] = useState('')
  const [formSubtasks, setFormSubtasks] = useState([])
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')

  const userRole = sessionStorage.getItem('user_role') || 'user'
  const userDept = sessionStorage.getItem('user_department') || ''
  const userCode = sessionStorage.getItem('user_code') || ''
  
  const userName = sessionStorage.getItem('user_name') || userCode

  const canEditTodo = (todo) => {
    if (userRole === 'admin') return true
    if (userRole === 'head') {
      if (todo.scope === 'department' && String(todo.department) === userDept) return true
      if (String(todo.creator_code) === userCode || String(todo.assignee_code) === userCode) return true
      return false
    }
    return String(todo.creator_code) === userCode || String(todo.assignee_code) === userCode
  }

  const canDeleteTodo = (todo) => {
    if (userRole === 'admin') return true
    if (userRole === 'head') {
      if (todo.scope === 'department' && String(todo.department) === userDept) return true
      if (todo.scope === 'personal' && String(todo.creator_code) === userCode) return true
      return false
    }
    return String(todo.creator_code) === userCode
  }

  const canChangeStatus = (todo) => {
    if (userRole === 'admin') return true
    if (userRole === 'head') {
      if (todo.scope === 'department' && String(todo.department) === userDept) return true
      if (String(todo.creator_code) === userCode || String(todo.assignee_code) === userCode) return true
      return false
    }
    return String(todo.creator_code) === userCode || String(todo.assignee_code) === userCode
  }

  const canSeeCancelledOption = (todo) => {
    return userRole === 'admin' || userRole === 'head'
  }

  const isPendingApproval = (todo) => {
    return todo.scope === 'department' && Number(todo.is_dept_approved) === 0
  }

  const canApproveTodo = (todo) => {
    if (!isPendingApproval(todo)) return false
    if (userRole === 'admin') return true
    if (userRole === 'head') return String(todo.department) === userDept
    return false
  }

  const handleApproveTodo = async (todoId) => {
    if (!window.confirm('Bạn có chắc chắn muốn phê duyệt công việc phòng ban này?')) return
    try {
      await approveTodo(todoId)
      fetchData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Không thể phê duyệt công việc')
    }
  }

  useEffect(() => {
    loadAuxData()
  }, [])

  useEffect(() => {
    fetchData()
  }, [scopeFilter, statusFilter, priorityFilter, searchQuery])

  // --- Realtime SSE ---
  useEffect(() => {
    let sse = null
    function connectSSE() {
      try {
        sse = new EventSource(apiUrl('/events'))
        sse.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (['todo_created', 'todo_updated', 'todo_deleted', 'comment_added', 'attachment_added'].includes(data.event || data.type)) {
              fetchData()
            }
          } catch (err) {}
        }
        sse.onerror = (err) => {
          setTimeout(() => {
            if (sse) sse.close()
            connectSSE()
          }, 3000)
        }
      } catch (err) {}
    }
    connectSSE()
    return () => { if (sse) sse.close() }
  }, [])

  const loadAuxData = async () => {
    try {
      const [empRes, deptRes] = await Promise.all([getTodoAssignees(), getDepartments()])
      setEmployees(empRes.data?.data || [])
      const allDepts = deptRes.data?.data || []
      if (userRole === 'admin') {
        setDepartments(allDepts)
      } else {
        setDepartments(allDepts.filter(d => d.name === userDept))
      }
    } catch (e) {
      console.error(e)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const [resTodos, resStats] = await Promise.all([
        getTodos({ scope: scopeFilter, status: statusFilter, priority: priorityFilter, search: searchQuery }),
        getTodoStats()
      ])
      setTodos(resTodos.data?.data || [])
      setStats(resStats.data?.data || { total: 0, todo: 0, in_progress: 0, review: 0, completed: 0, overdue: 0 })
    } catch (err) {} finally {
      setLoading(false)
    }
  }

  // --- ACTIONS FOR MODALS ---
  const openCreateModal = () => {
    setEditingTodo(null)
    setFormTitle('')
    setFormDesc('')
    setFormScope(userRole === 'head' ? 'department' : 'personal')
    setFormDept(userDept)
    setFormAssigneeCode(userRole === 'head' ? '' : userCode)
    setFormPriority('medium')
    setFormDueDate('')
    setDueDateError('')
    setFormTags('')
    setFormSubtasks([])
    setShowModal(true)
  }

  const openEditModal = (todo) => {
    setEditingTodo(todo)
    setFormTitle(todo.title)
    setFormDesc(todo.description || '')
    setFormScope(todo.scope)
    setFormDept(todo.department || '')
    setFormAssigneeCode(todo.assignee_code ? String(todo.assignee_code) : '')
    setFormPriority(todo.priority)
    setFormDueDate(todo.due_date || '')
    setDueDateError('')
    setFormTags(todo.tags || '')
    setFormSubtasks(todo.subtasks ? todo.subtasks.map(s => ({ ...s })) : [])
    setShowModal(true)
  }

  const handleScopeChange = (val) => {
    setFormScope(val)
    if (val === 'personal') {
      setFormAssigneeCode(userCode)
    } else {
      setFormAssigneeCode('')
    }
  }

  const handleSaveTodo = async (e) => {
    e.preventDefault()
    if (!formTitle.trim()) return
    const dueErr = validateDueDate(formDueDate)
    if (dueErr) { setDueDateError(dueErr); return; }

    const selectedEmp = employees.find(e => String(e.employee_code) === String(formAssigneeCode))
    const isPersonal = formScope === 'personal'
    const payload = {
      title: formTitle,
      description: formDesc,
      scope: formScope,
      department: isPersonal ? '' : formDept,
      assignee_code: isPersonal ? userCode : formAssigneeCode,
      assignee_name: isPersonal ? userName : (selectedEmp ? selectedEmp.full_name : ''),
      priority: formPriority,
      due_date: formDueDate,
      tags: formTags,
      subtasks: formSubtasks
    }

    try {
      if (editingTodo) { await updateTodo(editingTodo.id, payload) } 
      else { await createTodo(payload) }
      setShowModal(false)
      fetchData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Đã có lỗi xảy ra khi lưu công việc')
    }
  }

  const handleStatusChange = async (todoId, newStatus) => {
    try {
      await updateTodoStatus(todoId, newStatus)
      fetchData()
    } catch (err) {
      alert(err.response?.data?.detail || 'Không thể cập nhật trạng thái công việc')
    }
  }

  const handleDeleteTodo = async (todoId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa công việc này?')) return
    try {
      await deleteTodo(todoId)
      fetchData()
    } catch (err) {
      alert('Không thể xóa công việc')
    }
  }

  const validateDueDate = (dtStr) => {
    if (!dtStr || !/^\d{4}-\d{2}-\d{2}$/.test(dtStr)) return ''
    const today = new Date().toISOString().split('T')[0]
    return dtStr < today ? 'Đã hết giờ, không thể đặt hạn trước ngày hiện tại!' : ''
  }

  const handleDueDateChange = (raw) => {
    setFormDueDate(raw)
    setDueDateError(validateDueDate(raw))
  }

  // Subtask Form Logic
  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return
    setFormSubtasks([...formSubtasks, { title: newSubtaskTitle.trim(), is_completed: 0 }])
    setNewSubtaskTitle('')
  }
  const handleToggleSubtask = (index) => {
    setFormSubtasks(formSubtasks.map((sub, i) => i === index ? { ...sub, is_completed: sub.is_completed ? 0 : 1 } : sub))
  }
  const handleRemoveSubtask = (index) => {
    setFormSubtasks(formSubtasks.filter((_, i) => i !== index))
  }

  // =========================================================
  // JIRA/TRELLO STYLE DETAIL & DISCUSSION LOGIC
  // =========================================================

  const openTodoDetail = async (todo) => {
    setViewingTodo(todo)
    setTodoComments([])
    setTodoAttachments([])
    setCommentText('')
    setDetailBusy(true)
    try {
      const [cmtRes, attRes] = await Promise.allSettled([
        getTodoComments(todo.id),
        getTodoAttachments(todo.id),
      ])
      if (cmtRes.status === 'fulfilled') setTodoComments(cmtRes.value.data?.data || [])
      if (attRes.status === 'fulfilled') setTodoAttachments((attRes.value.data?.data || []).map(normAtt))
    } catch (err) {
      console.error("Lỗi tải chi tiết công việc", err)
    } finally {
      setDetailBusy(false)
    }
  }

  const handleSendComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || !viewingTodo) return;
    
    const optimistic = {
      id: `tmp-${Date.now()}`,
      todo_id: viewingTodo.id,
      user_code: userCode,
      full_name: userName,
      content: commentText,
      created_at: new Date().toISOString()
    };

    // Optimistic UI update
    setTodoComments([...todoComments, optimistic]);
    setCommentText('');

    try {
      const res = await addTodoComment(viewingTodo.id, optimistic.content);
      const saved = res.data?.data;
      if (saved) {
        setTodoComments(prev => prev.map(c => (c.id === optimistic.id ? saved : c)));
      }
    } catch (err) {
      console.error("Lỗi gửi tin nhắn", err);
      setTodoComments(prev => prev.filter(c => c.id !== optimistic.id));
      alert(err.response?.data?.detail || 'Không thể gửi bình luận');
    }
  }

  const handleAttachFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !viewingTodo) return;
    
    const ext = file.name.split('.').pop().toLowerCase();
    const allowed = ['jpg', 'jpeg', 'png', 'webp', 'xlsx', 'doc', 'docx', 'pdf'];
    if (!allowed.includes(ext)) {
      alert('Chỉ hỗ trợ ảnh, PDF, Word, Excel.');
      return;
    }

    try {
      const res = await uploadTodoAttachment(viewingTodo.id, file);
      const saved = res.data?.data;
      if (saved) setTodoAttachments(prev => [normAtt(saved), ...prev]);
    } catch (err) {
      console.error("Lỗi tải file", err);
      alert(err.response?.data?.detail || 'Không thể tải file lên');
    }
  }

  const handleAddUrl = async () => {
    if (!viewingTodo) return;
    const url = prompt("Nhập đường dẫn liên kết (URL):");
    if (!url || !url.trim()) return;
    const title = prompt("Nhập tên hiển thị cho liên kết (tuỳ chọn):", url.trim()) || url.trim();
    try {
      const res = await addTodoUrl(viewingTodo.id, url.trim(), title === url.trim() ? '' : title);
      const saved = res.data?.data;
      if (saved) setTodoAttachments(prev => [normAtt(saved), ...prev]);
    } catch (err) {
      alert(err.response?.data?.detail || 'Không thể thêm liên kết');
    }
  }

  const handleDeleteAttachment = async (att) => {
    if (!att.id || String(att.id).startsWith('tmp-')) return;
    if (!window.confirm(`Xóa đính kèm "${att.name}"?`)) return;
    try {
      await deleteTodoAttachment(att.id);
      setTodoAttachments(prev => prev.filter(a => a.id !== att.id));
    } catch (err) {
      alert(err.response?.data?.detail || 'Không thể xóa file đính kèm');
    }
  }

  const columns = [
    { id: 'todo', label: 'Cần làm', icon: Clock, color: '#64748b' },
    { id: 'in_progress', label: 'Đang thực hiện', icon: RefreshCw, color: '#3b82f6' },
    { id: 'review', label: 'Chờ duyệt', icon: AlertCircle, color: '#f59e0b' },
    { id: 'completed', label: 'Đã hoàn thành', icon: CheckCircle2, color: '#10b981' }
  ]

  const isOverdue = (dateStr, status) => {
    if (!dateStr || status === 'completed' || status === 'cancelled') return false
    const today = new Date().toISOString().split('T')[0]
    return dateStr < today
  }

  return (
    <div className="todos-container">
      {/* Header Section */}
      <div className="todos-header">
        <div className="todos-title-section">
          <div className="todos-title-icon">
            <CheckSquare size={24} />
          </div>
          <div>
            <h1 className="todos-title">Quản lý Công việc & Todos</h1>
            <div className="todos-subtitle">Theo dõi, phân công & tối ưu hiệu suất công việc cá nhân và phòng ban</div>
          </div>
        </div>
        <button className="btn-primary" onClick={openCreateModal}>
          <Plus size={18} /> Tạo công việc mới
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="todos-stats-grid">
        <div className={`todos-stat-card ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
          <div className="todos-stat-icon total"><ListTodo size={20} /></div>
          <div className="todos-stat-info">
            <div className="val">{stats.total}</div>
            <div className="lbl">Tổng công việc</div>
          </div>
        </div>
        <div className={`todos-stat-card ${statusFilter === 'todo' ? 'active' : ''}`} onClick={() => setStatusFilter('todo')}>
          <div className="todos-stat-icon todo"><Clock size={20} /></div>
          <div className="todos-stat-info">
            <div className="val">{stats.todo}</div>
            <div className="lbl">Cần làm</div>
          </div>
        </div>
        <div className={`todos-stat-card ${statusFilter === 'in_progress' ? 'active' : ''}`} onClick={() => setStatusFilter('in_progress')}>
          <div className="todos-stat-icon in_progress"><RefreshCw size={20} /></div>
          <div className="todos-stat-info">
            <div className="val">{stats.in_progress}</div>
            <div className="lbl">Đang xử lý</div>
          </div>
        </div>
        <div className={`todos-stat-card ${statusFilter === 'review' ? 'active' : ''}`} onClick={() => setStatusFilter('review')}>
          <div className="todos-stat-icon review"><AlertCircle size={20} /></div>
          <div className="todos-stat-info">
            <div className="val">{stats.review}</div>
            <div className="lbl">Chờ kiểm tra</div>
          </div>
        </div>
        <div className={`todos-stat-card ${statusFilter === 'completed' ? 'active' : ''}`} onClick={() => setStatusFilter('completed')}>
          <div className="todos-stat-icon completed"><CheckCircle2 size={20} /></div>
          <div className="todos-stat-info">
            <div className="val">{stats.completed}</div>
            <div className="lbl">Đã hoàn thành</div>
          </div>
        </div>
        <div className="todos-stat-card" onClick={() => { setStatusFilter('all'); setPriorityFilter('urgent'); }}>
          <div className="todos-stat-icon overdue"><AlertCircle size={20} /></div>
          <div className="todos-stat-info">
            <div className="val" style={{ color: stats.overdue > 0 ? '#f87171' : 'inherit' }}>{stats.overdue}</div>
            <div className="lbl">Quá hạn</div>
          </div>
        </div>
      </div>

      {/* Toolbar Controls */}
      <div className="todos-toolbar">
        <div className="todos-controls-left">
          <div className="scope-tabs">
            <button className={`scope-btn ${scopeFilter === 'all' ? 'active' : ''}`} onClick={() => setScopeFilter('all')}>
              <Layers size={14} /> Tất cả
            </button>
            <button className={`scope-btn ${scopeFilter === 'personal' ? 'active' : ''}`} onClick={() => setScopeFilter('personal')}>
              <User size={14} /> Cá nhân
            </button>
            <button className={`scope-btn ${scopeFilter === 'department' ? 'active' : ''}`} onClick={() => setScopeFilter('department')}>
              <Building size={14} /> Phòng ban ({userDept || 'Chung'})
            </button>
          </div>
          <div className="todos-search-input">
            <Search size={14} />
            <input type="text" placeholder="Tìm kiếm công việc..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <select className="form-control" style={{ width: '140px', padding: '6px 10px', fontSize: '0.85rem' }} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="all">Độ ưu tiên: Tất cả</option>
            <option value="low">Thấp</option>
            <option value="medium">Trung bình</option>
            <option value="high">Cao</option>
            <option value="urgent">Khẩn cấp</option>
          </select>
        </div>
        <button className="scope-btn" onClick={fetchData} title="Tải lại dữ liệu">
          <RefreshCw size={14} /> Tải lại
        </button>
      </div>

      {/* Kanban Board Container */}
      <div className="kanban-board">
        {columns.map(col => {
          const colTodos = todos.filter(t => t.status === col.id)
          const ColIcon = col.icon
          return (
            <div key={col.id} className={`kanban-column column-${col.id}`}>
              <div className="column-header">
                <div className="column-title">
                  <ColIcon size={16} style={{ color: col.color }} />
                  <span>{col.label}</span>
                </div>
                <span className="column-count">{colTodos.length}</span>
              </div>
              <div className="column-cards">
                {colTodos.map(todo => {
                  const overdue = isOverdue(todo.due_date, todo.status)
                  return (
                    <div 
                      key={todo.id} 
                      className={`todo-card${!canEditTodo(todo) ? ' todo-card-readonly' : ''}`}
                      onClick={() => openTodoDetail(todo)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="todo-card-top">
                        <span className={`badge-priority priority-${todo.priority}`}>
                          {todo.priority === 'urgent' ? 'Khẩn cấp' : todo.priority === 'high' ? 'Cao' : todo.priority === 'medium' ? 'Trung bình' : 'Thấp'}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span className="badge-scope">
                            {todo.scope === 'department' ? <Building size={10} /> : <User size={10} />}
                            {todo.scope === 'department' ? todo.department || 'Phòng ban' : 'Cá nhân'}
                          </span>
                          {isPendingApproval(todo) && (
                            <span className="badge-pending">
                              <Clock size={10} /> Chờ duyệt
                            </span>
                          )}
                          {canApproveTodo(todo) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleApproveTodo(todo.id); }}
                              className="todo-approve-btn"
                              title="Phê duyệt công việc phòng ban"
                            >
                              <CheckCircle2 size={13} /> Phê duyệt
                            </button>
                          )}
                          {canEditTodo(todo) ? (
                            <button onClick={(e) => { e.stopPropagation(); openEditModal(todo); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }} title="Chỉnh sửa">
                              <Edit2 size={13} />
                            </button>
                          ) : (
                            <span style={{ color: '#f59e0b', fontSize: '0.65rem', padding: '2px', cursor: 'default' }} title="Chỉ xem, không có quyền chỉnh sửa">⚠️</span>
                          )}
                          {canDeleteTodo(todo) ? (
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteTodo(todo.id); }} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '2px' }} title="Xóa">
                              <Trash2 size={13} />
                            </button>
                          ) : null}
                          {!canDeleteTodo(todo) && todo.creator_code === userCode && (
                            <span style={{ color: '#94a3b8', fontSize: '0.65rem', padding: '2px', cursor: 'default' }} title="Tự tạo không được xóa (để xem report)">🔒</span>
                          )}
                        </div>
                      </div>

                      <h3 className="todo-card-title">{todo.title}</h3>
                      {todo.description && <p className="todo-card-desc">{todo.description}</p>}

                      {/* Checklist / Subtask Progress */}
                      {todo.subtask_count > 0 && (
                        <div className="subtasks-progress">
                          <div className="subtasks-label">
                            <span>Tiến độ subtask</span>
                            <span>{todo.subtask_done}/{todo.subtask_count} ({todo.progress_pct}%)</span>
                          </div>
                          <div className="subtasks-bar-bg">
                            <div className="subtasks-bar-fill" style={{ width: `${todo.progress_pct}%` }} />
                          </div>
                        </div>
                      )}

                      {/* Dropdown status bọc trong stopPropagation */}
                      <div style={{ marginTop: '4px' }} onClick={(e) => e.stopPropagation()}>
                        <select
                          value={todo.status}
                          onChange={(e) => {
                            if (canChangeStatus(todo)) handleStatusChange(todo.id, e.target.value)
                          }}
                          className={`form-control status-${todo.status}`}
                          disabled={!canChangeStatus(todo)}
                          title={!canChangeStatus(todo) ? 'Chỉ xem, không có quyền thay đổi' : ''}
                        >
                          <option value="todo">Cần làm</option>
                          <option value="in_progress">Đang xử lý</option>
                          <option value="review">Chờ duyệt</option>
                          <option value="completed">Hoàn thành</option>
                          {canSeeCancelledOption(todo) && <option value="cancelled">Hủy</option>}
                        </select>
                      </div>

                      <div className="todo-card-footer">
                        <div className="todo-assignee" title={`Giao cho: ${todo.assignee_name || 'Chưa giao'}`}>
                          <User size={12} />
                          <span>{todo.assignee_name || todo.creator_name || 'Cá nhân'}</span>
                        </div>
                        {todo.due_date && (
                          <div className={`todo-due ${overdue ? 'is-overdue' : ''}`}>
                            <Calendar size={12} />
                            <span>{formatDate(todo.due_date)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                {colTodos.length === 0 && (
                  <div className="empty-state">Chưa có công việc</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ========================================================
          MODAL CHI TIẾT CÔNG VIỆC (TRELLO/JIRA VIBE)
          ======================================================== */}
      {viewingTodo && (
        <div className="todo-modal-overlay" onClick={() => setViewingTodo(null)}>
          <div className="todo-detail-modal-content" onClick={(e) => e.stopPropagation()}>
            
            {/* Nút đóng */}
            <button className="modal-close-btn" style={{ position: 'absolute', top: '15px', right: '15px', zIndex: 10 }} onClick={() => setViewingTodo(null)}>
              <X size={24} />
            </button>

            <div className="todo-detail-layout">
              
              {/* CỘT TRÁI: THÔNG TIN CHI TIẾT & ĐÍNH KÈM */}
              <div className="todo-detail-left">
                <div className="todo-detail-header">
                  <span className={`badge-priority priority-${viewingTodo.priority}`} style={{ marginBottom: 10, display: 'inline-block' }}>
                    {viewingTodo.priority.toUpperCase()}
                  </span>
                  <h2>{viewingTodo.title}</h2>
                  <div className="todo-meta-row">
                    <span className="todo-meta-item"><User size={15}/> <strong>Người nhận:</strong> {viewingTodo.assignee_name || 'Chưa giao'}</span>
                    <span className="todo-meta-item"><Calendar size={15}/> <strong>Hạn:</strong> {viewingTodo.due_date ? formatDate(viewingTodo.due_date) : 'Không có hạn'}</span>
                    <span className={`badge-scope`}><Building size={12}/> {viewingTodo.department || 'Cá nhân'}</span>
                    {isPendingApproval(viewingTodo) && (
                      <span className="badge-pending"><Clock size={12}/> Chờ trưởng phòng duyệt</span>
                    )}
                    {canApproveTodo(viewingTodo) && (
                      <button
                        className="todo-approve-btn"
                        onClick={() => handleApproveTodo(viewingTodo.id)}
                        style={{ marginLeft: 'auto' }}
                      >
                        <CheckCircle2 size={14}/> Phê duyệt
                      </button>
                    )}
                  </div>
                </div>

                <div className="todo-detail-section">
                  <h3><ListTodo size={16}/> Mô tả công việc</h3>
                  <div className="todo-desc-text">{viewingTodo.description || 'Không có mô tả chi tiết.'}</div>
                </div>

                {/* Khu vực đính kèm (URL, File) */}
                <div className="todo-detail-section">
                  <div className="section-header-flex">
                    <h3><Paperclip size={16}/> Đính kèm ({todoAttachments.length})</h3>
                    <div className="attach-actions">
                      <label className="attach-btn" title="Đính kèm file (Ảnh, PDF, Excel, Word)">
                        <Plus size={14}/> Thêm File
                        <input type="file" hidden accept=".jpg,.jpeg,.png,.webp,.xlsx,.doc,.docx,.pdf" onChange={handleAttachFile} />
                      </label>
                      <button className="attach-btn" onClick={handleAddUrl}>
                        <LinkIcon size={14}/> Thêm URL
                      </button>
                    </div>
                  </div>
                  
                  <div className="attachments-list">
                    {todoAttachments.map(att => (
                      <div key={att.id} className="attachment-item">
                        <div className="att-icon">
                          {att.type === 'url' ? <LinkIcon size={18}/> : 
                           ['jpg','jpeg','png','webp'].includes(att.ext) ? <ImageIcon size={18}/> : 
                           ['xlsx','xls'].includes(att.ext) ? <FileSpreadsheet size={18}/> : <FileText size={18}/>}
                        </div>
                        <a href={att.url} target="_blank" rel="noreferrer" className="att-name" title={att.name}>{att.name}</a>
                        {att.type === 'url' && <ExternalLink size={14} style={{ color: '#94a3b8' }}/>}
                        {(userRole === 'admin' || att.uploader_code === userCode) && (
                          <button className="att-delete-btn" onClick={() => handleDeleteAttachment(att)} title="Xóa đính kèm">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    {todoAttachments.length === 0 && <div className="empty-state" style={{ padding: '1rem' }}>Chưa có file hay liên kết nào đính kèm.</div>}
                  </div>
                </div>
              </div>

              {/* CỘT PHẢI: KHU VỰC THẢO LUẬN / BÌNH LUẬN */}
              <div className="todo-detail-right">
                <div className="chat-section-header">
                  <MessageCircle size={18}/> Thảo luận nội bộ
                </div>
                
                <div className="todo-chat-messages">
                  {detailBusy && todoComments.length === 0 ? (
                    <div className="empty-chat">Đang tải bình luận...</div>
                  ) : todoComments.length === 0 ? (
                    <div className="empty-chat">Chưa có bình luận nào. Hãy đặt câu hỏi hoặc cập nhật tiến độ!</div>
                  ) : (
                    todoComments.map((cmt, idx) => {
                      const isMine = String(cmt.user_code || cmt.sender_code) === String(userCode);
                      return (
                        <div key={cmt.id || idx} className={`todo-chat-msg ${isMine ? 'mine' : ''}`}>
                          {!isMine && <div className="todo-chat-sender">{cmt.full_name || cmt.sender_name || cmt.user_code}</div>}
                          <div className="todo-chat-bubble">{cmt.content}</div>
                        </div>
                      )
                    })
                  )}
                </div>

                <form className="todo-chat-input-area" onSubmit={handleSendComment}>
                  <input 
                    type="text" 
                    placeholder="Viết nhận xét, bình luận..." 
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                  />
                  <button type="submit" disabled={!commentText.trim()}>
                    <Send size={16} />
                  </button>
                </form>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Modal Add / Edit Todo */}
      {showModal && (
        <div className="todo-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="todo-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="todo-modal-header">
              <h2>{editingTodo ? 'Chỉnh sửa Công việc' : 'Tạo mới Công việc'}</h2>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveTodo}>
              <div className="todo-modal-body">
                <div className="form-group">
                  <label>Tên công việc <span className="required-star">*</span></label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Nhập tên tiêu đề công việc..."
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Mô tả chi tiết</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    placeholder="Ghi chú thêm thông tin chi tiết công việc..."
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Phạm vi (Scope)</label>
                    <select
                      className="form-control"
                      value={formScope}
                      onChange={(e) => handleScopeChange(e.target.value)}
                    >
                      <option value="personal">Cá nhân</option>
                      <option value="department">Phòng ban {userRole === 'user' ? '(Chờ duyệt)' : '(Giao việc)'}</option>
                    </select>
                    {userRole === 'user' && formScope === 'department' && (
                      <small className="todos-form-hint">Công việc phòng ban bạn tạo sẽ được trưởng phòng phê duyệt trước khi hiển thị cho phòng ban</small>
                    )}
                    {userRole === 'user' && (
                      <small className="todos-form-hint">Công việc cá nhân — bạn tự tạo và tự theo dõi</small>
                    )}
                  </div>

                  {formScope === 'department' && (
                    <div className="form-group">
                      <label>Chọn Phòng ban</label>
                      {userRole === 'admin' ? (
                        <select
                          className="form-control"
                          value={formDept}
                          onChange={(e) => setFormDept(e.target.value)}
                        >
                          <option value="">-- Chọn phòng ban --</option>
                          {departments.map(d => (
                            <option key={d.id || d.name} value={d.name}>{d.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          className="form-control form-control-readonly"
                          value={formDept}
                          readOnly
                        />
                      )}
                    </div>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Người thực hiện (Assignee)</label>
                    {formScope === 'personal' ? (
                      <input
                        type="text"
                        className="form-control form-control-readonly"
                        value={userName}
                        readOnly
                      />
                    ) : (
                      <select
                        className="form-control"
                        value={formAssigneeCode}
                        onChange={(e) => setFormAssigneeCode(e.target.value)}
                        required={!editingTodo}
                      >
                        <option value="">-- Chọn nhân viên --</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.employee_code}>
                            {emp.full_name} ({emp.employee_code}) - {emp.department}
                          </option>
                        ))}
                      </select>
                    )}
                    {formScope === 'department' && userRole === 'head' && (
                      <small className="todos-form-hint">Chọn nhân viên trong phòng ban {userDept} để giao việc</small>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Độ ưu tiên</label>
                    <select
                      className="form-control"
                      value={formPriority}
                      onChange={(e) => setFormPriority(e.target.value)}
                    >
                      <option value="low">Thấp</option>
                      <option value="medium">Trung bình</option>
                      <option value="high">Cao</option>
                      <option value="urgent">Khẩn cấp 🚨</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Hạn hoàn thành (Due Date)</label>
                    <input
                      type="date"
                      className={`form-control${dueDateError ? ' is-error' : ''}`}
                      value={formDueDate || ''}
                      onChange={(e) => handleDueDateChange(e.target.value)}
                    />
                    {dueDateError && (
                      <div className="due-date-error">⚠️ {dueDateError}</div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Tags / Nhãn (cách nhau bởi phẩy)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="VD: IT, Báo cáo, Gấp"
                      value={formTags}
                      onChange={(e) => setFormTags(e.target.value)}
                    />
                  </div>
                </div>

                {/* Subtask / Checklist Manager */}
                <div className="subtask-panel">
                  <label className="subtask-panel-label">Danh sách việc nhỏ (Subtasks Checklist)</label>
                  <div className="subtask-add-row">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Thêm mục việc cần hoàn thành..."
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); } }}
                    />
                    <button type="button" className="btn-primary" onClick={handleAddSubtask}>
                      Thêm
                    </button>
                  </div>

                  <div className="subtask-list">
                    {formSubtasks.map((sub, idx) => (
                      <div key={idx} className={`subtask-item${sub.is_completed ? ' completed' : ''}`}>
                        <div className="subtask-item-left">
                          <input
                            type="checkbox"
                            checked={!!sub.is_completed}
                            onChange={() => handleToggleSubtask(idx)}
                          />
                          <span className={`subtask-item-text${sub.is_completed ? ' done' : ''}`}>
                            {sub.title}
                          </span>
                        </div>
                        <button type="button" className="subtask-remove-btn" onClick={() => handleRemoveSubtask(idx)}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="todo-modal-footer">
                <button type="button" className="scope-btn" onClick={() => setShowModal(false)}>Đóng</button>
                <button type="submit" className="btn-primary">
                  {editingTodo ? 'Lưu thay đổi' : 'Tạo mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
    </div>
  )
}
