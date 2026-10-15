import React from 'react'
import { X, Download } from 'lucide-react'

// Modal xem trước bằng ArtCraft (WordCraft/GridCraft convert server-side).
// file: { name, url, kind: 'pdf' | 'html' } — url là /craft/preview đã ký quyền.
// PDF mở bằng trình đọc của browser, HTML (bảng xlsx) render sandboxed.
export default function CraftPreview({ file, isOpen, onClose, onSwitchOffice }) {
  if (!isOpen || !file) return null
  return (
    <div className="fv-overlay" onClick={onClose}>
      <div className="fv-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1100 }}>
        <div className="fv-header">
          <div className="fv-header-left">
            <span className="fv-file-name">{file.name}</span>
            <span className="fv-badge" title="Render bằng WordCraft/GridCraft, không cần OnlyOffice">
              Craft beta
            </span>
          </div>
          <div className="fv-header-right">
            {onSwitchOffice && (
              <button className="fv-btn" onClick={onSwitchOffice} title="File lỗi? Mở lại bằng OnlyOffice">
                Mở bằng OnlyOffice
              </button>
            )}
            <a href={file.url} download={file.name} className="fv-icon-btn" title="Tải xuống">
              <Download size={16} />
            </a>
            <button onClick={onClose} className="fv-icon-btn fv-close-btn" title="Đóng">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="fv-content" style={{ padding: 0 }}>
          {file.kind === 'html' ? (
            <iframe title={file.name} src={file.url} sandbox=""
              style={{ width: '100%', height: '75vh', border: 0, background: '#fff' }} />
          ) : (
            <iframe title={file.name} src={file.url}
              style={{ width: '100%', height: '75vh', border: 0, background: '#fff' }} />
          )}
        </div>
      </div>
    </div>
  )
}
