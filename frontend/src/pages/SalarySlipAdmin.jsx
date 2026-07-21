import React, { useState, useEffect, useRef } from 'react'
import {
  FileText, Upload, Check, Loader, AlertCircle, TriangleAlert, Clock,
  ChevronLeft, ChevronRight, Calendar, Search, Download, Lock, Save,
  User, Building, Edit3, X, Eye, EyeOff, Printer, FileDown, Trash2
} from 'lucide-react'
import {
  getEmployees, getSalaryView, updateSalaryFields,
  exportSalaryPdf, batchExportSalaryPdf, uploadSalaryExcel,
  getSalaryUploadHistory, deleteSalarySlip,
  getDepartments
} from '../services/api'
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

const FIELD_LABELS = {
  NAME: 'Họ và tên', ID: 'Mã NV', PB: 'Phòng ban', CHUCVU: 'Chức vụ', NVL: 'Ngày vào làm',
  ML: 'Mức lương', MTCTA: 'Mức trợ cấp tiền ăn', MTCDT: 'Mức trợ cấp điện thoại',
  MTCXX: 'Mức trợ cấp xăng xe', MHQTT: 'Mức hiệu quả tuân thủ', MTCPCK: 'Mức trợ cấp khác',
  NCCTT: 'Ngày công chuẩn', NCHL: 'Ngày công hưởng lương', NCCD: 'Ngày công ca đêm',
  GCDC: 'Giờ chờ di chuyển', GTCNT: 'Giờ tăng ca ngày thường', GTCNN: 'Giờ tăng ca ngày nghỉ',
  TLDGHQTT: 'Tỷ lệ HQ&TT',
  TL: 'Tiền lương', TCTA: 'Trợ cấp tiền ăn', TCDT: 'Trợ cấp điện thoại',
  TCXX: 'Trợ cấp xăng xe', HQTT: 'Hiệu quả và tuân thủ', TCPCK: 'Trợ cấp khác',
  TCCD: 'Trợ cấp ca đêm', LTC: 'Lương tăng ca', TLC: 'Truy lĩnh cộng',
  TT: 'Truy thu', K: 'Khác',
  BHXH: 'BHXH, YT, TN (10.5%)', TTNCN: 'Thuế TNCN', DP: 'Đoàn phí',
  TN: 'Thực nhận (A-B)',
  PNT: 'Phép năm tồn đầu kỳ', PNPS: 'Phép năm phát sinh', PNSD: 'Phép năm sử dụng', PNCK: 'Phép năm tồn cuối',
  TLT: 'Giờ tồn đầu kỳ', TLPS: 'Giờ phát sinh', TLSD: 'Giờ sử dụng', TLCK: 'Giờ tồn cuối',
  SNPT: 'Số người phụ thuộc', GC: 'Ghi chú',
  TONG_THU_NHAP: 'Tổng thu nhập', TONG_KHAU_TRU: 'Tổng khấu trừ',
  DAY: 'Ngày', MONTH: 'Tháng', YEAR: 'Năm',
}

const EDITABLE_FIELDS = [
  'NAME', 'ID', 'PB', 'CHUCVU', 'NVL',
  'ML', 'MTCTA', 'MTCDT', 'MTCXX', 'MHQTT', 'MTCPCK',
  'NCCTT', 'NCHL', 'NCCD', 'GCDC', 'GTCNT', 'GTCNN', 'TLDGHQTT',
  'TL', 'TCTA', 'TCDT', 'TCXX', 'HQTT', 'TCPCK', 'TCCD', 'LTC', 'TLC', 'TT', 'K',
  'BHXH', 'TTNCN', 'DP', 'TN',
  'PNT', 'PNPS', 'PNSD', 'PNCK',
  'TLT', 'TLPS', 'TLSD', 'TLCK',
  'SNPT', 'GC',
]

