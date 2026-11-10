import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Inbox, Send, FileText, Trash2, AlertOctagon, Folder as FolderIcon,
  Mail, MailOpen, Star, Search, RefreshCw, Plus, Paperclip, Reply,
  ReplyAll, Forward, X, Download, PenSquare,
  Loader2, Check, ArrowLeft,
} from 'lucide-react'
import {
  apiErrorMessage, eventStreamUrl, getMailAccounts, getMailFolders,
  getMailMessages, getMailMessage, updateMailFlags, deleteMailMessage,
  syncMailAccount, createMailDemo, createMailAccount, deleteMailAccount,
  createMailDraft, updateMailDraft, sendMailDraft, uploadMailAttachment,
  mailAttachmentUrl,
} from '../services/api'
import './Mail.css'

const FOLDER_ICONS = {
  inbox: Inbox,
  sent: Send,
  drafts: FileText,
  trash: Trash2,
  junk: AlertOctagon,
}

const FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'unread', label: 'Chưa đọc' },
  { key: 'starred', label: 'Có gắn sao' },
  { key: 'attachment', label: 'Có đính kèm' },
]

const EMPTY_ACCOUNT = {
  display_name: '',
  email_address: '',
  username: '',
  password: '',
  imap_host: '',
  imap_port: 993,
  imap_tls: true,
  smtp_host: '',
  smtp_port: 465,
  smtp_tls: true,
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function textToHtml(text) {
  return String(text || '')
    .split('\n')
    .map(line => `<p>${escapeHtml(line) || '<br/>'}</p>`)
    .join('')
}

function stripHtml(html) {
  const div = document.createElement('div')
  div.innerHTML = html || ''
  return (div.textContent || div.innerText || '').trim()
}

function parseRecipients(value) {
  return String(value || '')
    .split(/[,;\n]/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const match = item.match(/^(.*)<([^>]+)>$/)
      if (match) return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() }
      return { name: '', email: item }
    })
}

function recipientsToText(list) {
  return (list || [])
    .map(item => (item.name ? `${item.name} <${item.email}>` : item.email))
    .filter(Boolean)
    .join(', ')
}

function formatListDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('vi-VN', sameYear ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatFullDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('vi-VN', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function initials(name, email) {
  const source = (name || email || '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function senderLabel(message) {
  return message.from_name || message.from_email || '(Không rõ)'
}

function uniqueEmails(list) {
  const seen = new Set()
  return list.filter(value => {
    const email = (value || '').trim().toLowerCase()
    if (!email || seen.has(email)) return false
    seen.add(email)
    return true
  })
}

export default function MailPage() {
  const [accounts, setAccounts] = useState([])
  const [activeAccountId, setActiveAccountId] = useState(null)
  const [folders, setFolders] = useState([])
  const [activeFolder, setActiveFolder] = useState('inbox')
  const [messages, setMessages] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [mobileDetail, setMobileDetail] = useState(false)
  const [compose, setCompose] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT)
  const composeAttachInput = useRef(null)
  const toastTimer = useRef(null)
  const pageSize = 30

  const activeAccount = useMemo(
    () => accounts.find(item => item.id === activeAccountId) || null,
    [accounts, activeAccountId],
  )

  const notify = useCallback(message => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3500)
  }, [])

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])

  const refreshAccounts = useCallback(async (preferId) => {
    try {
      const response = await getMailAccounts()
      const list = response.data.accounts || []
      setAccounts(list)
      if (!list.length) {
        setActiveAccountId(null)
        setFolders([])
        setMessages([])
        setSelected(null)
        return list
      }
      setActiveAccountId(prev => {
        const wanted = preferId || prev
        return list.some(item => item.id === wanted) ? wanted : list[0].id
      })
      return list
    } catch (error) {
      setListError(apiErrorMessage(error))
      return []
    }
  }, [])

  const loadFolders = useCallback(async (accountId) => {
    if (!accountId) {
      setFolders([])
      return
    }
    try {
      const response = await getMailFolders(accountId)
      const list = response.data.folders || []
      setFolders(list)
      setActiveFolder(current => {
        if (list.some(folder => folder.role === current)) return current
        return list.some(folder => folder.role === 'inbox') ? 'inbox' : (list[0]?.role || 'inbox')
      })
    } catch (error) {
      notify(apiErrorMessage(error))
    }
  }, [notify])

  const loadMessages = useCallback(async (accountId, folder, keyword, currentFilter, currentPage) => {
    if (!accountId) {
      setMessages([])
      setTotal(0)
      return
    }
    setLoading(true)
    setListError('')
    try {
      const response = await getMailMessages({
        account_id: accountId,
        folder,
        q: keyword || undefined,
        filter: currentFilter === 'all' ? undefined : currentFilter,
        page: currentPage,
        page_size: pageSize,
      })
      setMessages(response.data.messages || [])
      setTotal(response.data.total || 0)
    } catch (error) {
      setListError(apiErrorMessage(error))
      setMessages([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshAccounts()
  }, [refreshAccounts])

  useEffect(() => {
    loadFolders(activeAccountId)
    setSelected(null)
    setMobileDetail(false)
    setPage(1)
    setActiveFolder('inbox')
  }, [activeAccountId, loadFolders])

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    loadMessages(activeAccountId, activeFolder, query, filter, page)
  }, [activeAccountId, activeFolder, query, filter, page, loadMessages])

  useEffect(() => {
    if (!activeAccountId) return undefined
    let source = null
    try {
      source = new EventSource(eventStreamUrl())
    } catch (_) {
      return undefined
    }
    const refresh = () => {
      loadFolders(activeAccountId)
      loadMessages(activeAccountId, activeFolder, query, filter, page)
    }
    const events = ['mail_sync', 'mail_new', 'mail_unread', 'mail_sent']
    events.forEach(name => source.addEventListener(name, refresh))
    return () => {
      events.forEach(name => source.removeEventListener(name, refresh))
      source.close()
    }
  }, [activeAccountId, activeFolder, query, filter, page, loadFolders, loadMessages])

  const openMessage = async (message) => {
    setSelected({ ...message, body: {}, attachments: [] })
    setMobileDetail(true)
    setDetailLoading(true)
    try {
      const response = await getMailMessage(message.id)
      setSelected(response.data.message)
      setMessages(prev => prev.map(item => (item.id === message.id ? { ...item, is_read: true } : item)))
      loadFolders(activeAccountId)
    } catch (error) {
      notify(apiErrorMessage(error))
    } finally {
      setDetailLoading(false)
    }
  }

  const toggleStar = async (message, event) => {
    event?.stopPropagation()
    const next = !message.is_starred
    setMessages(prev => prev.map(item => (item.id === message.id ? { ...item, is_starred: next } : item)))
    if (selected?.id === message.id) setSelected(current => ({ ...current, is_starred: next }))
    try {
      await updateMailFlags(message.id, { starred: next })
    } catch (error) {
      notify(apiErrorMessage(error))
    }
  }

  const markUnread = async () => {
    if (!selected) return
    try {
      await updateMailFlags(selected.id, { read: false })
      setMessages(prev => prev.map(item => (item.id === selected.id ? { ...item, is_read: false } : item)))
      setSelected(null)
      setMobileDetail(false)
      loadFolders(activeAccountId)
      notify('Đã đánh dấu chưa đọc')
    } catch (error) {
      notify(apiErrorMessage(error))
    }
  }

  const removeMessage = async (message) => {
    const isTrash = message.folder_role === 'trash' || activeFolder === 'trash'
    if (!window.confirm(isTrash ? 'Xoá vĩnh viễn thư này?' : 'Chuyển thư vào thùng rác?')) return
    try {
      await deleteMailMessage(message.id)
      setMessages(prev => prev.filter(item => item.id !== message.id))
      setTotal(value => Math.max(0, value - 1))
      if (selected?.id === message.id) {
        setSelected(null)
        setMobileDetail(false)
      }
      loadFolders(activeAccountId)
      notify(isTrash ? 'Đã xoá thư' : 'Đã chuyển vào thùng rác')
    } catch (error) {
      notify(apiErrorMessage(error))
    }
  }

  const openCompose = (mode = 'new', message = null) => {
    const base = {
      draftId: null,
      accountId: activeAccountId,
      to: '',
      cc: '',
      bcc: '',
      subject: '',
      body: '',
      attachments: [],
      inReplyTo: '',
    }
    if (message && mode !== 'new') {
      const sender = message.from_email || ''
      const originalText = message.body?.text_plain || stripHtml(message.body?.text_html) || message.snippet || ''
      base.inReplyTo = message.message_id || ''
      base.attachments = []
      const quoted = `\n\n---------- Thư gốc ----------\nTừ: ${senderLabel(message)} <${sender}>\nNgày: ${formatFullDate(message.received_at || message.sent_at)}\nChủ đề: ${message.subject || ''}\n\n${originalText}`
      if (mode === 'forward') {
        base.subject = /^fwd:/i.test(message.subject || '') ? message.subject : `Fwd: ${message.subject || ''}`
        base.body = quoted
      } else {
        const recipients = [sender]
        if (mode === 'replyAll') {
          ;(message.to || []).forEach(item => recipients.push(item.email))
          ;(message.cc || []).forEach(item => recipients.push(item.email))
          ;(selected?.bcc || []).forEach(item => recipients.push(item.email))
        }
        base.to = uniqueEmails(recipients).join(', ')
        base.subject = /^re:/i.test(message.subject || '') ? message.subject : `Re: ${message.subject || ''}`
        base.body = quoted
      }
    }
    setCompose(base)
  }

  const updateCompose = (key, value) => {
    setCompose(current => (current ? { ...current, [key]: value } : current))
  }

  const saveDraft = async (silent = false) => {
    if (!compose) return null
    const payload = {
      account_id: compose.accountId || activeAccountId,
      in_reply_to: compose.inReplyTo || '',
      to: parseRecipients(compose.to),
      cc: parseRecipients(compose.cc),
      bcc: parseRecipients(compose.bcc),
      subject: compose.subject,
      body_html: textToHtml(compose.body),
      attachments: compose.attachments,
    }
    if (compose.draftId) {
      await updateMailDraft(compose.draftId, payload)
      if (!silent) notify('Đã lưu bản nháp')
      return compose.draftId
    }
    const response = await createMailDraft(payload)
    const draftId = response.data.draft_id
    setCompose(current => (current ? { ...current, draftId } : current))
    if (!silent) notify('Đã lưu bản nháp')
    return draftId
  }

  const handleSend = async () => {
    if (!compose) return
    if (!compose.to.trim()) {
      notify('Vui lòng nhập người nhận')
      return
    }
    setBusy(true)
    try {
      const draftId = await saveDraft(true)
      await sendMailDraft(draftId)
      setCompose(null)
      notify('Đã gửi thư')
      loadFolders(activeAccountId)
      loadMessages(activeAccountId, activeFolder, query, filter, page)
    } catch (error) {
      notify(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const handleSaveDraft = async () => {
    setBusy(true)
    try {
      await saveDraft(false)
      loadFolders(activeAccountId)
    } catch (error) {
      notify(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const handleAttachment = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !compose) return
    setBusy(true)
    try {
      const response = await uploadMailAttachment(file)
      setCompose(current => (current ? { ...current, attachments: [...current.attachments, response.data] } : current))
      notify('Đã đính kèm tệp')
    } catch (error) {
      notify(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const handleSync = async () => {
    if (!activeAccountId) return
    setBusy(true)
    try {
      const response = await syncMailAccount(activeAccountId)
      const count = response.data.new_messages || 0
      notify(count ? `Đồng bộ xong, ${count} thư mới` : 'Đã đồng bộ hộp thư')
      loadFolders(activeAccountId)
      loadMessages(activeAccountId, activeFolder, query, filter, page)
    } catch (error) {
      notify(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const handleDemo = async () => {
    setBusy(true)
    try {
      const response = await createMailDemo()
      await refreshAccounts(response.data.account?.id)
      notify('Đã tạo hộp thư demo')
    } catch (error) {
      notify(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const handleAddAccount = async event => {
    event.preventDefault()
    setBusy(true)
    try {
      await createMailAccount({ ...accountForm, provider: 'imap', test: true })
      setShowAccountForm(false)
      setAccountForm(EMPTY_ACCOUNT)
      await refreshAccounts()
      notify('Đã thêm hộp thư')
    } catch (error) {
      notify(apiErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!activeAccountId) return
    if (!window.confirm('Xoá hộp thư này khỏi GoldenFarm? Thư trên máy chủ không bị xoá.')) return
    try {
      await deleteMailAccount(activeAccountId)
      setActiveAccountId(null)
      await refreshAccounts()
      notify('Đã xoá hộp thư')
    } catch (error) {
      notify(apiErrorMessage(error))
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const renderFolderIcon = role => {
    const Icon = FOLDER_ICONS[role] || FolderIcon
    return <Icon size={16} />
  }

  if (!accounts.length) {
    return (
      <div className="mail-page mail-empty">
        <div className="mail-empty-card">
          <div className="mail-empty-icon"><Mail size={42} /></div>
          <h2>Mail — hộp thư kiểu Outlook</h2>
          <p>
            Kết nối hộp thư IMAP/SMTP của công ty (Microsoft 365, Gmail hoặc mail server nội bộ)
            để đọc, soạn và tìm kiếm thư ngay trong GoldenFarm ICT.
          </p>
          {listError && <div className="mail-alert">{listError}</div>}
          <div className="mail-empty-actions">
            <button className="mail-btn mail-btn-primary" onClick={() => setShowAccountForm(true)}>
              <Plus size={16} /> Thêm hộp thư
            </button>
            <button className="mail-btn" onClick={handleDemo} disabled={busy}>
              {busy ? <Loader2 size={16} className="mail-spin" /> : <Mail size={16} />} Dùng dữ liệu demo
            </button>
          </div>
          <p className="mail-hint">
            Gợi ý: với Gmail/Microsoft 365 hãy tạo <b>app password</b> thay vì dùng mật khẩu chính.
          </p>
        </div>
        {showAccountForm && <AccountForm
          form={accountForm}
          setForm={setAccountForm}
          onClose={() => setShowAccountForm(false)}
          onSubmit={handleAddAccount}
          busy={busy}
        />}
        {toast && <div className="mail-toast">{toast}</div>}
      </div>
    )
  }

  return (
    <div className={`mail-page${mobileDetail ? ' mobile-detail' : ''}`}>
      <div className="mail-shell">
        <aside className="mail-rail">
          <button className="mail-compose-btn" onClick={() => openCompose('new')}>
            <PenSquare size={17} /> Soạn thư
          </button>

          <div className="mail-account">
            <select
              value={activeAccountId || ''}
              onChange={event => setActiveAccountId(Number(event.target.value))}
              title="Chọn hộp thư"
            >
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.display_name || account.email_address}
                </option>
              ))}
            </select>
            <div className="mail-account-email">{activeAccount?.email_address}</div>
            <div className="mail-account-actions">
              <button onClick={handleSync} title="Đồng bộ" disabled={busy}>
                <RefreshCw size={14} className={busy ? 'mail-spin' : ''} />
              </button>
              <button onClick={() => setShowAccountForm(true)} title="Thêm hộp thư"><Plus size={14} /></button>
              <button onClick={handleDeleteAccount} title="Xoá hộp thư"><Trash2 size={14} /></button>
            </div>
          </div>

          <nav className="mail-folders">
            {folders.map(folder => (
              <button
                key={folder.id}
                className={`mail-folder${activeFolder === folder.role ? ' active' : ''}`}
                onClick={() => {
                  setActiveFolder(folder.role)
                  setPage(1)
                  setSelected(null)
                  setMobileDetail(false)
                }}
              >
                <span className="mail-folder-icon">{renderFolderIcon(folder.role)}</span>
                <span className="mail-folder-name">{folder.name || folder.path}</span>
                {Number(folder.unread_count) > 0 && (
                  <span className="mail-unread-badge">{folder.unread_count}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="mail-rail-foot">
            {activeAccount?.provider === 'demo' || activeAccount?.is_demo
              ? 'Hộp thư demo — dữ liệu mẫu cục bộ'
              : 'IMAP/SMTP đã mã hoá mật khẩu at-rest'}
          </div>
        </aside>

        <section className="mail-list-pane">
          <div className="mail-list-head">
            <div className="mail-search">
              <Search size={15} />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Tìm theo tiêu đề, người gửi, nội dung..."
              />
              {search && (
                <button onClick={() => setSearch('')} title="Xoá tìm kiếm"><X size={14} /></button>
              )}
            </div>
            <div className="mail-filter-row">
              {FILTERS.map(item => (
                <button
                  key={item.key}
                  className={`mail-chip${filter === item.key ? ' active' : ''}`}
                  onClick={() => { setFilter(item.key); setPage(1) }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mail-list-meta">
              <span>{total} thư</span>
              <span className="mail-list-meta-right">
                {loading && <Loader2 size={14} className="mail-spin" />}
                Trang {page}/{totalPages}
              </span>
            </div>
          </div>

          <div className="mail-list">
            {listError && <div className="mail-alert">{listError}</div>}
            {!loading && !messages.length && !listError && (
              <div className="mail-list-empty">
                <MailOpen size={34} />
                <p>Không có thư trong mục này</p>
                <button className="mail-link-btn" onClick={handleSync}>Đồng bộ lại</button>
              </div>
            )}
            {messages.map(message => (
              <article
                key={message.id}
                className={`mail-item${message.is_read ? '' : ' unread'}${selected?.id === message.id ? ' active' : ''}`}
                onClick={() => openMessage(message)}
              >
                <div className="mail-avatar">{initials(message.from_name, message.from_email)}</div>
                <div className="mail-item-main">
                  <div className="mail-item-top">
                    <span className="mail-sender">{senderLabel(message)}</span>
                    <span className="mail-date">{formatListDate(message.received_at || message.sent_at)}</span>
                  </div>
                  <div className="mail-subject">
                    {message.has_attachment && <Paperclip size={12} />}
                    {message.subject || '(Không có tiêu đề)'}
                  </div>
                  <div className="mail-snippet">{message.snippet || ' '}</div>
                </div>
                <button
                  className={`mail-star${message.is_starred ? ' active' : ''}`}
                  onClick={event => toggleStar(message, event)}
                  title={message.is_starred ? 'Bỏ gắn sao' : 'Gắn sao'}
                >
                  <Star size={15} fill={message.is_starred ? 'currentColor' : 'none'} />
                </button>
              </article>
            ))}
          </div>

          <div className="mail-pager">
            <button disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>‹</button>
            <span>{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>›</button>
          </div>
        </section>

        <section className="mail-reader">
          {!selected ? (
            <div className="mail-reader-empty">
              <MailOpen size={40} />
              <p>Chọn một thư để đọc</p>
            </div>
          ) : (
            <>
              <div className="mail-reader-toolbar">
                <button className="mail-mobile-back" onClick={() => setMobileDetail(false)} title="Quay lại">
                  <ArrowLeft size={18} />
                </button>
                <button onClick={() => openCompose('reply', selected)} title="Trả lời"><Reply size={16} /></button>
                <button onClick={() => openCompose('replyAll', selected)} title="Trả lời tất cả"><ReplyAll size={16} /></button>
                <button onClick={() => openCompose('forward', selected)} title="Chuyển tiếp"><Forward size={16} /></button>
                <span className="mail-toolbar-sep" />
                <button onClick={() => toggleStar(selected)} title="Gắn sao">
                  <Star size={16} fill={selected.is_starred ? 'currentColor' : 'none'} />
                </button>
                <button onClick={markUnread} title="Đánh dấu chưa đọc"><Mail size={16} /></button>
                <button onClick={() => removeMessage(selected)} title="Xoá"><Trash2 size={16} /></button>
                <span className="mail-toolbar-spacer" />
                <span className="mail-reader-folder">{selected.folder_role}</span>
              </div>

              <div className="mail-reader-scroll">
                <header className="mail-reader-head">
                  <h1>{selected.subject || '(Không có tiêu đề)'}</h1>
                  <div className="mail-reader-from">
                    <div className="mail-avatar large">{initials(selected.from_name, selected.from_email)}</div>
                    <div>
                      <div className="mail-reader-sender">
                        {selected.from_name || selected.from_email}
                        {selected.from_email && <span>&lt;{selected.from_email}&gt;</span>}
                      </div>
                      <div className="mail-reader-recipients">
                        Đến: {recipientsToText(selected.to) || '(không rõ)'}
                        {selected.cc?.length ? ` · CC: ${recipientsToText(selected.cc)}` : ''}
                      </div>
                    </div>
                    <div className="mail-reader-date">{formatFullDate(selected.received_at || selected.sent_at)}</div>
                  </div>
                </header>

                {detailLoading && <div className="mail-reader-loading"><Loader2 size={20} className="mail-spin" /> Đang tải nội dung…</div>}

                <div className="mail-reader-body">
                  {selected.body?.text_html ? (
                    <div className="mail-html" dangerouslySetInnerHTML={{ __html: selected.body.text_html }} />
                  ) : (
                    <pre className="mail-plain">{selected.body?.text_plain || selected.snippet || '(Thư không có nội dung)'}</pre>
                  )}
                </div>

                {selected.attachments?.length > 0 && (
                  <div className="mail-attachments">
                    <div className="mail-attachments-title">
                      <Paperclip size={14} /> {selected.attachments.length} tệp đính kèm
                    </div>
                    <div className="mail-attachment-list">
                      {selected.attachments.map(attachment => (
                        <a
                          key={attachment.id}
                          className="mail-attachment"
                          href={mailAttachmentUrl(attachment.download_url)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download size={15} />
                          <span>
                            <b>{attachment.filename}</b>
                            <small>{Math.max(1, Math.round((attachment.size_bytes || 0) / 1024))} KB</small>
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {compose && (
        <div className="mail-compose-overlay" onClick={() => setCompose(null)}>
          <div className="mail-compose" onClick={event => event.stopPropagation()}>
            <div className="mail-compose-head">
              <h2>{compose.draftId ? 'Soạn thư (bản nháp)' : 'Thư mới'}</h2>
              <button onClick={() => setCompose(null)} title="Đóng"><X size={18} /></button>
            </div>

            <div className="mail-compose-body">
              <label className="mail-field">
                <span>Đến</span>
                <input
                  value={compose.to}
                  onChange={event => updateCompose('to', event.target.value)}
                  placeholder="email@congty.vn, Tên <email@congty.vn>"
                />
              </label>
              <div className="mail-cc-row">
                <label className="mail-field">
                  <span>CC</span>
                  <input value={compose.cc} onChange={event => updateCompose('cc', event.target.value)} />
                </label>
                <label className="mail-field">
                  <span>BCC</span>
                  <input value={compose.bcc} onChange={event => updateCompose('bcc', event.target.value)} />
                </label>
              </div>
              <label className="mail-field">
                <span>Chủ đề</span>
                <input
                  value={compose.subject}
                  onChange={event => updateCompose('subject', event.target.value)}
                  placeholder="Tiêu đề thư"
                />
              </label>
              <textarea
                className="mail-compose-text"
                value={compose.body}
                onChange={event => updateCompose('body', event.target.value)}
                placeholder="Nội dung thư..."
              />

              {compose.attachments.length > 0 && (
                <div className="mail-compose-attachments">
                  {compose.attachments.map((attachment, index) => (
                    <span key={`${attachment.storage_path}-${index}`} className="mail-attachment-chip">
                      <Paperclip size={12} />
                      {attachment.filename}
                      <button
                        onClick={() => setCompose(current => ({
                          ...current,
                          attachments: current.attachments.filter((_, i) => i !== index),
                        }))}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mail-compose-foot">
              <div className="mail-compose-left">
                <button className="mail-btn mail-btn-primary" onClick={handleSend} disabled={busy}>
                  {busy ? <Loader2 size={15} className="mail-spin" /> : <Send size={15} />} Gửi
                </button>
                <button className="mail-icon-btn" onClick={() => composeAttachInput.current?.click()} title="Đính kèm">
                  <Paperclip size={16} />
                </button>
                <button className="mail-btn mail-btn-ghost" onClick={handleSaveDraft} disabled={busy}>
                  Lưu nháp
                </button>
                <input
                  ref={composeAttachInput}
                  type="file"
                  hidden
                  onChange={handleAttachment}
                />
              </div>
              <span className="mail-compose-hint">Mật khẩu/Token không bao giờ hiển thị lại sau khi lưu.</span>
            </div>
          </div>
        </div>
      )}

      {showAccountForm && (
        <AccountForm
          form={accountForm}
          setForm={setAccountForm}
          onClose={() => setShowAccountForm(false)}
          onSubmit={handleAddAccount}
          busy={busy}
        />
      )}

      {toast && <div className="mail-toast">{toast}</div>}
    </div>
  )
}

function AccountForm({ form, setForm, onClose, onSubmit, busy }) {
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  return (
    <div className="mail-modal-overlay" onClick={onClose}>
      <form className="mail-modal" onClick={event => event.stopPropagation()} onSubmit={onSubmit}>
        <div className="mail-modal-head">
          <h2>Thêm hộp thư IMAP/SMTP</h2>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="mail-modal-body">
          <div className="mail-form-grid">
            <label className="mail-field">
              <span>Tên hiển thị</span>
              <input value={form.display_name} onChange={event => set('display_name', event.target.value)} placeholder="VD: Phòng Kinh doanh" />
            </label>
            <label className="mail-field">
              <span>Địa chỉ email *</span>
              <input required type="email" value={form.email_address} onChange={event => set('email_address', event.target.value)} placeholder="sales@congty.vn" />
            </label>
            <label className="mail-field">
              <span>Tên đăng nhập</span>
              <input value={form.username} onChange={event => set('username', event.target.value)} placeholder="Mặc định = email" />
            </label>
            <label className="mail-field">
              <span>Mật khẩu / App password *</span>
              <input required type="password" value={form.password} onChange={event => set('password', event.target.value)} placeholder="••••••••" />
            </label>
          </div>

          <div className="mail-form-section">
            <div className="mail-form-section-title">IMAP (nhận thư)</div>
            <div className="mail-form-grid">
              <label className="mail-field grow">
                <span>IMAP host</span>
                <input value={form.imap_host} onChange={event => set('imap_host', event.target.value)} placeholder="imap.gmail.com" />
              </label>
              <label className="mail-field small">
                <span>Port</span>
                <input type="number" value={form.imap_port} onChange={event => set('imap_port', Number(event.target.value))} />
              </label>
              <label className="mail-check">
                <input type="checkbox" checked={form.imap_tls} onChange={event => set('imap_tls', event.target.checked)} />
                SSL/TLS
              </label>
            </div>
          </div>

          <div className="mail-form-section">
            <div className="mail-form-section-title">SMTP (gửi thư)</div>
            <div className="mail-form-grid">
              <label className="mail-field grow">
                <span>SMTP host</span>
                <input value={form.smtp_host} onChange={event => set('smtp_host', event.target.value)} placeholder="smtp.gmail.com" />
              </label>
              <label className="mail-field small">
                <span>Port</span>
                <input type="number" value={form.smtp_port} onChange={event => set('smtp_port', Number(event.target.value))} />
              </label>
              <label className="mail-check">
                <input type="checkbox" checked={form.smtp_tls} onChange={event => set('smtp_tls', event.target.checked)} />
                SSL/TLS
              </label>
            </div>
          </div>

          <p className="mail-hint">
            Gmail: imap.gmail.com:993 / smtp.gmail.com:465. Microsoft 365: outlook.office365.com:993 / smtp.office365.com:587
            (bật STARTTLS). Nên dùng app password.
          </p>
        </div>
        <div className="mail-modal-foot">
          <button type="button" className="mail-btn mail-btn-ghost" onClick={onClose}>Huỷ</button>
          <button type="submit" className="mail-btn mail-btn-primary" disabled={busy}>
            {busy ? <Loader2 size={15} className="mail-spin" /> : <Check size={15} />} Kiểm tra & lưu
          </button>
        </div>
      </form>
    </div>
  )
}
