import React, { useState, useEffect } from 'react'
import { Calendar, Clock, FileText, UserCheck, Phone, AlertCircle } from 'lucide-react'
import { getEmployees, createApprovalRequest, submitApprovalRequest } from '../../services/api'
import { getApprovalTemplate } from '../../utils/approvalTemplate'

const LEAVE_TYPES = [
  { id: 'annual', label: '🏖️ Nghỉ phép năm (Trừ phép năm)' },
  { id: 'sick', label: '🏥 Nghỉ ốm / Khám bệnh' },
  { id: 'personal_paid', label: '💍 Nghỉ việc riêng có lương (Cưới hỏi, hiếu hỷ)' },
  { id: 'unpaid', label: '⏳ Nghỉ không hưởng lương' },
  { id: 'maternity', label: '👶 Nghỉ thai sản' },
]

function calcHours(from, to) {
  if (!from || !to) return 0
  const [h1, m1] = from.split(':').map(Number)
  const [h2, m2] = to.split(':').map(Number)
  if (Number.isNaN(h1) || Number.isNaN(h2)) return 0
  let diffMin = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (diffMin < 0) diffMin += 24 * 60
  return diffMin / 60
}

export default function LeaveRequestDialog({ isOpen, onClose, onSuccess, employee }) {
  const [formData, setFormData] = useState({
    leave_type: 'annual',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    session: 'full', // 'full' | 'morning' | 'afternoon' | 'hourly'
    start_time: '08:00',
    end_time: '09:00',
    hours: 1,
    reason: '',
    handover_code: '',
    contact_phone: employee?.phone || '',
    notes: '',
  })

  const [colleagues, setColleagues] = useState([])
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Lấy danh sách đồng nghiệp cùng phòng ban để chọn người bàn giao
  useEffect(() => {
    if (isOpen && employee?.department) {
      getEmployees({ department: employee.department })
        .then(res => {
          const list = res.data?.data || res.data || []
          // Loại bỏ chính mình khỏi danh sách bàn giao
          setColleagues(list.filter(e => e.employee_code !== employee.employee_code))
        })
        .catch(() => setColleagues([]))
    }
  }, [isOpen, employee])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.reason.trim()) {
      setErrorMsg('Vui lòng nhập lý do nghỉ phép.')
      return
    }

    setLoading(true)
    setErrorMsg('')

    try {
      const template = await getApprovalTemplate('leave')
      if (!template) {
        setErrorMsg('Chưa có quy trình duyệt (workflow) nào để gửi đơn. Vui lòng liên hệ quản trị viên.')
        setLoading(false)
        return
      }

      const selectedType = LEAVE_TYPES.find(t => t.id === formData.leave_type)?.label || 'Nghỉ phép'
      const computedHours = formData.session === 'hourly'
        ? calcHours(formData.start_time, formData.end_time)
        : (formData.hours || 0)
      const sessionText = formData.session === 'morning' ? ' (Buổi sáng)'
        : formData.session === 'afternoon' ? ' (Buổi chiều)'
        : formData.session === 'hourly' ? ` (Nghỉ ${computedHours} tiếng: ${formData.start_time} → ${formData.end_time})`
        : ''
      const handover = colleagues.find(c => c.employee_code === formData.handover_code)

      const description = [
        `Loại nghỉ: ${selectedType}`,
        `Thời gian: ${formData.start_date} đến ${formData.end_date}${sessionText}`,
        `Lý do: ${formData.reason}`,
        `Người bàn giao: ${handover ? `${handover.full_name} (${handover.employee_code})` : 'Chưa chỉ định'}`,
        `SĐT liên hệ khẩn cấp: ${formData.contact_phone || 'Không có'}`,
        `Nội dung bàn giao: ${formData.notes || 'Không'}`,
      ].join('\n')

      // Tạo đơn phê duyệt gửi tới trưởng phòng (template tự động chọn theo nghỉ phép)
      const payload = {
        template_id: template.id,
        title: `Đơn xin nghỉ phép: ${employee?.full_name || ''} - ${selectedType}`,
        description,
        requester_code: employee?.employee_code || sessionStorage.getItem('user_code') || '',
        metadata: {
          kind: 'leave',
          employee_code: employee?.employee_code || '',
          full_name: employee?.full_name || '',
          department: employee?.department || '',
          destination: selectedType,
          purpose: description,
          start_date: formData.start_date,
          end_date: formData.end_date,
          leave_type: formData.leave_type,
          session: formData.session,
          start_time: formData.session === 'hourly' ? formData.start_time : '',
          end_time: formData.session === 'hourly' ? formData.end_time : '',
          hours: formData.session === 'hourly' ? computedHours : 0,
          reason: formData.reason,
          handover_code: formData.handover_code,
          contact_phone: formData.contact_phone,
          notes: formData.notes,
        },
      }

      const created = await createApprovalRequest(payload)
      if (created?.data?.id) {
        await submitApprovalRequest(created.data.id)
      }
      onSuccess && onSuccess()
      onClose()
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.error || 'Lỗi gửi đơn xin nghỉ phép'
      setErrorMsg(String(detail))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={headerStyle}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            📝 Tạo Đơn Đăng Ký Nghỉ Phép
          </h3>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {errorMsg && (
          <div style={errorBoxStyle}>
            <AlertCircle size={16} /> {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* Loại nghỉ phép */}
          <div>
            <label style={labelStyle}>Loại nghỉ phép <span style={{ color: '#ef4444' }}>*</span></label>
            <select
              value={formData.leave_type}
              onChange={e => setFormData({ ...formData, leave_type: e.target.value })}
              style={inputStyle}
            >
              {LEAVE_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Chọn ngày từ - đến */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Từ ngày <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                type="date"
                value={formData.start_date}
                onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Đến ngày <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                type="date"
                min={formData.start_date}
                value={formData.end_date}
                onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                style={inputStyle}
                required
              />
            </div>
          </div>

          {/* Buổi nghỉ */}
          <div>
            <label style={labelStyle}>Khung thời gian nghỉ</label>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.2rem' }}>
              {[
                { id: 'full', label: 'Cả ngày' },
                { id: 'morning', label: 'Buổi sáng' },
                { id: 'afternoon', label: 'Buổi chiều' },
                { id: 'hourly', label: '⏰ Theo giờ' },
              ].map(item => (
                <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="session"
                    value={item.id}
                    checked={formData.session === item.id}
                    onChange={e => setFormData({ ...formData, session: e.target.value })}
                  />
                  {item.label}
                </label>
              ))}
            </div>

            {formData.session === 'hourly' && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', marginTop: '0.6rem' }}>
                <div>
                  <label style={labelStyle}>Từ giờ</label>
                  <input
                    type="time"
                    value={formData.start_time}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      start_time: e.target.value,
                      hours: calcHours(e.target.value, prev.end_time),
                    }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Đến giờ</label>
                  <input
                    type="time"
                    value={formData.end_time}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      end_time: e.target.value,
                      hours: calcHours(prev.start_time, e.target.value),
                    }))}
                    style={inputStyle}
                  />
                </div>
                <div style={{ fontSize: '0.78rem', color: '#0a5b35', fontWeight: 600, paddingBottom: '0.45rem' }}>
                  = {calcHours(formData.start_time, formData.end_time)} tiếng
                </div>
              </div>
            )}
          </div>

          {/* Lý do nghỉ phép */}
          <div>
            <label style={labelStyle}>Lý do nghỉ phép <span style={{ color: '#ef4444' }}>*</span></label>
            <textarea
              rows={2}
              placeholder="Nhập chi tiết lý do xin nghỉ phép..."
              value={formData.reason}
              onChange={e => setFormData({ ...formData, reason: e.target.value })}
              style={{ ...inputStyle, resize: 'vertical' }}
              required
            />
          </div>

          {/* Người tiếp nhận bàn giao & SĐT */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Người bàn giao công việc</label>
              <select
                value={formData.handover_code}
                onChange={e => setFormData({ ...formData, handover_code: e.target.value })}
                style={inputStyle}
              >
                <option value="">-- Chọn đồng nghiệp --</option>
                {colleagues.map(c => (
                  <option key={c.employee_code} value={c.employee_code}>
                    {c.full_name} ({c.employee_code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>SĐT khẩn cấp</label>
              <input
                type="text"
                placeholder="Số điện thoại khi cần gấp"
                value={formData.contact_phone}
                onChange={e => setFormData({ ...formData, contact_phone: e.target.value })}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Nội dung bàn giao / Ghi chú */}
          <div>
            <label style={labelStyle}>Nội dung bàn giao công việc</label>
            <textarea
              rows={2}
              placeholder="Ghi chú công việc cần xử lý trong thời gian nghỉ..."
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>Hủy</button>
            <button type="submit" disabled={loading} style={submitBtnStyle}>
              {loading ? 'Đang gửi đơn...' : '🚀 Gửi Đơn Xin Nghỉ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Inline Styles
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }
const modalStyle = { background: '#fff', borderRadius: 16, padding: '1.25rem 1.5rem', width: 500, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }
const closeBtnStyle = { width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.9rem', color: '#64748b' }
const labelStyle = { fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem', display: 'block' }
const inputStyle = { width: '100%', padding: '0.45rem 0.65rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.82rem', outline: 'none', fontFamily: 'inherit', color: '#0f172a', boxSizing: 'border-box' }
const errorBoxStyle = { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#991b1b', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }
const cancelBtnStyle = { padding: '0.45rem 0.9rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }
const submitBtnStyle = { padding: '0.45rem 1rem', background: '#0a5b35', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }
