import React, { useEffect, useState, useCallback } from 'react'
import { Megaphone, Bell, Plus, Pin, MessageCircle, Send, X, Trash2, Pencil, ChevronDown, ChevronUp, Users, Building2, UserPlus, Loader2, Paperclip, Link2, FileText, Eye, File as FileIcon, Image as ImageIcon } from 'lucide-react'
import { getForumPosts, createForumPost, updateForumPost, deleteForumPost, getForumReplies, createForumReply, getForumOnlyOfficeConfig, getEmployees, uploadForumFile, apiUrl } from '../services/api'
import { formatDate } from '../utils/date'
import OnlyOfficeViewer from './OnlyOfficeViewer'
import FileViewer from './FileViewer'
import ImageLightbox from './ImageLightbox'
import './AnnouncementsBox.css'

const roleLabel = role =>
  role === 'admin' ? 'Quản trị viên'
  : role === 'head' ? 'Trưởng phòng'
  : 'Nhân viên'

const targetLabel = (p) => {
  if (p.target_type === 'dept') return { text: `📍 ${p.target_value}`, cls: 'ab-target-dept' }
  if (p.target_type === 'user') {
    const n = String(p.target_value || '').split(',').filter(Boolean).length
    return { text: `👤 ${n} người`, cls: 'ab-target-user' }
  }
  return { text: '🌐 Tất cả', cls: 'ab-target-all' }
}

function readCanCreateFromSession() {
  const role = sessionStorage.getItem('user_role') || ''
  if (role === 'admin' || role === 'head') return true
  try {
    const perms = JSON.parse(sessionStorage.getItem('user_permissions') || '{}')
    const p = perms.announcements || {}
    return !!(p.can_edit || p.can_view)
  } catch {
    return false
  }
}

