import React, { useState, useEffect, useRef } from 'react'
import { FileText, Upload, Check, Loader, AlertCircle, DownloadCloud, TriangleAlert, Clock, ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import '../styles/booking.css'
import './SalarySlip.css'

function parseMonthLabel(monthStr) {
  if (!monthStr) return '--/----'
  const [y, m] = monthStr.split('-')
  return `${m}/${y}`
}

function usePreviousMonth() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function SalarySlipAdmin() {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [pendingMonth, setPendingMonth] = useState(null)
  const [uploadHistory, setUploadHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const [selectedMonth, setSelectedMonth] = useState(usePreviousMonth)
  const monthInputRef = useRef(null)

  const userCode = sessionStorage.getItem('user_code') || ''
  const token = sessionStorage.getItem('token') || ''
  const role = sessionStorage.getItem('user_role') || 'admin'

  const apiBase = '/api/salary-slips/admin'

  const now = new Date()
  const capMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const prevDisabled = selectedMonth <= '2020-01'
  const nextDisabled = selectedMonth >= capMonth

  async function fetchHistory() {
    setHistoryLoading(true)
    try {
      const params = new URLSearchParams({ admin_code: userCode, token, role })
      const res = await fetch(`${apiBase}/upload-history?${params}`)
      const data = await res.json()
      if (res.ok) setUploadHistory(data.data || [])
    } catch (_) {} finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => { fetchHistory() }, [])

  function navigate(dir) {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + dir, 1)
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (next < '2020-01' || next > capMonth) return
    setSelectedMonth(next)
    setResult(null)
    setError(null)
    setPendingMonth(null)
  }

  function openMonthPicker() {
    monthInputRef.current?.showPicker()
  }

  function handleMonthChange(e) {
    const val = e.target.value
    if (!val) return
    const finalVal = val > capMonth ? capMonth : val
    setSelectedMonth(finalVal)
    setResult(null)
    setError(null)
    setPendingMonth(null)
  }

  async function handleUpload(force = false) {
    if (!file) return
    setUploading(true)
    setError(null)
    setResult(null)
    setPendingMonth(null)

    const fd = new FormData()
    fd.append('excel_file', file)

    const params = new URLSearchParams({ admin_code: userCode, token, role, month: selectedMonth })
    if (force) params.set('force', 'true')

    try {
      const res = await fetch(`${apiBase}/upload-salaries?${params}`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Upload thất bại')
      if (data.has_existing) {
        setPendingMonth(data)
        setUploading(false)
        return
      }
      setResult(data)
      fetchHistory()
    } catch (err) {
      setError(err.message)
    } finally {
      if (!pendingMonth) setUploading(false)
    }
  }

  function confirmOverwrite() {
    handleUpload(true)
  }

  function cancelOverwrite() {
    setPendingMonth(null)
    setUploading(false)
  }

  function reset() {
    setFile(null)
    setResult(null)
    setError(null)
    setPendingMonth(null)
  }

  return (
    <div className="booking-module" style={{ minHeight: 0, height: '100%' }}>
      <div className="bk-layout">
        <div className="bk-layout-main">
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--bk-bg)', padding: '1rem' }}>
            <div className="bk-header" style={{ marginBottom: '0.75rem' }}>
              <FileText size={22} />
              Upload Excel Phiếu Lương
            </div>

            {/* ─── Month Picker ─── */}
            <div className="salary-month-selector" style={{ marginBottom: '1rem', width: 'fit-content' }}>
              <button className="salary-month-nav-btn" onClick={() => navigate(-1)} disabled={prevDisabled} title="Tháng trước">
                <ChevronLeft size={16} />
              </button>
              <button className="salary-month-display" onClick={openMonthPicker} title="Chọn tháng">
                <Calendar size={14} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
                Tháng {parseMonthLabel(selectedMonth)}
              </button>
              <input
                ref={monthInputRef}
                type="month"
                className="salary-month-hidden"
                value={selectedMonth}
                max={capMonth}
                onChange={handleMonthChange}
              />
              <button className="salary-month-nav-btn" onClick={() => navigate(1)} disabled={nextDisabled} title="Tháng sau">
                <ChevronRight size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
              <div className="bk-card" style={{ padding: '1.25rem', maxWidth: 600, flex: '1 1 400px' }}>
                <div className="bk-form-group">
                  <label className="bk-form-label">
                    File Excel dữ liệu lương — tháng {parseMonthLabel(selectedMonth)}
                  </label>
                  <div
                    className={`salary-file-zone ${file ? 'uploaded' : ''}`}
                    onClick={() => document.getElementById('salary-excel-input').click()}
                  >
                    <input
                      id="salary-excel-input"
                      type="file"
                      accept=".xlsx,.xls"
                      style={{ display: 'none' }}
                      onChange={(e) => { setFile(e.target.files[0]); setResult(null); setError(null) }}
                    />
                    {file ? (
                      <><Check size={20} /><span className="salary-file-text uploaded">{file.name}</span></>
                    ) : (
                      <><Upload size={20} /><span className="salary-file-text">Chọn file Excel (.xlsx, .xls)</span></>
                    )}
                  </div>
                </div>

                <button
                  className="bk-btn bk-btn-primary"
                  style={{ width: '100%', marginTop: '0.5rem', height: '36px' }}
                  disabled={!file || uploading}
                  onClick={handleUpload}
                >
                  {uploading ? (
                    <><Loader size={16} className="spin" /> Đang xử lý...</>
                  ) : (
                    <><Upload size={16} /> Import Phiếu Lương</>
                  )}
                </button>

                {uploading && (
                  <div className="salary-progress-wrap visible" style={{ marginTop: '0.75rem' }}>
                    <div className="salary-progress-bar-bg">
                      <div className="salary-progress-bar" style={{ width: '100%', animation: 'shimmer 1.5s infinite' }}></div>
                    </div>
                    <div className="salary-progress-info">Đang xử lý dữ liệu...</div>
                  </div>
                )}

                {pendingMonth && (
                  <div className="salary-status warning" style={{ marginTop: '0.75rem' }}>
                    <p className="salary-status-title">
                      <TriangleAlert size={18} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
                      Tháng đã có dữ liệu
                    </p>
                    <p className="salary-status-desc">
                      Tháng <strong>{pendingMonth.month}</strong> đã có <strong>{pendingMonth.existing_count}</strong> bản ghi.
                      Bạn có muốn ghi đè không?
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                      <button className="bk-btn bk-btn-primary" onClick={confirmOverwrite}>
                        <Upload size={16} /> Ghi đè
                      </button>
                      <button className="bk-btn" onClick={cancelOverwrite}>
                        Hủy
                      </button>
                    </div>
                  </div>
                )}

                {result && (
                  <div className="salary-status success" style={{ marginTop: '0.75rem' }}>
                    <p className="salary-status-title">
                      <Check size={18} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
                      Import thành công
                    </p>
                    <p className="salary-status-desc">
                      Tháng: <strong>{result.month}</strong> — Đã nhập: <strong>{result.imported}</strong> nhân viên
                    </p>
                    {result.errors?.length > 0 && (
                      <details style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                        <summary style={{ cursor: 'pointer', color: 'var(--bk-warning)' }}>
                          <AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                          {result.errors.length} lỗi
                        </summary>
                        <ul style={{ margin: '0.35rem 0 0 1.25rem', color: 'var(--bk-danger)' }}>
                          {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </details>
                    )}
                    <button className="bk-btn" style={{ marginTop: '0.75rem' }} onClick={reset}>
                      <Upload size={16} /> Import tiếp
                    </button>
                  </div>
                )}

                {error && (
                  <div className="salary-status error" style={{ marginTop: '0.75rem' }}>
                    <p className="salary-status-title" style={{ color: 'var(--bk-danger)' }}>
                      <AlertCircle size={18} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
                      Lỗi
                    </p>
                    <p className="salary-status-desc">{error}</p>
                    <button className="bk-btn" style={{ marginTop: '0.75rem' }} onClick={reset}>
                      Thử lại
                    </button>
                  </div>
                )}
              </div>

              {/* ─── Upload History Box ─── */}
              <div className="bk-card" style={{ padding: '1.25rem', flex: '1 1 300px', minWidth: 280 }}>
                <div className="bk-form-label" style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Clock size={16} /> Lịch sử upload
                </div>
                {historyLoading ? (
                  <div style={{ padding: '1rem 0', textAlign: 'center', color: 'var(--bk-text-muted)', fontSize: '0.85rem' }}>Đang tải...</div>
                ) : uploadHistory.length === 0 ? (
                  <div style={{ padding: '1rem 0', textAlign: 'center', color: 'var(--bk-text-muted)', fontSize: '0.85rem' }}>Chưa có dữ liệu</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {uploadHistory.map((h, i) => (
                      <div key={h.id || i} style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.5rem 0.65rem', background: 'var(--bk-surface-hover)',
                        borderRadius: 'var(--bk-radius-sm)', fontSize: '0.82rem'
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: 'var(--bk-text)' }}>{h.month}</div>
                          <div style={{ color: 'var(--bk-text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {h.filename} · {h.record_count} NV
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '0.78rem', color: 'var(--bk-text-secondary)' }}>{h.uploaded_by_name || h.uploaded_by}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--bk-text-muted)' }}>{h.created_at?.split(' ')[0]}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
