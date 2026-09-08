import React, { useState, useRef, useCallback } from 'react'
import { PenTool, Save, Download, FileEdit, Loader2, Check } from 'lucide-react'
import DrawioViewer from '../components/DrawioViewer'

const COLORS = {
  primary: '#0a5b35',
  primaryHover: '#084a2b',
  bg: '#f4f7fb',
  white: '#ffffff',
  border: '#e2e8f0',
  text: '#1e293b',
  textMuted: '#64748b',
}

export default function ToolsDrawio() {
  const [fileName, setFileName] = useState('Ban_ve_moi_1')
  const [xmlData, setXmlData] = useState(null)
  const [drawioOpen, setDrawioOpen] = useState(true)
  const inputRef = useRef(null)

  const handleDownloadLocal = useCallback(() => {
    if (!xmlData) {
      alert('Chưa có dữ liệu để tải xuống')
      return
    }
    const blob = new Blob([xmlData], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${fileName || 'ban_ve'}.drawio`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }, [fileName, xmlData])

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSaveToServer = useCallback(async () => {
    if (!xmlData) {
      alert('Chưa có dữ liệu để lưu')
      return
    }
    if (!fileName?.trim()) {
      alert('Vui lòng nhập tên bản vẽ')
      inputRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      // Giả lập lưu - thay thế bằng API call thực tế
      await new Promise(resolve => setTimeout(resolve, 800))
      console.log('[ToolsDrawio] Saved:', { fileName, xmlLength: xmlData.length })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      alert('Lỗi khi lưu: ' + err.message)
    } finally {
      setSaving(false)
    }
  }, [fileName, xmlData])

  const handleDrawioSave = useCallback((xml) => {
    setXmlData(xml)
  }, [])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur()
    }
  }

  return (
    <div style={styles.wrapper}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <div style={styles.iconCircle}>
            <PenTool size={18} color={COLORS.white} />
          </div>
          <h1 style={styles.title}>Công cụ vẽ sơ đồ (Draw.io)</h1>
        </div>

        <div style={styles.toolbarCenter}>
          <FileEdit size={14} color={COLORS.textMuted} style={{ marginRight: 6, flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            onKeyDown={handleKeyDown}
            style={styles.fileNameInput}
            placeholder="Nhập tên bản vẽ..."
            spellCheck={false}
          />
        </div>

        <div style={styles.toolbarRight}>
          <button
            onClick={handleDownloadLocal}
            disabled={!xmlData}
            style={{
              ...styles.btnSecondary,
              opacity: !xmlData ? 0.5 : 1,
              cursor: !xmlData ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => { if (xmlData) e.currentTarget.style.background = '#e2e8f0' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = COLORS.white }}
            title={xmlData ? 'Tải file .drawio về máy' : 'Chưa có dữ liệu'}
          >
            <Download size={15} />
            <span>Tải xuống XML</span>
          </button>
          <button
            onClick={handleSaveToServer}
            disabled={saving}
            style={{
              ...styles.btnPrimary,
              opacity: saving ? 0.7 : 1,
              cursor: saving ? 'wait' : 'pointer',
              background: saved ? '#059669' : saving ? COLORS.textMuted : COLORS.primary,
            }}
            onMouseEnter={(e) => { if (!saving && !saved) e.currentTarget.style.background = COLORS.primaryHover }}
            onMouseLeave={(e) => { if (!saved) e.currentTarget.style.background = COLORS.primary }}
            title={saved ? 'Đã lưu thành công!' : 'Lưu bản vẽ lên hệ thống'}
          >
            {saving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : saved ? (
              <Check size={15} />
            ) : (
              <Save size={15} />
            )}
            <span>{saving ? 'Đang lưu...' : saved ? 'Đã lưu!' : 'Lưu lên hệ thống'}</span>
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div style={styles.canvasWrapper}>
        <DrawioViewer
          isOpen={drawioOpen}
          onClose={() => setDrawioOpen(false)}
          onSave={handleDrawioSave}
        />
      </div>
    </div>
  )
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: COLORS.bg,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    height: 56,
    background: COLORS.white,
    borderBottom: `1px solid ${COLORS.border}`,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    flexShrink: 0,
    zIndex: 10,
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: COLORS.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: '0.95rem',
    fontWeight: 600,
    color: COLORS.text,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  toolbarCenter: {
    display: 'flex',
    alignItems: 'center',
    flex: '0 1 280px',
    margin: '0 16px',
  },
  fileNameInput: {
    flex: 1,
    padding: '6px 10px',
    fontSize: '0.85rem',
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    outline: 'none',
    background: COLORS.bg,
    color: COLORS.text,
    fontWeight: 500,
    transition: 'border-color 0.15s',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: COLORS.text,
    background: COLORS.white,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: COLORS.white,
    background: COLORS.primary,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  canvasWrapper: {
    flex: 1,
    margin: '12px 16px 16px',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)',
    background: COLORS.white,
    position: 'relative',
  },
}
