import React, { useEffect, useState, useCallback } from 'react'
import QRCode from 'react-qr-code'
import { X, Loader2, Copy, Check, Link2, Users, Building2, Globe, Trash2, AlertCircle } from 'lucide-react'
import { getStorageDepartments, getDocumentShares, createDocumentShare, deleteDocumentShare, getShareDownloadUrl } from '../services/api'
import './ShareDocument.css'

const SHARE_TYPES = [
  { value: 'ALL', label: 'Tất cả nhân viên', icon: Users, desc: 'Mọi nhân viên nội bộ có thể truy cập' },
  { value: 'DEPT', label: 'Theo phòng ban', icon: Building2, desc: 'Chỉ nhân viên của phòng ban được chọn' },
  { value: 'PUBLIC', label: 'Công khai (Link)', icon: Globe, desc: 'Bất kỳ ai có link đều truy cập được' },
]

export default function ShareDocument({ file, isOpen, onClose }) {
  const [shareType, setShareType] = useState('ALL')
  const [departmentId, setDepartmentId] = useState('')
  const [departments, setDepartments] = useState([])
  const [expiresAt, setExpiresAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedToken, setSavedToken] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [existing, setExisting] = useState([])
  const [loadingShares, setLoadingShares] = useState(false)

  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || 'user'

  const reset = useCallback(() => {
    setShareType('ALL')
    setDepartmentId('')
    setExpiresAt('')
    setSavedToken('')
    setCopied(false)
    setError('')
  }, [])

  useEffect(() => {
    if (!isOpen) {
      reset()
      setExisting([])
      return
    }
    getStorageDepartments()
      .then(r => setDepartments(r.data?.data || []))
      .catch(() => {})
    if (file) {
      setLoadingShares(true)
      getDocumentShares(file.configId, file.filePath)
        .then(r => setExisting(r.data?.data || []))
        .catch(() => setExisting([]))
        .finally(() => setLoadingShares(false))
    }
  }, [isOpen, file, reset])

  if (!isOpen || !file) return null

  const baseLink = `${window.location.origin}/s/`
  const buildShareLink = (token) => `${baseLink}${token}`

  function fallbackCopy(link) {
    const textarea = document.createElement('textarea')
    textarea.value = link
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.style.left = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, link.length)
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch (e) {
      ok = false
    }
    document.body.removeChild(textarea)
    return ok
  }

  function handleCopyLink(link) {
    const markCopied = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
    const copy = () => {
      if (fallbackCopy(link)) markCopied()
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(link).then(markCopied).catch(copy)
    } else {
      copy()
    }
  }

  async function handleSave() {
    setError('')
    if (shareType === 'DEPT' && !departmentId) {
      setError('Vui lòng chọn phòng ban cho hình thức chia sẻ này')
      return
    }
    setSaving(true)
    try {
      const payload = {
        config_id: file.configId,
        file_path: file.filePath,
        file_id: file.fileId || '',
        file_name: file.fileName || file.entry?.name || '',
        item_type: file.itemType === 'folder' ? 'folder' : 'file',
        share_type: shareType,
        department_id: shareType === 'DEPT' ? Number(departmentId) : null,
        expires_at: expiresAt || '',
      }
      const r = await createDocumentShare(payload)
      const created = r.data?.data
      if (created?.share_token) {
        setSavedToken(created.share_token)
      }
      const shares = await getDocumentShares(file.configId, file.filePath)
      setExisting(shares.data?.data || [])
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Không thể tạo link chia sẻ')
    } finally {
      setSaving(false)
    }
  }

  async function handleRevoke(id) {
    if (!window.confirm('Thu hồi chia sẻ này? Người nhận sẽ không truy cập được nữa.')) return
    try {
      await deleteDocumentShare(id)
      setExisting(prev => prev.filter(s => s.id !== id))
      if (savedToken && !existing.some(s => s.id === id)) {
        setSavedToken('')
      }
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Không thể thu hồi')
    }
  }

  const shareTypeIcon = SHARE_TYPES.find(t => t.value === shareType)?.icon || Users
  const ShareIcon = shareTypeIcon

  return (
    <div className="shd-overlay" onClick={onClose}>
      <div className="shd-modal" onClick={e => e.stopPropagation()}>
        <div className="shd-header">
          <div className="shd-header-title">
            <ShareIcon size={18} />
            <div>
              <h3>{file.itemType === 'folder' ? 'Chia sẻ thư mục' : 'Chia sẻ tài liệu'}</h3>
              <p className="shd-file-name">{file.fileName || file.entry?.name}</p>
            </div>
          </div>
          <button className="shd-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="shd-body">
          {/* ─── Share target selector ─── */}
          <div className="shd-field-label">Đối tượng chia sẻ</div>
          <div className="shd-type-grid">
            {SHARE_TYPES.map(t => {
              const Icon = t.icon
              const active = shareType === t.value
              return (
                <button
                  key={t.value}
                  className={`shd-type-card${active ? ' active' : ''}`}
                  onClick={() => setShareType(t.value)}
                >
                  <Icon size={18} />
                  <span className="shd-type-name">{t.label}</span>
                  <span className="shd-type-desc">{t.desc}</span>
                </button>
              )
            })}
          </div>

          {/* ─── Department picker (DEPT) ─── */}
          {shareType === 'DEPT' && (
            <div className="shd-field">
              <label className="shd-field-label">Chọn phòng ban</label>
              <select
                className="salary-pwd-input"
                value={departmentId}
                onChange={e => setDepartmentId(e.target.value)}
              >
                <option value="">-- Chọn phòng ban --</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}

          {/* ─── Expiration ─── */}
          <div className="shd-field">
            <label className="shd-field-label">Ngày hết hạn (tùy chọn — để trống là không hết hạn)</label>
            <input
              type="date"
              className="salary-pwd-input"
              value={expiresAt}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setExpiresAt(e.target.value)}
            />
          </div>

          {error && (
            <div className="shd-error">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          {/* ─── Existing shares ─── */}
          {loadingShares ? (
            <div className="shd-loading"><Loader2 size={18} className="shd-spin" /> Đang tải danh sách chia sẻ...</div>
          ) : existing.length > 0 && (
            <div className="shd-existing">
              <div className="shd-field-label">Chia sẻ hiện tại</div>
              {existing.map(s => {
                const sType = SHARE_TYPES.find(t => t.value === s.share_type)
                const sIcon = sType?.icon || Users
                const SIcon = sIcon
                return (
                  <div key={s.id} className={`shd-share-row${s.expired ? ' expired' : ''}`}>
                    <SIcon size={15} />
                    <div className="shd-share-info">
                      <div className="shd-share-type">{sType?.label || s.share_type} {s.department_name ? `· ${s.department_name}` : ''}</div>
                      <div className="shd-share-meta">
                        {s.expires_at ? `Hết hạn: ${s.expires_at.slice(0, 10)}` : 'Không hết hạn'}
                        {s.expired ? ' · Đã hết hạn' : ''}
                      </div>
                    </div>
                    {s.share_token && !s.expired && (
                      <button className="shd-icon-btn" title="Sao chép link" onClick={() => handleCopyLink(buildShareLink(s.share_token))}>
                        {copied ? <Check size={14} /> : <Link2 size={14} />}
                      </button>
                    )}
                    <button className="shd-icon-btn danger" title="Thu hồi" onClick={() => handleRevoke(s.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="shd-footer">
          <button className="doc-btn doc-btn-secondary" onClick={onClose}>Đóng</button>
          <button
            className="doc-btn doc-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving && <Loader2 size={14} className="shd-spin" />}
            {saving ? 'Đang tạo...' : 'Tạo link chia sẻ'}
          </button>
        </div>

        {/* ─── Generated link + QR ─── */}
        {savedToken && (
          <div className="shd-result">
            <div className="shd-result-left">
              <div className="shd-field-label">Link chia sẻ</div>
              <div className="shd-link-row">
                <input readOnly value={buildShareLink(savedToken)} className="shd-link-input" onFocus={e => e.target.select()} />
                <button className="doc-btn doc-btn-primary shd-copy-btn" onClick={() => handleCopyLink(buildShareLink(savedToken))}>
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Đã sao chép!' : 'Sao chép'}
                </button>
              </div>
              <div className="shd-note">
                {file.itemType === 'folder'
                  ? 'Bất kỳ ai có link này đều có thể xem toàn bộ nội dung bên trong thư mục đến khi hết hạn.'
                  : 'Bất kỳ ai có link này đều có thể xem tài liệu đến khi hết hạn.'}
                {file.itemType !== 'folder' && (
                  <>
                    <br />Đường dẫn tải trực tiếp: <a href={getShareDownloadUrl(savedToken)} target="_blank" rel="noopener noreferrer">{getShareDownloadUrl(savedToken)}</a>
                  </>
                )}
              </div>
            </div>
            <div className="shd-qr">
              <div className="shd-qr-box">
                <QRCode value={buildShareLink(savedToken)} size={132} />
              </div>
              <span className="shd-qr-label">Quét QR để mở</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