export default function SalarySlipAdmin() {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [uploadError, setUploadError] = useState(null)
  const [pendingMonth, setPendingMonth] = useState(null)
  const [uploadHistory, setUploadHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const [selectedMonth, setSelectedMonth] = useState(usePreviousMonth)
  const monthInputRef = useRef(null)

  const [employees, setEmployees] = useState([])
  const [empLoading, setEmpLoading] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState(null)
  const [salaryData, setSalaryData] = useState(null)
  const [salaryLoading, setSalaryLoading] = useState(false)
  const [salaryError, setSalaryError] = useState(null)
  const [editedFields, setEditedFields] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('Tất cả')
  const [departments, setDepartments] = useState([])

  const [pdfPassword, setPdfPassword] = useState('')
  const [exportingPdf, setExportingPdf] = useState(false)
  const [showPwdField, setShowPwdField] = useState(false)
  const [batchExporting, setBatchExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [batchExportMsg, setBatchExportMsg] = useState(null)

  const [activeTab, setActiveTab] = useState('employees')

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
      const res = await getSalaryUploadHistory(userCode, token, role)
      setUploadHistory(res.data.data || [])
    } catch (_) {} finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
    ;(async () => {
      try {
        const res = await getDepartments()
        setDepartments(res.data.data || [])
      } catch (_) {}
    })()
  }, [])

  useEffect(() => {
    let cancelled = false
    setEmpLoading(true)
    ;(async () => {
      try {
        const res = await getEmployees(searchTerm, departmentFilter, 'active')
        if (!cancelled) setEmployees(res.data.data || [])
      } catch (_) {} finally {
        if (!cancelled) setEmpLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [departmentFilter, searchTerm])

  function navigate(dir) {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + dir, 1)
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (next < '2020-01' || next > capMonth) return
    setSelectedMonth(next)
    setSelectedEmp(null)
    setSalaryData(null)
    setEditedFields({})
    setSaveMsg(null)
  }

  function openMonthPicker() { monthInputRef.current?.showPicker() }

  function handleMonthChange(e) {
    const val = e.target.value
    if (!val) return
    const finalVal = val > capMonth ? capMonth : val
    setSelectedMonth(finalVal)
    setSelectedEmp(null)
    setSalaryData(null)
    setEditedFields({})
    setSaveMsg(null)
  }

  async function handleUpload(force = false) {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    setUploadResult(null)
    setPendingMonth(null)
    try {
      const res = await uploadSalaryExcel(file, selectedMonth, userCode, token, role, force)
      const data = res.data
      if (data.has_existing) { setPendingMonth(data); setUploading(false); return }
      setUploadResult(data)
      fetchHistory()
      fetchEmployees()
    } catch (err) {
      setUploadError(err.response?.data?.detail || 'Upload thất bại')
    } finally {
      if (!pendingMonth) setUploading(false)
    }
  }

  function confirmOverwrite() { handleUpload(true) }
  function cancelOverwrite() { setPendingMonth(null); setUploading(false) }
  function resetUpload() { setFile(null); setUploadResult(null); setUploadError(null); setPendingMonth(null) }

  async function selectEmployee(emp) {
    setSelectedEmp(emp)
    setSalaryLoading(true)
    setSalaryError(null)
    setSalaryData(null)
    setEditedFields({})
    setSaveMsg(null)
    try {
      const res = await getSalaryView(emp.employee_code, selectedMonth, userCode, token, role)
      setSalaryData(res.data.data)
    } catch (err) {
      setSalaryError(err.response?.data?.detail || 'Lỗi tải dữ liệu')
    } finally {
      setSalaryLoading(false)
    }
  }

  function handleFieldChange(field, value) {
    setEditedFields(prev => ({ ...prev, [field]: value }))
  }

  function getDisplayValue(field) {
    if (field in editedFields) return editedFields[field]
    return salaryData?.[field] ?? ''
  }

  async function saveChanges() {
    if (!selectedEmp || Object.keys(editedFields).length === 0) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await updateSalaryFields(selectedEmp.employee_code, selectedMonth, editedFields, userCode, token, role)
      setSalaryData(res.data.data)
      setEditedFields({})
      setSaveMsg({ type: 'success', text: 'Đã lưu thay đổi' })
      setTimeout(() => setSaveMsg(null), 3000)
    } catch (err) {
      setSaveMsg({ type: 'error', text: err.response?.data?.detail || 'Lỗi lưu' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedEmp || !window.confirm(`Xóa phiếu lương của ${selectedEmp.full_name} tháng ${parseMonthLabel(selectedMonth)}?`)) return
    setDeleting(true)
    try {
      await deleteSalarySlip(selectedEmp.employee_code, selectedMonth, userCode, token, role)
      setSelectedEmp(null)
      setSalaryData(null)
      setEditedFields({})
      setSaveMsg({ type: 'success', text: 'Đã xóa phiếu lương' })
      fetchEmployees()
      setTimeout(() => setSaveMsg(null), 3000)
    } catch (err) {
      setSaveMsg({ type: 'error', text: err.response?.data?.detail || 'Lỗi xóa' })
    } finally {
      setDeleting(false)
    }
  }

  async function handleBatchExport() {
    setBatchExporting(true)
    setBatchExportMsg(null)
    try {
      const res = await batchExportSalaryPdf(selectedMonth,
        departmentFilter !== 'Tất cả' ? departmentFilter : '',
        userCode, token, role)
      const blob = new Blob([res.data], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `luong_${selectedMonth}.zip`
      a.click()
      URL.revokeObjectURL(url)
      setBatchExportMsg({ type: 'success', text: `Đã xuất PDF cho tháng ${parseMonthLabel(selectedMonth)}` })
    } catch (err) {
      setBatchExportMsg({ type: 'error', text: err.response?.data?.detail || 'Lỗi xuất PDF' })
    } finally {
      setBatchExporting(false)
      setTimeout(() => setBatchExportMsg(null), 4000)
    }
  }

  async function exportPdf() {
    if (!selectedEmp) return
    setExportingPdf(true)
    try {
      const res = await exportSalaryPdf(selectedEmp.employee_code, selectedMonth, pdfPassword,
        userCode, token, role,
        Object.keys(editedFields).length > 0 ? editedFields : undefined)
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `luong_${selectedEmp.employee_code}_${selectedMonth}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setSaveMsg({ type: 'error', text: err.response?.data?.detail || 'Lỗi xuất PDF' })
    } finally {
      setExportingPdf(false)
    }
  }

  function renderField(field, options = {}) {
    const { className = '', readOnly = false } = options
    const value = getDisplayValue(field)
    const label = FIELD_LABELS[field] || field
    const isEdited = field in editedFields
    return (
      <div key={field} className={`sa-field ${className}`} data-edited={isEdited}>
        <label>{label}</label>
        {readOnly ? (
          <div className="sa-field-value">{value || '—'}</div>
        ) : (
          <input
            type="text"
            value={value}
            onChange={e => handleFieldChange(field, e.target.value)}
            className={`sa-field-input${isEdited ? ' edited' : ''}`}
          />
        )}
      </div>
    )
  }

  const hasSalaryForMonth = employees.length > 0
  const hasEdits = Object.keys(editedFields).length > 0

  return (
    <div className="sa-wrap">
      { /* ─── Top Bar ─── */ }
      <div className="sa-topbar">
        <div className="sa-topbar-left">
          <FileText size={20} />
          <span>Quản lý phiếu lương</span>
        </div>
        <div className="sa-topbar-right">
          <div className="salary-month-selector">
            <button className="salary-month-nav-btn" onClick={() => navigate(-1)} disabled={prevDisabled}>
              <ChevronLeft size={16} />
            </button>
            <button className="salary-month-display" onClick={openMonthPicker}>
              <Calendar size={14} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
              Tháng {parseMonthLabel(selectedMonth)}
            </button>
            <input ref={monthInputRef} type="month" className="salary-month-hidden"
              value={selectedMonth} max={capMonth} onChange={handleMonthChange} />
            <button className="salary-month-nav-btn" onClick={() => navigate(1)} disabled={nextDisabled}>
              <ChevronRight size={16} />
            </button>
          </div>
          <button className="sa-btn sa-btn-danger" onClick={handleBatchExport} disabled={batchExporting || employees.length === 0}
            title="Xuất tất cả phiếu lương tháng này thành PDF">
            {batchExporting ? <><Loader size={14} className="spin" /> Đang xuất...</> : <><Download size={14} /> Xuất tất cả PDF</>}
          </button>
        </div>
      </div>

      {batchExportMsg && (
        <div className={`sa-save-msg ${batchExportMsg.type}`} style={{ margin: '0.5rem 1rem 0' }}>
          {batchExportMsg.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
          {batchExportMsg.text}
        </div>
      )}

      { /* ─── Tab Navigation ─── */ }
      <div className="sa-tabs">
        <button className={`sa-tab${activeTab === 'employees' ? ' active' : ''}`}
          onClick={() => setActiveTab('employees')}>
          <User size={16} /> Nhân viên
        </button>
        <button className={`sa-tab${activeTab === 'upload' ? ' active' : ''}`}
          onClick={() => setActiveTab('upload')}>
          <Upload size={16} /> Import Excel
        </button>
        <button className={`sa-tab${activeTab === 'history' ? ' active' : ''}`}
          onClick={() => setActiveTab('history')}>
          <Clock size={16} /> Lịch sử
        </button>
      </div>

      { /* ─── Tab: Employees ─── */ }
      {activeTab === 'employees' && (
        <div className="sa-body">
          { /* Left panel: employee list */ }
          <div className="sa-sidebar">
            <div className="sa-sidebar-header">
              <div className="sa-search-wrap">
                <Search size={14} className="sa-search-icon" />
                <input type="text" className="sa-search-input" placeholder="Tìm nhân viên..."
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                {searchTerm && (
                  <button className="sa-search-clear" onClick={() => setSearchTerm('')}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <select className="sa-dept-select" value={departmentFilter}
                onChange={e => { setDepartmentFilter(e.target.value); setSelectedEmp(null); setSalaryData(null) }}>
                <option value="Tất cả">Tất cả phòng ban</option>
                {departments.map(d => (
                  <option key={d.id || d.name} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="sa-emp-list">
              {empLoading ? (
                <div className="sa-emp-empty"><Loader size={20} className="spin" /> Đang tải...</div>
              ) : employees.length === 0 ? (
                <div className="sa-emp-empty">
                  <User size={24} />
                  <p>Không tìm thấy nhân viên</p>
                  <p className="sa-emp-hint">Thử tìm kiếm với từ khóa khác</p>
                </div>
              ) : (
                employees.map(emp => (
                  <div key={emp.employee_code}
                    className={`sa-emp-item${selectedEmp?.employee_code === emp.employee_code ? ' selected' : ''}`}
                    onClick={() => selectEmployee(emp)}>
                    <div className="sa-emp-icon"><User size={16} /></div>
                    <div className="sa-emp-info">
                      <div className="sa-emp-name">{emp.full_name || emp.employee_code}</div>
                      <div className="sa-emp-meta">{emp.employee_code} · {emp.department || '—'}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          { /* Right panel: salary slip viewer/editor */ }
          <div className="sa-main">
            {!selectedEmp ? (
              <div className="sa-main-empty">
                <FileText size={48} />
                <p>Chọn nhân viên để xem và chỉnh sửa phiếu lương</p>
              </div>
            ) : salaryLoading ? (
              <div className="sa-main-loading"><Loader size={32} className="spin" /> Đang tải...</div>
            ) : salaryError ? (
              <div className="sa-main-empty">
                <AlertCircle size={32} />
                <p style={{ color: 'var(--bk-danger)' }}>{salaryError}</p>
              </div>
            ) : salaryData ? (
              <div className="sa-editor">
                <div className="sa-editor-header">
                  <div>
                    <h3>{salaryData.NAME || selectedEmp.full_name}</h3>
                    <span className="sa-editor-sub">Mã NV: {selectedEmp.employee_code} · Phòng: {salaryData.PB || selectedEmp.department}</span>
                  </div>
                  <div className="sa-editor-actions">
                    <div className="sa-pwd-wrap">
                      <input type={showPwdField ? 'text' : 'password'} className="sa-pwd-input"
                        placeholder="Pass PDF (để trống nếu k cần)" value={pdfPassword}
                        onChange={e => setPdfPassword(e.target.value)} />
                      <button className="sa-pwd-toggle" onClick={() => setShowPwdField(s => !s)}>
                        {showPwdField ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <button className="sa-btn sa-btn-primary" onClick={exportPdf} disabled={exportingPdf}>
                      {exportingPdf ? <><Loader size={14} className="spin" /> Đang xuất...</> : <><Download size={14} /> PDF</>}
                    </button>
                    <button className="sa-btn sa-btn-success" onClick={saveChanges}
                      disabled={!hasEdits || saving}>
                      {saving ? <><Loader size={14} className="spin" /> Đang lưu...</> : <><Save size={14} /> Lưu</>}
                    </button>
                    <button className="sa-btn sa-btn-danger" onClick={handleDelete} disabled={deleting}
                      style={{ borderColor: '#ef4444', color: '#ef4444' }}>
                      {deleting ? <><Loader size={14} className="spin" /> Đang xóa...</> : <><Trash2 size={14} /> Xóa</>}
                    </button>
                  </div>
                </div>

                {saveMsg && (
                  <div className={`sa-save-msg ${saveMsg.type}`}>
                    {saveMsg.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
                    {saveMsg.text}
                  </div>
                )}

                { /* Editable form */ }
                <div className="sa-form">
                  <div className="sa-form-section">
                    <h4 className="sa-form-title">Thông tin nhân viên</h4>
                    <div className="sa-form-grid sa-form-grid-2">
                      {renderField('NAME')}
                      {renderField('ID')}
                      {renderField('PB')}
                      {renderField('CHUCVU')}
                      {renderField('NVL')}
                      {renderField('SNPT')}
                    </div>
                  </div>

                  <div className="sa-form-section">
                    <h4 className="sa-form-title">Mức lương & Công</h4>
                    <div className="sa-form-grid sa-form-grid-3">
                      {renderField('ML')}
                      {renderField('MTCTA')}
                      {renderField('MTCDT')}
                      {renderField('MTCXX')}
                      {renderField('MHQTT')}
                      {renderField('MTCPCK')}
                      {renderField('NCCTT')}
                      {renderField('NCHL')}
                      {renderField('NCCD')}
                      {renderField('GCDC')}
                      {renderField('GTCNT')}
                      {renderField('GTCNN')}
                      {renderField('TLDGHQTT')}
                    </div>
                  </div>

                  <div className="sa-form-section">
                    <h4 className="sa-form-title">Thu nhập (A)</h4>
                    <div className="sa-form-grid sa-form-grid-3">
                      {renderField('TL')}
                      {renderField('TCTA')}
                      {renderField('TCDT')}
                      {renderField('TCXX')}
                      {renderField('HQTT')}
                      {renderField('TCPCK')}
                      {renderField('TCCD')}
                      {renderField('LTC')}
                      {renderField('TLC')}
                      {renderField('TT')}
                      {renderField('K')}
                    </div>
                  </div>

                  <div className="sa-form-section">
                    <h4 className="sa-form-title">Khấu trừ (B) & Thực nhận</h4>
                    <div className="sa-form-grid sa-form-grid-3">
                      {renderField('BHXH')}
                      {renderField('TTNCN')}
                      {renderField('DP')}
                      {renderField('TN')}
                    </div>
                  </div>

                  <div className="sa-form-section">
                    <h4 className="sa-form-title">Theo dõi phép năm & Giờ tích lũy</h4>
                    <div className="sa-form-grid sa-form-grid-4">
                      {renderField('PNT')}
                      {renderField('PNPS')}
                      {renderField('PNSD')}
                      {renderField('PNCK')}
                      {renderField('TLT')}
                      {renderField('TLPS')}
                      {renderField('TLSD')}
                      {renderField('TLCK')}
                    </div>
                  </div>

                  <div className="sa-form-section">
                    <h4 className="sa-form-title">Ghi chú</h4>
                    <div className="sa-form-grid sa-form-grid-1">
                      <div className="sa-field">
                        <textarea className="sa-field-input sa-textarea"
                          value={getDisplayValue('GC')}
                          onChange={e => handleFieldChange('GC', e.target.value)}
                          rows={3} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      { /* ─── Tab: Upload Excel ─── */ }
      {activeTab === 'upload' && (
        <div className="sa-upload-tab">
          <div className="bk-card" style={{ padding: '1.25rem', maxWidth: 600 }}>
            <div className="bk-form-group">
              <label className="bk-form-label">
                File Excel dữ liệu lương — tháng {parseMonthLabel(selectedMonth)}
              </label>
              <div className={`salary-file-zone ${file ? 'uploaded' : ''}`}
                onClick={() => document.getElementById('salary-excel-input').click()}>
                <input id="salary-excel-input" type="file" accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={(e) => { setFile(e.target.files[0]); setUploadResult(null); setUploadError(null) }} />
                {file ? (
                  <><Check size={20} /><span className="salary-file-text uploaded">{file.name}</span></>
                ) : (
                  <><Upload size={20} /><span className="salary-file-text">Chọn file Excel (.xlsx, .xls)</span></>
                )}
              </div>
            </div>

            <button className="bk-btn bk-btn-primary" style={{ width: '100%', marginTop: '0.5rem', height: '36px' }}
              disabled={!file || uploading} onClick={handleUpload}>
              {uploading ? <><Loader size={16} className="spin" /> Đang xử lý...</> : <><Upload size={16} /> Import Phiếu Lương</>}
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
                  <button className="bk-btn bk-btn-primary" onClick={confirmOverwrite}><Upload size={16} /> Ghi đè</button>
                  <button className="bk-btn" onClick={cancelOverwrite}>Hủy</button>
                </div>
              </div>
            )}

            {uploadResult && (
              <div className="salary-status success" style={{ marginTop: '0.75rem' }}>
                <p className="salary-status-title">
                  <Check size={18} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
                  Import thành công
                </p>
                <p className="salary-status-desc">
                  Tháng: <strong>{uploadResult.month}</strong> — Đã nhập: <strong>{uploadResult.imported}</strong> nhân viên
                </p>
                {uploadResult.errors?.length > 0 && (
                  <details style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--bk-warning)' }}>
                      <AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                      {uploadResult.errors.length} lỗi
                    </summary>
                    <ul style={{ margin: '0.35rem 0 0 1.25rem', color: 'var(--bk-danger)' }}>
                      {uploadResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </details>
                )}
                <button className="bk-btn" style={{ marginTop: '0.75rem' }} onClick={resetUpload}>
                  <Upload size={16} /> Import tiếp
                </button>
              </div>
            )}

            {uploadError && (
              <div className="salary-status error" style={{ marginTop: '0.75rem' }}>
                <p className="salary-status-title" style={{ color: 'var(--bk-danger)' }}>
                  <AlertCircle size={18} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} /> Lỗi
                </p>
                <p className="salary-status-desc">{uploadError}</p>
                <button className="bk-btn" style={{ marginTop: '0.75rem' }} onClick={resetUpload}>Thử lại</button>
              </div>
            )}
          </div>
        </div>
      )}

      { /* ─── Tab: History ─── */ }
      {activeTab === 'history' && (
        <div className="sa-history-tab">
          <div className="bk-card" style={{ padding: '1.25rem', maxWidth: 600 }}>
            <div className="bk-form-label" style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={16} /> Lịch sử upload
            </div>
            {historyLoading ? (
              <div style={{ padding: '1rem 0', textAlign: 'center', color: 'var(--bk-text-muted)', fontSize: '0.85rem' }}>
                <Loader size={16} className="spin" /> Đang tải...
              </div>
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
      )}
    </div>
  )
}
