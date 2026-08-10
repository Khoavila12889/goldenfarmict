import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  MessageSquare, Users, Send, Plus, X, Search, Loader2,
  MessageCircle, User as UserIcon, Paperclip, RefreshCw, ArrowLeft,
  FileText, FileSpreadsheet, File as FileIcon, Download, ExternalLink,
  Building2, Pencil, Trash2, Settings, Crown, UserPlus, Pin, PinOff, ChevronUp,
} from 'lucide-react'
import {
  getChatRooms, getChatMessages, createChatRoom, uploadChatFile, getChatContacts, chatWebSocketUrl,
  getChatRoomMembers, renameChatRoom, deleteChatRoom, addChatRoomMembers, removeChatRoomMember,
  getChatPinnedMessages, pinChatMessage, unpinChatMessage, getChatOnline,
} from '../services/api'
import { getEmployees, getDepartments } from '../services/api'
import './Chat.css'

const PAGE_SIZE = 50

const ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'xlsx', 'pdf', 'doc', 'docx']
const MAX_SIZE = 10 * 1024 * 1024

function noAccent(s) {
  return (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDay(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function formatDayShort(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
}

function isSameDay(a, b) {
  if (!a || !b) return false
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function isImageType(type) {
  return ['jpg', 'jpeg', 'png', 'webp'].includes((type || '').toLowerCase().split('/').pop())
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function attachmentFileName(m) {
  if (m.attachment_name) return m.attachment_name
  const parts = (m.attachment_url || '').split('/')
  return parts[parts.length - 1] || 'Tệp đính kèm'
}

// Chấm trạng thái online — xanh nhấp nháy nếu online, xám nếu offline
function PresenceDot({ online, title }) {
  return (
    <span
      className={`presence-dot${online ? '' : ' offline'}`}
      title={title || (online ? 'Đang trực tuyến' : 'Đang ngoại tuyến')}
    />
  )
}

export default function Chat() {
  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || 'user'
  const userDept = sessionStorage.getItem('user_department') || ''

  const isAdmin = userRole === 'admin'
  const isHead = userRole === 'head'
  const canCreateDeptRoom = isAdmin || isHead

  const [rooms, setRooms] = useState([])
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [nameMap, setNameMap] = useState({})
  const [onlineUsers, setOnlineUsers] = useState([])
  const [activeRoomId, setActiveRoomId] = useState(null)
  const [messages, setMessages] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingRooms, setLoadingRooms] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [wsStatus, setWsStatus] = useState('connecting') // connecting | open | closed
  const [text, setText] = useState('')
  const [attachment, setAttachment] = useState(null) // { url, name, type, size }
  const [uploading, setUploading] = useState(false)
  const [attachError, setAttachError] = useState('')
  const [preview, setPreview] = useState(null) // { url, name, type } — lightbox xem ảnh

  // Pinned messages
  const [pinnedMessages, setPinnedMessages] = useState([])
  const [showPinsList, setShowPinsList] = useState(false)
  const [pinBusy, setPinBusy] = useState(null) // message id đang xử lý ghim/bỏ ghim

  // Create room modal
  const [showCreate, setShowCreate] = useState(false)
  const [roomType, setRoomType] = useState('direct')
  const [groupName, setGroupName] = useState('')
  const [deptSelect, setDeptSelect] = useState('')
  const [selectedCodes, setSelectedCodes] = useState([])
  const [empSearch, setEmpSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Manage room modal
  const [manageRoom, setManageRoom] = useState(null) // { room }
  const [manageTab, setManageTab] = useState('members') // members | settings
  const [memberList, setMemberList] = useState([])
  const [memberSearch, setMemberSearch] = useState('')
  const [renameName, setRenameName] = useState('')
  const [managing, setManaging] = useState(false)
  const [manageError, setManageError] = useState('')

  // Delete confirm modal
  const [deleteTarget, setDeleteTarget] = useState(null) // room
  const [deleting, setDeleting] = useState(false)

  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const shouldReconnectRef = useRef(true)
  const activeRoomIdRef = useRef(activeRoomId)
  const msgsBoxRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => { activeRoomIdRef.current = activeRoomId }, [activeRoomId])

  const displayNameOf = useCallback((code) => nameMap[code] || code || 'Nhân viên', [nameMap])

  const roomDisplayName = useCallback((room) => {
    if (!room) return ''
    if (room.type === 'group') return room.name || 'Nhóm chat'
    if (room.type === 'department') return room.name || 'Phòng ban'
    const others = (room.member_codes || []).filter(c => c !== userCode)
    return others.map(displayNameOf).join(', ') || 'Chat 1-1'
  }, [userCode, displayNameOf])

  const roomSubtitle = useCallback((room) => {
    if (!room) return ''
    if (room.type === 'department') return `${room.member_count || 0} thành viên phòng ban`
    if (room.type === 'group') return `${room.member_count || 0} thành viên`
    const others = (room.member_codes || []).filter(c => c !== userCode)
    const base = others.map(displayNameOf).join(', ')
    if (!others.length) return base
    const anyOnline = others.some(c => onlineUsers.includes(c))
    return `${base} — ${anyOnline ? '● Trực tuyến' : '○ Ngoại tuyến'}`
  }, [userCode, displayNameOf, onlineUsers])

  const refreshRooms = useCallback(async () => {
    try {
      const res = await getChatRooms()
      setRooms(res.data?.data || [])
    } catch (_) { /* giữ danh sách cũ */ }
  }, [])

  // ─── Tải danh sách nhân viên + phòng ban + phòng chat ─────────
  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      getEmployees(),
      getChatContacts(),
      getChatRooms(),
      getDepartments(),
      getChatOnline(),
    ]).then(([empRes, contactRes, roomRes, deptRes, onlineRes]) => {
      if (cancelled) return
      const emps = empRes.status === 'fulfilled' ? (empRes.value.data?.data || []) : []
      const map = {}
      emps.forEach(e => { if (e.employee_code) map[e.employee_code] = e.full_name || e.employee_code })
      setNameMap(map)
      const contacts = contactRes.status === 'fulfilled' ? (contactRes.value.data?.data || []) : []
      setEmployees(contacts)
      const roomList = roomRes.status === 'fulfilled' ? (roomRes.value.data?.data || []) : []
      setRooms(roomList)
      const deptList = deptRes.status === 'fulfilled' ? (deptRes.value.data?.data || []) : []
      setDepartments(deptList)
      const onlineList = onlineRes.status === 'fulfilled' ? (onlineRes.value.data?.data || []) : []
      setOnlineUsers(onlineList.map(u => u.employee_code).filter(Boolean))
      setDeptSelect(prev => prev || userDept || deptList[0]?.name || '')
      setLoadingRooms(false)
    })
    return () => { cancelled = true }
  }, [userDept])

  // ─── WebSocket ────────────────────────────────────────────────
  const handleWsMessage = useCallback((raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch (_) { return }
    if (!msg) return
    if (msg.event === 'pin_updated') {
      if (msg.room_id === activeRoomIdRef.current) {
        setPinnedMessages(msg.pinned || [])
      }
      return
    }
    if (msg.event === 'presence') {
      setOnlineUsers(Array.isArray(msg.online) ? msg.online : [])
      return
    }
    if (!msg.id) return
    setRooms(prev => {
      const idx = prev.findIndex(r => r.id === msg.room_id)
      if (idx === -1) return prev
      const room = { ...prev[idx], last_message: msg }
      return [room, ...prev.slice(0, idx), ...prev.slice(idx + 1)]
    })
    if (msg.room_id === activeRoomIdRef.current) {
      setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]))
    }
  }, [])

  const connectWs = useCallback(() => {
    if (!shouldReconnectRef.current) return
    setWsStatus('connecting')
    let ws
    try {
      ws = new WebSocket(chatWebSocketUrl())
    } catch (_) {
      setWsStatus('closed')
      return
    }
    wsRef.current = ws
    ws.onopen = () => setWsStatus('open')
    ws.onmessage = (e) => handleWsMessage(e.data)
    ws.onclose = () => {
      setWsStatus('closed')
      if (shouldReconnectRef.current) {
        reconnectTimerRef.current = setTimeout(connectWs, 3000)
      }
    }
    ws.onerror = () => { try { ws.close() } catch (_) {} }
  }, [handleWsMessage])

  useEffect(() => {
    shouldReconnectRef.current = true
    connectWs()
    return () => {
      shouldReconnectRef.current = false
      clearTimeout(reconnectTimerRef.current)
      if (wsRef.current) { try { wsRef.current.close() } catch (_) {} }
    }
  }, [connectWs])

  // ─── Chọn phòng / tải tin nhắn ────────────────────────────────
  const selectRoom = useCallback(async (roomId) => {
    setActiveRoomId(roomId)
    setMessages([])
    setHasMore(false)
    setLoadingMsgs(true)
    setPinnedMessages([])
    setShowPinsList(false)
    try {
      const [msgRes, pinRes] = await Promise.allSettled([
        getChatMessages(roomId, PAGE_SIZE, 0),
        getChatPinnedMessages(roomId),
      ])
      if (msgRes.status === 'fulfilled') {
        const rows = msgRes.value.data?.data || []
        setMessages(rows)
        setHasMore(rows.length === PAGE_SIZE)
      } else {
        setHasMore(false)
      }
      if (pinRes.status === 'fulfilled') {
        setPinnedMessages(pinRes.value.data?.data || [])
      }
    } catch (_) {
      setHasMore(false)
    } finally {
      setLoadingMsgs(false)
    }
  }, [])

  const loadOlder = async () => {
    if (!activeRoomId) return
    setLoadingMsgs(true)
    try {
      const res = await getChatMessages(activeRoomId, PAGE_SIZE, messages.length)
      const older = res.data?.data || []
      setHasMore(older.length === PAGE_SIZE)
      setMessages(prev => [...older, ...prev])
    } catch (_) {
      setHasMore(false)
    } finally {
      setLoadingMsgs(false)
    }
  }

  // Auto-scroll xuống cuối khi mở phòng / có tin mới
  useEffect(() => {
    const box = msgsBoxRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [activeRoomId, messages.length])

  // ─── Gửi tin nhắn ─────────────────────────────────────────────
  const sendMessage = (e) => {
    e.preventDefault()
    const content = text.trim()
    if ((!content && !attachment) || !activeRoomId) return
    if (wsStatus !== 'open') return
    wsRef.current.send(JSON.stringify({
      room_id: activeRoomId,
      content,
      attachment_url: attachment?.url || null,
      attachment_name: attachment?.name || null,
      attachment_type: attachment?.type || null,
      attachment_size: attachment?.size ?? null,
    }))
    setText('')
    setAttachment(null)
    setAttachError('')
  }

  // ─── Đính kèm file (ảnh / pdf / doc / xlsx) ───────────────────
  const uploadAndAttach = async (file) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (!ALLOWED_EXTS.includes(ext)) {
      setAttachError('Chỉ hỗ trợ ảnh (JPG/PNG/WebP), file Word (.doc/.docx), Excel (.xlsx) và PDF.')
      return false
    }
    if (file.size > MAX_SIZE) {
      setAttachError('Dung lượng file vượt quá giới hạn 10MB.')
      return false
    }
    setUploading(true)
    setAttachError('')
    try {
      const res = await uploadChatFile(file)
      const data = res.data?.data || {}
      setAttachment({
        url: data.file_url,
        name: data.file_name,
        type: data.file_type,
        size: data.file_size,
      })
      return true
    } catch (_) {
      setAttachError('Tải file lên thất bại. Vui lòng thử lại.')
      return false
    } finally {
      setUploading(false)
    }
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) await uploadAndAttach(file)
  }

  // Dán ảnh chụp màn hình (Ctrl+V / Shift+Insert) vào box chat
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) return
        const mimeExt = item.type === 'image/jpeg' ? 'jpg' : (item.type === 'image/webp' ? 'webp' : 'png')
        const clean = new File([file], `hinh-chup.${mimeExt}`, { type: file.type })
        await uploadAndAttach(clean)
        return
      }
    }
  }

  // ─── Tạo phòng chat (user / head / admin) ─────────────────────
  const toggleSelect = (code) => {
    setSelectedCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  const handleCreateRoom = async () => {
    setCreateError('')
    if (roomType === 'direct' && selectedCodes.length !== 1) {
      setCreateError('Phòng chat 1-1 cần chọn đúng 1 người.')
      return
    }
    if (roomType === 'group' && selectedCodes.length < 2) {
      setCreateError('Phòng nhóm cần chọn ít nhất 2 người.')
      return
    }
    if (roomType === 'group' && !groupName.trim()) {
      setCreateError('Vui lòng nhập tên nhóm.')
      return
    }
    if (roomType === 'department' && !deptSelect.trim()) {
      setCreateError('Vui lòng chọn phòng ban.')
      return
    }

    setCreating(true)
    try {
      const res = await createChatRoom({
        type: roomType,
        name: roomType === 'group' ? groupName.trim() : null,
        department: roomType === 'department' ? deptSelect.trim() : null,
        member_codes: roomType === 'department' ? [] : selectedCodes,
      })
      const room = res.data?.data
      setShowCreate(false)
      setRoomType('direct')
      setGroupName('')
      setDeptSelect(prev => prev || userDept)
      setSelectedCodes([])
      setEmpSearch('')
      await refreshRooms()
      if (room && room.id) selectRoom(room.id)
    } catch (err) {
      const detail = err.response?.data?.detail
      setCreateError(typeof detail === 'string' ? detail : 'Không thể tạo phòng chat.')
    } finally {
      setCreating(false)
    }
  }

  const qNorm = noAccent(empSearch.trim())
  const availableEmps = employees.filter(e =>
    e.employee_code !== userCode &&
    (!qNorm ||
      noAccent(e.full_name).includes(qNorm) ||
      noAccent(e.employee_code).includes(qNorm) ||
      noAccent(e.department).includes(qNorm))
  )

  // ─── Quản lý phòng (admin / trưởng phòng / chủ nhóm) ─────────
  const openManage = async (room) => {
    setManageError('')
    setManageTab('members')
    setRenameName(room.name || '')
    setMemberSearch('')
    setSelectedCodes([])
    setManageRoom(room)
    setMemberList([])
    try {
      const res = await getChatRoomMembers(room.id)
      setMemberList(res.data?.data || [])
    } catch (_) {
      setMemberList([])
    }
  }

  const memberSet = useMemo(() => new Set(memberList.map(m => m.employee_code)), [memberList])
  const mqNorm = noAccent(memberSearch.trim())
  const addableEmps = employees.filter(e =>
    !memberSet.has(e.employee_code) &&
    (!mqNorm ||
      noAccent(e.full_name).includes(mqNorm) ||
      noAccent(e.employee_code).includes(mqNorm) ||
      noAccent(e.department).includes(mqNorm))
  )

  const toggleAddMember = (code) => {
    setSelectedCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  const handleAddMembers = async () => {
    if (!manageRoom || selectedCodes.length === 0) return
    setManaging(true)
    setManageError('')
    try {
      const res = await addChatRoomMembers(manageRoom.id, selectedCodes)
      setSelectedCodes([])
      setMemberSearch('')
      setMemberList([])
      await Promise.all([
        getChatRoomMembers(manageRoom.id).then(r => setMemberList(r.data?.data || [])),
        refreshRooms(),
      ])
      if (res.data?.member_codes) {
        setRooms(prev => prev.map(r => r.id === manageRoom.id
          ? { ...r, member_codes: res.data.member_codes, member_count: res.data.member_codes.length }
          : r))
      }
    } catch (err) {
      const detail = err.response?.data?.detail
      setManageError(typeof detail === 'string' ? detail : 'Không thể thêm thành viên.')
    } finally {
      setManaging(false)
    }
  }

  const handleRemoveMember = async (m) => {
    if (!manageRoom || m.is_owner) return
    if (!window.confirm(`Xoá ${m.full_name || m.employee_code} khỏi nhóm?`)) return
    setManaging(true)
    setManageError('')
    try {
      const res = await removeChatRoomMember(manageRoom.id, m.employee_code)
      setMemberList(prev => prev.filter(x => x.employee_code !== m.employee_code))
      await refreshRooms()
      if (res.data?.member_codes) {
        setRooms(prev => prev.map(r => r.id === manageRoom.id
          ? { ...r, member_codes: res.data.member_codes, member_count: res.data.member_codes.length }
          : r))
      }
    } catch (err) {
      const detail = err.response?.data?.detail
      setManageError(typeof detail === 'string' ? detail : 'Không thể xoá thành viên.')
    } finally {
      setManaging(false)
    }
  }

  const handleRename = async () => {
    if (!manageRoom) return
    const name = renameName.trim()
    if (!name) { setManageError('Tên phòng không được để trống.'); return }
    setManaging(true)
    setManageError('')
    try {
      await renameChatRoom(manageRoom.id, name)
      setRooms(prev => prev.map(r => r.id === manageRoom.id
        ? { ...r, name, department: r.type === 'department' ? name : r.department }
        : r))
      setManageRoom(null)
    } catch (err) {
      const detail = err.response?.data?.detail
      setManageError(typeof detail === 'string' ? detail : 'Không thể đổi tên phòng.')
    } finally {
      setManaging(false)
    }
  }

  const handleDeleteRoom = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteChatRoom(deleteTarget.id)
      setRooms(prev => prev.filter(r => r.id !== deleteTarget.id))
      if (activeRoomIdRef.current === deleteTarget.id) {
        setActiveRoomId(null)
        setMessages([])
      }
      setDeleteTarget(null)
    } catch (err) {
      const detail = err.response?.data?.detail
      window.alert(typeof detail === 'string' ? detail : 'Không thể xoá phòng.')
    } finally {
      setDeleting(false)
    }
  }

  // ─── Ghim / bỏ ghim tin nhắn ──────────────────────────────────
  const handleTogglePin = async (m) => {
    if (!m || pinBusy) return
    setPinBusy(m.id)
    try {
      if (m.is_pinned) {
        await unpinChatMessage(m.id)
      } else {
        await pinChatMessage(m.id)
      }
      setMessages(prev => prev.map(x => x.id === m.id ? { ...x, is_pinned: !m.is_pinned } : x))
    } catch (err) {
      const detail = err.response?.data?.detail
      window.alert(typeof detail === 'string' ? detail : 'Không thể thao tác ghim tin nhắn.')
    } finally {
      setPinBusy(null)
    }
  }

  // Đóng preview khi nhấn phím Escape
  useEffect(() => {
    if (!preview) return
    const onKey = (e) => { if (e.key === 'Escape') setPreview(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview])

  const activeRoom = rooms.find(r => r.id === activeRoomId)
  const deptRooms = rooms.filter(r => r.type === 'department')
  const groupRooms = rooms.filter(r => r.type === 'group')
  const directRooms = rooms.filter(r => r.type === 'direct')

  const renderRoomItem = (room) => {
    const last = room.last_message
    const lastContent = last
      ? (last.sender_id === userCode ? 'Bạn: ' : '')
        + (last.content || (last.attachment_url ? `📎 ${attachmentFileName(last)}` : ''))
      : 'Chưa có tin nhắn'
    const isDirect = room.type === 'direct'
    const otherOnline = isDirect
      ? (room.member_codes || []).filter(c => c !== userCode).some(c => onlineUsers.includes(c))
      : false
    return (
      <button
        key={room.id}
        className={`chat-room-item${room.id === activeRoomId ? ' active' : ''}`}
        onClick={() => selectRoom(room.id)}
      >
        <div className={`chat-avatar ${room.type === 'group' ? 'group' : room.type === 'department' ? 'dept' : ''}`}>
          {room.type === 'group' ? <Users size={17} /> : room.type === 'department' ? <Building2 size={17} /> : <UserIcon size={17} />}
        </div>
        <div className="chat-room-meta">
          <div className="chat-room-name">
            {room.type === 'direct' && <PresenceDot online={otherOnline} />}
            {roomDisplayName(room)}
            {room.type === 'department' && <span className="chat-room-tag">Phòng ban</span>}
            {room.type === 'group' && <span className="chat-room-tag">Nhóm</span>}
          </div>
          <div className="chat-room-last">
            {last ? lastContent : 'Chưa có tin nhắn'}
          </div>
        </div>
        {last && <div className="chat-room-time">{formatDay(last.created_at)}</div>}
      </button>
    )
  }

  return (
    <div className={`chat-page${activeRoomId ? ' room-open' : ''}`}>
      {/* ── Room list ── */}
      <aside className="chat-rooms-panel">
        <div className="chat-panel-header">
          <div className="chat-panel-title">
            <MessageSquare size={18} />
            <span>Chat nội bộ</span>
          </div>
          <button className="chat-icon-btn" onClick={() => setShowCreate(true)} title="Tạo phòng chat">
            <Plus size={18} />
          </button>
        </div>

        <div className="chat-rooms-list">
          {loadingRooms && (
            <div className="chat-loading"><Loader2 size={18} className="chat-spin" /> Đang tải phòng...</div>
          )}

          {!loadingRooms && rooms.length === 0 && (
            <div className="chat-empty">
              <MessageCircle size={32} />
              <p>Chưa có phòng chat nào.</p>
              <button className="chat-btn-primary" onClick={() => setShowCreate(true)}>
                <Plus size={15} /> Tạo phòng chat
              </button>
            </div>
          )}

          {deptRooms.length > 0 && <div className="chat-section-label">Phòng ban</div>}
          {deptRooms.map(renderRoomItem)}
          {groupRooms.length > 0 && <div className="chat-section-label">Nhóm</div>}
          {groupRooms.map(renderRoomItem)}
          {directRooms.length > 0 && <div className="chat-section-label">Nhắn riêng</div>}
          {directRooms.map(renderRoomItem)}
        </div>
      </aside>

      {/* ── Chat window ── */}
      <section className="chat-window">
        {!activeRoom ? (
          <div className="chat-window-empty">
            <MessageSquare size={48} />
            <p>Chọn một phòng chat để bắt đầu trò chuyện</p>
            <button className="chat-btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={15} /> Tạo phòng chat
            </button>
          </div>
        ) : (
          <>
            <header className="chat-window-header">
              <button className="chat-back-btn" onClick={() => setActiveRoomId(null)} title="Quay lại danh sách phòng">
                <ArrowLeft size={18} />
              </button>
              <div className="chat-avatar-header">
                {activeRoom.type === 'group' ? <Users size={18} /> : activeRoom.type === 'department' ? <Building2 size={18} /> : <UserIcon size={18} />}
              </div>
              <div className="chat-window-title">
                <div className="chat-room-name">
                  {roomDisplayName(activeRoom)}
                  {activeRoom.type === 'department' && <span className="chat-room-tag">Phòng ban</span>}
                  {activeRoom.type === 'group' && <span className="chat-room-tag">Nhóm</span>}
                </div>
                <div className="chat-room-sub">{roomSubtitle(activeRoom)}</div>
              </div>
              {activeRoom.can_manage && (
                <button
                  className="chat-manage-btn"
                  onClick={() => openManage(activeRoom)}
                  title={isAdmin ? 'Quản trị phòng' : isHead ? 'Quản lý phòng ban' : 'Quản lý nhóm'}
                >
                  <Settings size={17} />
                </button>
              )}
              <span className={`chat-ws-dot ${wsStatus}`} title={wsStatus === 'open' ? 'Đã kết nối' : 'Đang kết nối lại...'}>
                {wsStatus === 'open' ? '● Trực tuyến' : '○ Đang kết nối...'}
              </span>
            </header>

            {pinnedMessages.length > 0 && (
              <div className="chat-pinned-bar">
                <Pin size={13} className="chat-pinned-bar-icon" />
                <div className="chat-pinned-scroll">
                  {pinnedMessages.slice(0, 3).map(p => (
                    <span key={p.id} className="chat-pin-item" title={`${displayNameOf(p.sender_id)}: ${p.content || '📎 file đính kèm'}`}>
                      <span className="chat-pin-sender">{displayNameOf(p.sender_id)}</span>
                      <span className="chat-pin-content">{p.content || '📎 file đính kèm'}</span>
                    </span>
                  ))}
                </div>
                {pinnedMessages.length > 3 && (
                  <button className="chat-pin-more" onClick={() => setShowPinsList(true)} title="Xem tất cả tin đã ghim">
                    +{pinnedMessages.length - 3} nữa
                  </button>
                )}
                {pinnedMessages.length <= 3 && (
                  <button className="chat-pin-open" onClick={() => setShowPinsList(true)} title="Xem tất cả tin đã ghim">
                    <ChevronUp size={14} />
                  </button>
                )}
              </div>
            )}

            <div className="chat-messages" ref={msgsBoxRef}>
              {hasMore && (
                <div className="chat-load-more">
                  <button className="chat-btn-secondary" onClick={loadOlder} disabled={loadingMsgs}>
                    <RefreshCw size={14} /> Tải tin nhắn cũ hơn
                  </button>
                </div>
              )}
              {loadingMsgs && messages.length === 0 && (
                <div className="chat-loading"><Loader2 size={18} className="chat-spin" /> Đang tải tin nhắn...</div>
              )}
              {!loadingMsgs && messages.length === 0 && (
                <div className="chat-empty-mid">Chưa có tin nhắn. Hãy gửi lời chào đầu tiên!</div>
              )}

              {messages.map((m, i) => {
                const mine = m.sender_id === userCode
                const showDay = i === 0 || !isSameDay(messages[i - 1].created_at, m.created_at)
                return (
                  <React.Fragment key={m.id}>
                    {showDay && (
                      <div className="chat-day-sep">
                        <span>{formatDay(m.created_at)}</span>
                      </div>
                    )}
                    <div className={`chat-msg${mine ? ' mine' : ''}`}>
                      <div className="chat-bubble">
                        {!mine && <div className="chat-msg-sender">{displayNameOf(m.sender_id)}</div>}
                        {m.content && <div className="chat-msg-text">{m.content}</div>}
                        {m.attachment_url && isImageType(m.attachment_type) ? (
                          <button
                            type="button"
                            className="chat-msg-img-btn"
                            onClick={() => setPreview({ url: m.attachment_url, name: attachmentFileName(m), type: m.attachment_type })}
                            title="Xem ảnh"
                          >
                            <img
                              className="chat-msg-img"
                              src={m.attachment_url}
                              alt={attachmentFileName(m)}
                              loading="lazy"
                            />
                          </button>
                        ) : (
                          m.attachment_url && (
                            <a
                              className="chat-msg-attach"
                              href={m.attachment_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span className="chat-file-card">
                                <span className="chat-file-icon">
                                  {(() => {
                                    const t = (m.attachment_type || '').toLowerCase()
                                    if (t === 'pdf') return <FileText size={22} />
                                    if (t === 'xlsx' || t === 'xls') return <FileSpreadsheet size={22} />
                                    if (t === 'doc' || t === 'docx') return <FileText size={22} />
                                    return <FileIcon size={22} />
                                  })()}
                                </span>
                                <span className="chat-file-meta">
                                  <span className="chat-file-name">{attachmentFileName(m)}</span>
                                  <span className="chat-file-size">
                                    {formatFileSize(m.attachment_size)}
                                    {m.attachment_type ? ` · ${m.attachment_type.toUpperCase()}` : ''}
                                  </span>
                                </span>
                              </span>
                            </a>
                          )
                        )}
                      </div>
                      <div className="chat-msg-meta">
                        {m.is_pinned && <span className="chat-msg-pinned-flag" title="Tin nhắn đã ghim"><Pin size={11} /></span>}
                        <span className="chat-msg-time">{formatDayShort(m.created_at)} · {formatTime(m.created_at)}</span>
                        <button
                          type="button"
                          className={`chat-msg-pin${m.is_pinned ? ' active' : ''}`}
                          onClick={() => handleTogglePin(m)}
                          disabled={pinBusy === m.id}
                          title={m.is_pinned ? 'Bỏ ghim tin nhắn' : 'Ghim tin nhắn quan trọng'}
                        >
                          {pinBusy === m.id
                            ? <Loader2 size={13} className="chat-spin" />
                            : (m.is_pinned ? <PinOff size={13} /> : <Pin size={13} />)}
                        </button>
                      </div>
                    </div>
                  </React.Fragment>
                )
              })}
            </div>

            {(attachment || uploading) && (
              <div className="chat-pending-attach">
                {attachment && isImageType(attachment.type) && (
                  <img className="chat-pending-thumb" src={attachment.url} alt="" />
                )}
                <span className="chat-pending-icon">
                  {attachment && !isImageType(attachment.type) && (
                    (() => {
                      const t = (attachment.type || '').toLowerCase()
                      if (t === 'pdf') return <FileText size={18} />
                      if (t === 'xlsx' || t === 'xls') return <FileSpreadsheet size={18} />
                      return <FileIcon size={18} />
                    })()
                  )}
                  {uploading && !attachment && <Loader2 size={18} className="chat-spin" />}
                </span>
                <div className="chat-pending-meta">
                  <span className="chat-pending-name">
                    {uploading && !attachment ? 'Đang tải file lên...' : attachment.name}
                  </span>
                  {attachment && <span className="chat-pending-size">{formatFileSize(attachment.size)}</span>}
                </div>
                {!uploading && (
                  <button type="button" className="chat-pending-remove" onClick={() => setAttachment(null)} title="Bỏ đính kèm">
                    <X size={16} />
                  </button>
                )}
              </div>
            )}
            <form className="chat-input-bar" onSubmit={sendMessage}>
              <button
                type="button"
                className="chat-attach-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={wsStatus !== 'open' || uploading}
                title="Đính kèm ảnh / PDF / Excel"
              >
                <Paperclip size={18} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.xlsx,.pdf,.doc,.docx,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={handleFileChange}
              />
              <input
                className="chat-input-text"
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                onPaste={handlePaste}
                placeholder="Nhập tin nhắn... (Ctrl+V để dán ảnh)"
                disabled={wsStatus !== 'open'}
              />
              <button
                type="submit"
                className="chat-send-btn"
                disabled={wsStatus !== 'open' || uploading || (!text.trim() && !attachment)}
                title="Gửi tin nhắn"
              >
                <Send size={18} />
              </button>
            </form>
            {attachError && <div className="chat-attach-error">{attachError}</div>}
            {wsStatus !== 'open' && (
              <div className="chat-offline">Kết nối chat đang mất — hệ thống đang tự kết nối lại...</div>
            )}
          </>
        )}
      </section>

      {/* ── Create room modal ── */}
      {showCreate && (
        <>
          <div className="chat-modal-overlay" onClick={() => setShowCreate(false)} />
          <div className="chat-modal">
            <div className="chat-modal-header">
              <div>
                <div className="chat-modal-title">Tạo phòng chat</div>
                <div className="chat-modal-sub">
                  {canCreateDeptRoom ? 'Chọn loại phòng: 1-1, nhóm hoặc phòng ban' : 'Chọn loại phòng và thành viên'}
                </div>
              </div>
              <button className="chat-icon-btn" onClick={() => setShowCreate(false)}><X size={18} /></button>
            </div>

            <div className="chat-modal-body">
              <div className={`chat-type-tabs${canCreateDeptRoom ? ' three' : ''}`}>
                <button
                  className={`chat-type-tab${roomType === 'direct' ? ' active' : ''}`}
                  onClick={() => setRoomType('direct')}
                >
                  <UserIcon size={16} /> 1-1 (Direct)
                </button>
                <button
                  className={`chat-type-tab${roomType === 'group' ? ' active' : ''}`}
                  onClick={() => setRoomType('group')}
                >
                  <Users size={16} /> Nhóm (Group)
                </button>
                {canCreateDeptRoom && (
                  <button
                    className={`chat-type-tab${roomType === 'department' ? ' active' : ''}`}
                    onClick={() => setRoomType('department')}
                  >
                    <Building2 size={16} /> Phòng ban
                  </button>
                )}
              </div>

              {roomType === 'group' && (
                <div className="chat-field">
                  <label>Tên nhóm</label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={e => setGroupName(e.target.value)}
                    placeholder="VD: Phòng IT, Dự án ABC..."
                  />
                </div>
              )}

              {roomType === 'department' && (
                <div className="chat-field">
                  <label>Chọn phòng ban</label>
                  {isAdmin ? (
                    <select
                      className="chat-field-select"
                      value={deptSelect}
                      onChange={e => setDeptSelect(e.target.value)}
                    >
                      {departments.map(d => (
                        <option key={d.name} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="chat-dept-fixed">
                      <Building2 size={16} />
                      <span>{userDept}</span>
                    </div>
                  )}
                  <div className="chat-dept-hint">
                    Toàn bộ nhân viên của phòng ban sẽ tự động tham gia phòng này. Chỉ admin và trưởng phòng mới quản lý được phòng.
                  </div>
                </div>
              )}

              {roomType !== 'department' && (
                <div className="chat-field">
                  <label>
                    {roomType === 'direct'
                      ? 'Chọn 1 đồng nghiệp'
                      : `Chọn thành viên (đã chọn ${selectedCodes.length})`}
                  </label>
                  <div className="chat-emp-search">
                    <Search size={15} />
                    <input
                      type="text"
                      value={empSearch}
                      onChange={e => setEmpSearch(e.target.value)}
                      placeholder="Tìm theo tên / mã NV / phòng ban..."
                    />
                  </div>
                  <div className="chat-emp-list">
                    {availableEmps.map(emp => {
                      const sel = selectedCodes.includes(emp.employee_code)
                      return (
                        <button
                          key={emp.employee_code}
                          className={`chat-emp-item${sel ? ' selected' : ''}`}
                          onClick={() => toggleSelect(emp.employee_code)}
                        >
                          <span className="chat-emp-check">{sel ? '✓' : ''}</span>
                          <span className="chat-emp-name">
                            <PresenceDot online={onlineUsers.includes(emp.employee_code)} />
                            {emp.full_name || emp.employee_code}
                            {emp.employee_code && <span className="chat-emp-code">{emp.employee_code}</span>}
                          </span>
                          <span className="chat-emp-dept">{emp.department || ''}</span>
                        </button>
                      )
                    })}
                    {availableEmps.length === 0 && (
                      <div className="chat-empty">Không tìm thấy nhân viên phù hợp.</div>
                    )}
                  </div>
                </div>
              )}

              {createError && <div className="chat-error">{createError}</div>}
            </div>

            <div className="chat-modal-footer">
              <button className="chat-btn-secondary" onClick={() => setShowCreate(false)}>Huỷ</button>
              <button className="chat-btn-primary" onClick={handleCreateRoom} disabled={creating}>
                {creating ? <Loader2 size={15} className="chat-spin" /> : <Plus size={15} />} Tạo phòng
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Manage room modal (admin / trưởng phòng / chủ nhóm) ── */}
      {manageRoom && (
        <>
          <div className="chat-modal-overlay" onClick={() => setManageRoom(null)} />
          <div className="chat-modal chat-manage-modal">
            <div className="chat-modal-header">
              <div>
                <div className="chat-modal-title">{roomDisplayName(manageRoom)}</div>
                <div className="chat-modal-sub">Quản lý phòng</div>
              </div>
              <button className="chat-icon-btn" onClick={() => setManageRoom(null)}><X size={18} /></button>
            </div>

            <div className="chat-modal-body">
              <div className="chat-manage-tabs">
                <button
                  className={`chat-manage-tab${manageTab === 'members' ? ' active' : ''}`}
                  onClick={() => setManageTab('members')}
                >
                  <Users size={15} /> Thành viên ({memberList.length})
                </button>
                <button
                  className={`chat-manage-tab${manageTab === 'settings' ? ' active' : ''}`}
                  onClick={() => setManageTab('settings')}
                >
                  <Settings size={15} /> Cài đặt
                </button>
              </div>

              {manageTab === 'members' && (
                <>
                  {manageRoom.type === 'group' && (
                    <div className="chat-field">
                      <label>Thêm thành viên</label>
                      <div className="chat-emp-search">
                        <Search size={15} />
                        <input
                          type="text"
                          value={memberSearch}
                          onChange={e => setMemberSearch(e.target.value)}
                          placeholder="Tìm theo tên / mã NV / phòng ban..."
                        />
                      </div>
                      <div className="chat-emp-list chat-emp-list-sm">
                        {addableEmps.map(emp => {
                          const sel = selectedCodes.includes(emp.employee_code)
                          return (
                            <button
                              key={emp.employee_code}
                              className={`chat-emp-item${sel ? ' selected' : ''}`}
                              onClick={() => toggleAddMember(emp.employee_code)}
                            >
                              <span className="chat-emp-check">{sel ? '✓' : ''}</span>
                              <span className="chat-emp-name">
                                <PresenceDot online={onlineUsers.includes(emp.employee_code)} />
                                {emp.full_name || emp.employee_code}
                                {emp.employee_code && <span className="chat-emp-code">{emp.employee_code}</span>}
                              </span>
                              <span className="chat-emp-dept">{emp.department || ''}</span>
                            </button>
                          )
                        })}
                        {addableEmps.length === 0 && (
                          <div className="chat-empty">Không còn nhân viên nào để thêm.</div>
                        )}
                      </div>
                      {selectedCodes.length > 0 && (
                        <button
                          className="chat-btn-primary chat-btn-block"
                          onClick={handleAddMembers}
                          disabled={managing}
                        >
                          {managing ? <Loader2 size={15} className="chat-spin" /> : <UserPlus size={15} />}
                          Thêm {selectedCodes.length} thành viên
                        </button>
                      )}
                    </div>
                  )}

                  <div className="chat-field">
                    <label>Danh sách thành viên</label>
                    <div className="chat-members-list">
                      {memberList.length === 0 && (
                        <div className="chat-empty">Đang tải thành viên...</div>
                      )}
                      {memberList.map(m => (
                        <div className="chat-member-item" key={m.employee_code}>
                          <span className="chat-member-avatar">
                            {(m.full_name || m.employee_code || '?').charAt(0).toUpperCase()}
                          </span>
                          <div className="chat-member-info">
                            <span className="chat-member-name">
                              <PresenceDot online={onlineUsers.includes(m.employee_code)} />
                              {m.full_name || m.employee_code}
                              {m.is_owner && <span className="chat-owner-badge"><Crown size={11} /> Chủ nhóm</span>}
                              {m.employee_code === userCode && <span className="chat-me-badge">Bạn</span>}
                            </span>
                            <span className="chat-member-dept">{m.department || ''}</span>
                          </div>
                          {manageRoom.type === 'group' && !m.is_owner && (
                            <button
                              className="chat-member-remove"
                              onClick={() => handleRemoveMember(m)}
                              disabled={managing}
                              title="Xoá khỏi nhóm"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {manageTab === 'settings' && (
                <>
                  <div className="chat-field">
                    <label>Tên phòng</label>
                    <input
                      type="text"
                      value={renameName}
                      onChange={e => setRenameName(e.target.value)}
                      placeholder="Nhập tên phòng..."
                    />
                  </div>
                  {manageError && <div className="chat-error">{manageError}</div>}
                  <div className="chat-manage-actions">
                    <button
                      className="chat-btn-secondary chat-btn-danger"
                      onClick={() => { setManageRoom(null); setDeleteTarget(manageRoom) }}
                    >
                      <Trash2 size={15} /> Xoá phòng
                    </button>
                    <button
                      className="chat-btn-primary"
                      onClick={handleRename}
                      disabled={managing}
                    >
                      {managing ? <Loader2 size={15} className="chat-spin" /> : <Pencil size={15} />} Lưu tên
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Delete confirm modal ── */}
      {deleteTarget && (
        <>
          <div className="chat-modal-overlay" onClick={() => setDeleteTarget(null)} />
          <div className="chat-modal chat-confirm-modal">
            <div className="chat-modal-body">
              <div className="chat-confirm-title">
                <Trash2 size={20} /> Xoá phòng chat
              </div>
              <p className="chat-confirm-text">
                Bạn có chắc muốn xoá phòng <strong>{roomDisplayName(deleteTarget)}</strong>?
                Toàn bộ tin nhắn trong phòng sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác.
              </p>
            </div>
            <div className="chat-modal-footer">
              <button className="chat-btn-secondary" onClick={() => setDeleteTarget(null)}>Huỷ</button>
              <button
                className="chat-btn-danger-solid"
                onClick={handleDeleteRoom}
                disabled={deleting}
              >
                {deleting ? <Loader2 size={15} className="chat-spin" /> : <Trash2 size={15} />} Xoá
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Pinned messages list modal ── */}
      {showPinsList && (
        <>
          <div className="chat-modal-overlay" onClick={() => setShowPinsList(false)} />
          <div className="chat-modal chat-pins-modal">
            <div className="chat-modal-header">
              <div>
                <div className="chat-modal-title"><Pin size={15} /> Tin nhắn đã ghim</div>
                <div className="chat-modal-sub">{roomDisplayName(activeRoom)} — {pinnedMessages.length} tin ghim</div>
              </div>
              <button className="chat-icon-btn" onClick={() => setShowPinsList(false)}><X size={18} /></button>
            </div>
            <div className="chat-modal-body">
              {pinnedMessages.length === 0 && (
                <div className="chat-empty-mid">Chưa có tin nhắn nào được ghim.</div>
              )}
              <div className="chat-pins-list">
                {pinnedMessages.map(p => (
                  <div className="chat-pins-item" key={p.id}>
                    <div className="chat-pins-avatar">{displayNameOf(p.sender_id).charAt(0).toUpperCase()}</div>
                    <div className="chat-pins-content">
                      <div className="chat-pins-meta">
                        <span className="chat-pins-sender">{displayNameOf(p.sender_id)}</span>
                        <span className="chat-pins-time">{formatDay(p.created_at)} {formatTime(p.created_at)}</span>
                      </div>
                      <div className="chat-pins-text">{p.content || '📎 file đính kèm'}</div>
                    </div>
                    <button
                      className="chat-pins-unpin"
                      onClick={() => handleTogglePin(p)}
                      disabled={pinBusy === p.id}
                      title="Bỏ ghim"
                    >
                      {pinBusy === p.id ? <Loader2 size={15} className="chat-spin" /> : <PinOff size={15} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="chat-modal-footer">
              <button className="chat-btn-secondary" onClick={() => setShowPinsList(false)}>Đóng</button>
            </div>
          </div>
        </>
      )}

      {/* ── Lightbox xem ảnh ── */}
      {preview && (
        <>
          <div className="chat-lightbox-overlay" onClick={() => setPreview(null)} />
          <div className="chat-lightbox">
            <div className="chat-lightbox-header">
              <span className="chat-lightbox-name" title={preview.name}>{preview.name}</span>
              <div className="chat-lightbox-actions">
                <a
                  className="chat-lightbox-btn"
                  href={preview.url}
                  download={preview.name}
                  title="Tải xuống"
                >
                  <Download size={16} />
                </a>
                <a
                  className="chat-lightbox-btn"
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  title="Mở trong tab mới"
                >
                  <ExternalLink size={16} />
                </a>
                <button className="chat-lightbox-btn" onClick={() => setPreview(null)} title="Đóng (Esc)">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="chat-lightbox-body" onClick={() => setPreview(null)}>
              <img src={preview.url} alt={preview.name} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