export default function AnnouncementsBox({ compact = false }) {
  const userCode = sessionStorage.getItem('user_code') || ''
  const [canCreate, setCanCreate] = useState(readCanCreateFromSession)

  // Theo dõi trạng thái "đã đọc" theo từng user (localStorage) — chỉ dùng cho chế độ compact
  const readKey = `forum_reads_${userCode || 'anon'}`
  const [readIds, setReadIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(readKey) || '[]') } catch { return [] }
  })

  const saveReads = (ids) => {
    setReadIds(ids)
    try { localStorage.setItem(readKey, JSON.stringify(ids)) } catch (_) {}
  }

  const markRead = (id) => {
    if (readIds.includes(id)) return
    saveReads([...readIds, id])
  }

  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [replies, setReplies] = useState([])
  const [loadingReplies, setLoadingReplies] = useState(false)
  const [replyText, setReplyText] = useState({})

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formTargetType, setFormTargetType] = useState('all')
  const [formTargetDept, setFormTargetDept] = useState('')
  const [formTargetUsers, setFormTargetUsers] = useState([])
  const [formPinned, setFormPinned] = useState(false)
  const [formAttachUrl, setFormAttachUrl] = useState('')
  const [formAttach, setFormAttach] = useState(null) // { url, name, type, size } từ upload hoặc URL
  const [uploading, setUploading] = useState(false)
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Preview file đính kèm: FileViewer (PDF) + OnlyOffice (Office) + Lightbox (ảnh)
  const [ooFile, setOoFile] = useState(null)
  const [pdfFile, setPdfFile] = useState(null)
  const [lightbox, setLightbox] = useState({ open: false, slides: [], index: 0 })
  const ooPostId = ooFile?.postId || null
  const fetchForumConfig = useCallback(() => getForumOnlyOfficeConfig(ooPostId), [ooPostId])

  const loadPosts = useCallback(() => {
    getForumPosts().then(r => {
      setPosts(r.data?.data || [])
      if (r.data?.can_create !== undefined) setCanCreate(!!r.data.can_create)
    }).catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadPosts() }, [loadPosts])

  // SSE — cập nhật realtime khi có thông báo/bình luận mới
  useEffect(() => {
    let es = null
    let timer = null
    function connect() {
      try {
        es = new EventSource(apiUrl('/events'))
        es.addEventListener('forum_post_added', loadPosts)
        es.addEventListener('forum_post_updated', loadPosts)
        es.addEventListener('forum_post_deleted', loadPosts)
        es.addEventListener('forum_reply_added', loadPosts)
        es.onerror = () => {
          if (es) es.close()
          timer = setTimeout(connect, 5000)
        }
      } catch (_) {
        timer = setTimeout(connect, 5000)
      }
    }
    connect()
    return () => {
      if (timer) clearTimeout(timer)
      if (es) es.close()
    }
  }, [loadPosts])

  async function openPost(id) {
    setExpanded(expanded === id ? null : id)
    if (expanded === id) return
    markRead(id)
    setLoadingReplies(true); setReplies([])
    try {
      const r = await getForumReplies(id)
      setReplies(r.data?.data || [])
    } catch { setReplies([]) }
    setLoadingReplies(false)
  }

  const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico']
  const OFFICE_EXTS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'csv', 'txt', 'rtf']

  function openAttachment(p) {
    const url = resolveAttachUrl(p.attachment_url)
    const name = p.attachment_name || String(p.attachment_url || '').split('/').pop() || 'attachment'
    const leaf = String(url).split('?')[0].split('#')[0]
    const ext = leaf.split('.').pop().toLowerCase()

    if (IMAGE_EXTS.includes(ext)) {
      setLightbox({
        open: true,
        slides: [{ src: url, downloadUrl: url, alt: name, title: name, description: p.title || '' }],
        index: 0,
      })
      return
    }

    // PDF + file office đọc qua ONLYOFFICE (render được trên mọi trình duyệt, kể cả Brave/mobile/iOS)
    if ((ext === 'pdf' || OFFICE_EXTS.includes(ext)) && String(p.attachment_url || '').startsWith('/api/forum/uploads/')) {
      setOoFile({ name, url, postId: p.id })
      return
    }

    // Fallback / URL ngoài / loại file khác: mở tab mới hoặc tải về
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function submitReply(id) {
    const text = (replyText[id] || '').trim()
    if (!text) return
    try {
      await createForumReply(id, text)
      setReplyText(prev => ({ ...prev, [id]: '' }))
      openPost(id)
      loadPosts()
    } catch (_) {}
  }

  function openCreate() {
    setEditing(null)
    setFormTitle(''); setFormContent('')
    setFormTargetType('all'); setFormTargetDept('')
    setFormTargetUsers([]); setFormPinned(false)
    setFormAttachUrl(''); setFormAttach(null)
    setError('')
    setShowForm(true)
    loadUsersAndDepts()
  }

  function openEdit(p) {
    setEditing(p)
    setFormTitle(p.title || '')
    setFormContent(p.content || '')
    setFormTargetType(p.target_type || 'all')
    setFormTargetDept(p.target_type === 'dept' ? p.target_value : '')
    setFormTargetUsers(p.target_type === 'user' ? String(p.target_value || '').split(',').filter(Boolean) : [])
    setFormPinned(!!p.is_pinned)
    if (p.attachment_url && p.attachment_url.startsWith('/api/forum/uploads/')) {
      setFormAttach({ url: p.attachment_url, name: p.attachment_name || p.attachment_url.split('/').pop(), type: p.attachment_type || '', size: p.attachment_size || 0 })
      setFormAttachUrl('')
    } else {
      setFormAttachUrl(p.attachment_url || '')
      setFormAttach(null)
    }
    setError('')
    setShowForm(true)
    loadUsersAndDepts()
  }

  async function loadUsersAndDepts() {
    try {
      const e = await getEmployees('', '', 'active')
      setEmployees(e.data?.data || [])
      const d = await getEmployees('', '', '')
      const depts = [...new Set((d.data?.data || []).map(x => x.department).filter(Boolean))]
      setDepartments(depts)
    } catch (_) {}
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const isImg = ['jpg', 'jpeg', 'png', 'webp'].includes((file.name || '').split('.').pop().toLowerCase())
    if (!isImg && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Chỉ chấp nhận ảnh (JPG/PNG/WebP) hoặc PDF')
      e.target.value = ''
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File tối đa 10MB')
      e.target.value = ''
      return
    }
    setError('')
    setUploading(true)
    try {
      const r = await uploadForumFile(file)
      const d = r.data?.data
      if (d) {
        setFormAttach({ url: d.file_url, name: d.file_name, type: d.file_type, size: d.file_size })
        setFormAttachUrl('')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Lỗi tải file lên')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function resolveAttachUrl(url) {
    if (!url) return ''
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url
    return apiUrl(url.startsWith('/') ? url : `/${url}`)
  }

  function isAttachImage(a) {
    if (!a || !a.url) return false
    const t = (a.type || '').toLowerCase()
    if (['jpg', 'jpeg', 'png', 'webp'].includes(t)) return true
    const leaf = (a.url.split('?')[0] || '').toLowerCase()
    return /\.(jpe?g|png|webp)$/.test(leaf)
  }

  async function submitForm(e) {
    e.preventDefault()
    setError('')
    if (!formTitle.trim()) { setError('Vui lòng nhập tiêu đề'); return }
    const payload = {
      title: formTitle.trim(),
      content: formContent.trim(),
      target_type: formTargetType,
      is_pinned: formPinned ? 1 : 0,
      attachment_url: '',
      attachment_name: '',
      attachment_type: '',
      attachment_size: 0,
    }
    const link = (formAttachUrl || '').trim()
    if (link) {
      if (!/^https?:\/\//i.test(link)) { setError('URL phải bắt đầu bằng http:// hoặc https://'); return }
      payload.attachment_url = link
      payload.attachment_name = link
      payload.attachment_type = 'url'
    } else if (formAttach) {
      payload.attachment_url = formAttach.url
      payload.attachment_name = formAttach.name || ''
      payload.attachment_type = formAttach.type || ''
      payload.attachment_size = formAttach.size || 0
    }
    if (formTargetType === 'dept') {
      if (!formTargetDept) { setError('Chọn phòng ban đích'); return }
      payload.target_value = formTargetDept
    }
    if (formTargetType === 'user') {
      if (formTargetUsers.length === 0) { setError('Chọn ít nhất một người'); return }
      payload.target_value = [...new Set(formTargetUsers)].join(',')
    }
    setSaving(true)
    try {
      if (editing) { await updateForumPost(editing.id, payload) }
      else { await createForumPost(payload) }
      setShowForm(false)
      loadPosts()
    } catch (err) {
      setError(err.response?.data?.detail || 'Lỗi lưu thông báo')
    } finally { setSaving(false) }
  }

  async function handleDelete(p) {
    if (!window.confirm(`Xóa thông báo "${p.title}"? Toàn bộ bình luận sẽ bị xóa.`)) return
    try {
      await deleteForumPost(p.id)
      if (expanded === p.id) { setExpanded(null); setReplies([]) }
      loadPosts()
    } catch (_) {}
  }

  function toggleUser(code) {
    setFormTargetUsers(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  const unreadCount = compact ? posts.filter(p => !readIds.includes(p.id)).length : 0

  if (loading) {
    return (
      <div className="ab-box" style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem', fontSize: '0.85rem' }}>
        🔄 Đang tải thông báo...
      </div>
    )
  }

  return (
    <div className="ab-box">
      <div className="ab-header">
        <div className="ab-title">
          {compact ? <Bell size={18} color="#0a5b35" /> : <Megaphone size={18} color="#0a5b35" />}
          <h3>Thông báo nội bộ</h3>
          <span className="ab-count">{compact ? unreadCount : posts.length}</span>
        </div>
        {!compact && canCreate && (
          <button className="ab-new-btn" onClick={openCreate}>
            <Plus size={16} /> Tạo thông báo
          </button>
        )}
      </div>

      {error && <div className="ab-msg ab-msg-err">{error}</div>}

      {posts.length === 0 ? (
        <div className="ab-empty">
          {compact ? 'Chưa có thông báo nội bộ nào.' : canCreate ? 'Chưa có thông báo nào. Bấm "Tạo thông báo" để gửi tin đến toàn công ty / phòng ban / cá nhân.' : 'Chưa có thông báo mới.'}
        </div>
      ) : (
        <div className="ab-list">
          {posts.map(p => {
            const tgt = targetLabel(p)
            const isNew = compact && !readIds.includes(p.id)
            return (
              <div key={p.id} className={`ab-post${p.is_pinned ? ' ab-pinned' : ''}${isNew ? ' ab-unread' : ''}`}>
                <div className="ab-post-head" onClick={() => openPost(p.id)} style={{ cursor: 'pointer' }}>
                  <div className="ab-post-title">
                    {isNew && (
                      <span className="ab-blink-wrap" title="Thông báo mới chưa đọc">
                        <Bell size={16} className="ab-blink-icon" />
                      </span>
                    )}
                    {!!p.is_pinned && <Pin size={14} color="#d97706" />}
                    <span>{p.title}</span>
                  </div>
                  <div className="ab-post-meta">
                    <span className={`ab-target ${tgt.cls}`}>{tgt.text}</span>
                    {!compact && canCreate && (
                      <>
                        <button className="ab-icon-btn" title="Sửa" onClick={(e) => { e.stopPropagation(); openEdit(p) }}>
                          <Pencil size={14} />
                        </button>
                        <button className="ab-icon-btn ab-danger" title="Xóa" onClick={(e) => { e.stopPropagation(); handleDelete(p) }}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="ab-post-sub">
                  <Users size={12} /> <span>{p.author_name}</span>
                  <span className="ab-dot">·</span>
                  <span>{formatDate(p.created_at)}</span>
                  <span className="ab-dot">·</span>
                  <MessageCircle size={12} /> <span>{p.reply_count || 0} bình luận</span>
                  <span className="ab-expand">{expanded === p.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
                </div>

                {expanded === p.id && (
                  <div className="ab-expanded">
                    {p.content && <div className="ab-content">{p.content}</div>}

                    {(p.attachment_url || p.attachment_name) && (
                      <div className="ab-attachment">
                        {p.attachment_type === 'url' ? (
                          <a
                            className="ab-attach-link"
                            href={resolveAttachUrl(p.attachment_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(resolveAttachUrl(p.attachment_url), '_blank', 'noopener,noreferrer') }}
                            title="Mở liên kết"
                          >
                            <Link2 size={16} /> <span>{p.attachment_url}</span>
                            <Eye size={15} className="ab-eye-hint" />
                          </a>
                        ) : isAttachImage(p) ? (
                          <div className="ab-attach-img-wrap" onClick={(e) => { e.stopPropagation(); openAttachment(p) }}>
                            <img className="ab-attach-img" src={resolveAttachUrl(p.attachment_url)} alt={p.attachment_name || 'attachment'} />
                            <span className="ab-img-zoom-hint"><Eye size={14} /> Xem phóng to</span>
                          </div>
                        ) : (
                          <a
                            className="ab-attach-link"
                            href={resolveAttachUrl(p.attachment_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); openAttachment(p) }}
                            title="Xem trước file"
                          >
                            <FileText size={16} /> <span>{p.attachment_name || 'Tệp đính kèm'} {p.attachment_size ? `(${(p.attachment_size / 1024).toFixed(0)} KB)` : ''}</span>
                            <Eye size={15} className="ab-eye-hint" />
                          </a>
                        )}
                      </div>
                    )}

                    <div className="ab-replies">
                      {loadingReplies ? (
                        <div className="ab-reply-loading"><Loader2 className="ab-spin" size={15} /> Đang tải...</div>
                      ) : replies.length === 0 ? (
                        <div className="ab-reply-empty">Chưa có câu hỏi / bình luận. Hãy đặt câu hỏi bên dưới.</div>
                      ) : replies.map(r => {
                        const isAuthor = !!r.author_role && r.author_role !== 'user'
                        return (
                          <div key={r.id} className={`ab-reply${isAuthor ? ' ab-reply-author' : ''}`}>
                            <div className="ab-reply-head">
                              <strong>{r.user_name}</strong>
                              <span className="ab-reply-role">{isAuthor ? roleLabel(r.author_role) : 'Nhân viên'}</span>
                              <span className="ab-dot">·</span>
                              <span>{formatDate(r.created_at)}</span>
                            </div>
                            <div className="ab-reply-body">{r.content}</div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="ab-reply-input">
                      <input
                        value={replyText[p.id] || ''}
                        onChange={e => setReplyText(prev => ({ ...prev, [p.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') submitReply(p.id) }}
                        placeholder="Đặt câu hỏi hoặc bình luận..."
                      />
                      <button onClick={() => submitReply(p.id)}><Send size={15} /> Gửi</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Modal tạo / sửa thông báo ─── */}
      {!compact && showForm && (
        <>
          <div className="ab-overlay" onClick={() => setShowForm(false)} />
          <div className="ab-modal">
            <div className="ab-modal-head">
              <h4>{editing ? 'Sửa thông báo' : 'Tạo thông báo mới'}</h4>
              <button className="ab-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={submitForm}>
              {error && <div className="ab-msg ab-msg-err">{error}</div>}

              <div className="ab-field">
                <label>Tiêu đề <b style={{ color: '#dc2626' }}>*</b></label>
                <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="VD: Bảo trì hệ thống server CN 09/08" />
              </div>

              <div className="ab-field">
                <label>Nội dung</label>
                <textarea rows={4} value={formContent} onChange={e => setFormContent(e.target.value)}
                  placeholder="Thông tin chi tiết của thông báo..." />
              </div>

              <div className="ab-field">
                <label>Đính kèm (ảnh JPG/PNG/WebP hoặc PDF, tối đa 10MB)</label>
                <div className="ab-attach-upload">
                  <label className="ab-file-btn">
                    {uploading ? <Loader2 className="ab-spin" size={16} /> : <Paperclip size={16} />}
                    {uploading ? 'Đang tải...' : 'Chọn file'}
                    <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={handleFileChange} disabled={uploading} style={{ display: 'none' }} />
                  </label>
                  <span className="ab-attach-sep">hoặc</span>
                  <input
                    className="ab-url-input"
                    type="text"
                    value={formAttachUrl}
                    onChange={e => { setFormAttachUrl(e.target.value); if (e.target.value) setFormAttach(null) }}
                    placeholder="Dán URL liên kết (https://...)"
                  />
                </div>

                {(formAttach || formAttachUrl) && (
                  <div className="ab-attach-preview">
                    {formAttach ? (
                      <>
                        {isAttachImage(formAttach) ? (
                          <img className="ab-attach-img" src={resolveAttachUrl(formAttach.url)} alt={formAttach.name} />
                        ) : (
                          <FileIcon size={16} />
                        )}
                        <span className="ab-attach-name">{formAttach.name}</span>
                        {formAttach.size ? <small>{(formAttach.size / 1024).toFixed(0)} KB</small> : null}
                      </>
                    ) : (
                      <>
                        <Link2 size={16} />
                        <span className="ab-attach-name ab-url-name">{formAttachUrl}</span>
                      </>
                    )}
                    <button type="button" className="ab-attach-remove" onClick={() => { setFormAttach(null); setFormAttachUrl('') }}>
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="ab-field">
                <label>Gửi đến</label>
                <div className="ab-target-options">
                  <label className={formTargetType === 'all' ? 'ab-opt on' : 'ab-opt'}>
                    <input type="radio" name="tt" checked={formTargetType === 'all'} onChange={() => setFormTargetType('all')} />
                    <Building2 size={14} /> Tất cả nhân viên
                  </label>
                  <label className={formTargetType === 'dept' ? 'ab-opt on' : 'ab-opt'}>
                    <input type="radio" name="tt" checked={formTargetType === 'dept'} onChange={() => setFormTargetType('dept')} />
                    <Users size={14} /> Một phòng ban
                  </label>
                  <label className={formTargetType === 'user' ? 'ab-opt on' : 'ab-opt'}>
                    <input type="radio" name="tt" checked={formTargetType === 'user'} onChange={() => setFormTargetType('user')} />
                    <UserPlus size={14} /> Chọn nhân viên cụ thể
                  </label>
                </div>

                {formTargetType === 'dept' && (
                  <select value={formTargetDept} onChange={e => setFormTargetDept(e.target.value)}>
                    <option value="">Chọn phòng ban...</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                )}

                {formTargetType === 'user' && (
                  <div className="ab-user-list">
                    {employees.length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Đang tải danh sách...</div>}
                    {employees.map(emp => (
                      <label key={emp.employee_code} className="ab-user-item">
                        <input
                          type="checkbox"
                          checked={formTargetUsers.includes(emp.employee_code)}
                          onChange={() => toggleUser(emp.employee_code)}
                        />
                        <span><strong>{emp.full_name}</strong> <em>{emp.employee_code}</em></span>
                        {emp.department && <small>{emp.department}</small>}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <label className="ab-pin">
                <input type="checkbox" checked={formPinned} onChange={e => setFormPinned(e.target.checked)} />
                <Pin size={14} /> Ghim lên đầu (quan trọng)
              </label>

              <div className="ab-modal-actions">
                <button type="button" className="ab-cancel" onClick={() => setShowForm(false)}>Hủy</button>
                <button type="submit" className="ab-save" disabled={saving}>
                  {saving ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Đăng thông báo'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ─── Preview file đính kèm: FileViewer (PDF) + OnlyOffice (Office) + Lightbox (ảnh) ─── */}
      <FileViewer
        file={pdfFile}
        isOpen={!!pdfFile}
        onClose={() => setPdfFile(null)}
      />
      <OnlyOfficeViewer
        file={ooFile}
        isOpen={!!ooFile}
        onClose={() => setOoFile(null)}
        getConfig={ooPostId ? fetchForumConfig : undefined}
      />
      <ImageLightbox
        open={lightbox.open}
        onClose={() => setLightbox(prev => ({ ...prev, open: false }))}
        slides={lightbox.slides}
        index={lightbox.index}
      />
    </div>
  )
}