import React, { useEffect, useState, useRef } from 'react'
import { Loader, Lock, ChevronLeft, ChevronRight } from 'lucide-react'
import useSalarySlip from '../hooks/useSalarySlip'
import './SalarySlip.css'

// "YYYY-MM" → ["MM", "YYYY"]
function parseMonth(monthStr) {
  if (!monthStr) return ['--', '----']
  const [y, m] = monthStr.split('-')
  return [m, y]
}

export default function SalarySlip() {
  const {
    selectedMonth, salaryData, isLoading, error, needPassword,
    fetchSalarySlip, changeMonth,
  } = useSalarySlip()

  const [pwd, setPwd] = useState('')
  const [pwdError, setPwdError] = useState('')

  useEffect(() => { fetchSalarySlip(selectedMonth) }, [])

  /* ── Month navigation ── */
  const monthInputRef = useRef(null)

  const openMonthPicker = () => {
    monthInputRef.current?.showPicker()
  }

  const navigate = (dir) => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + dir, 1)
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const now = new Date()
    const cap = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    if (next > cap) return
    changeMonth(next)
    setPwd('')
    setPwdError('')
    fetchSalarySlip(next)
  }

  const handleMonthChange = (e) => {
    const val = e.target.value
    if (!val) return
    const now = new Date()
    const cap = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const finalVal = val > cap ? cap : val
    changeMonth(finalVal)
    setPwd('')
    setPwdError('')
    fetchSalarySlip(finalVal)
  }

  const now = new Date()
  const capMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const nextDisabled = selectedMonth >= capMonth

  /* ── Password submit ── */
  const handleSubmit = () => {
    if (!pwd.trim()) { setPwdError('Vui lòng nhập mật khẩu'); return }
    setPwdError('')
    fetchSalarySlip(selectedMonth, pwd)
  }
  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSubmit() }

  /* ── Reset ── */
  const handleReset = () => {
    setPwd('')
    setPwdError('')
    changeMonth(selectedMonth)
    fetchSalarySlip(selectedMonth)
  }

  const d = salaryData   // shorthand

  /* ────────────── RENDER ────────────── */
  return (
    <div className="salary-container">

      {/* Top bar: chỉ có tháng/năm */}
      <div className="salary-header">
        <div className="salary-controls salary-month-selector">
          <button className="salary-month-nav-btn" onClick={() => navigate(-1)} title="Tháng trước">
            <ChevronLeft size={16} />
          </button>
          
          <button className="salary-month-display" onClick={openMonthPicker} title="Chọn tháng">
            Tháng {parseMonth(selectedMonth)[0]}/{parseMonth(selectedMonth)[1]} 📅
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
      </div>

      {/* Body */}
      <div className="salary-content">

        {/* Loading */}
        {isLoading && (
          <div className="salary-state">
            <Loader size={40} className="spin" />
            <p className="salary-state-title">Đang tải...</p>
          </div>
        )}

        {/* Password form */}
        {!isLoading && needPassword && (
          <div className="salary-pwd-wrap">
            <Lock size={56} className="salary-lock-icon" />
            <p className="salary-state-title">Nhập mật khẩu để xem phiếu lương</p>
            <div className="salary-pwd-row">
              <input
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Mật khẩu phiếu lương"
                className={`salary-pwd-input${pwdError ? ' input-error' : ''}`}
                autoFocus
              />
              <button onClick={handleSubmit} className="salary-btn salary-btn-primary">Xem</button>
            </div>
            {pwdError && <p className="salary-pwd-error">{pwdError}</p>}
            {error && error !== 'Nhập mật khẩu phiếu lương' && (
              <p className="salary-pwd-error">{error}</p>
            )}
          </div>
        )}

        {/* Error */}
        {!isLoading && !needPassword && error && (
          <div className="salary-state">
            <p className="salary-state-title salary-state-error">{error}</p>
          </div>
        )}

        {/* No data */}
        {!isLoading && !needPassword && !error && !salaryData && (
          <div className="salary-state">
            <Lock size={40} className="salary-state-muted" />
            <p className="salary-state-title">
              Chưa có phiếu lương tháng {parseMonth(selectedMonth)[0]}/{parseMonth(selectedMonth)[1]}
            </p>
          </div>
        )}

        {/* Salary slip */}
        {!isLoading && !needPassword && !error && salaryData && (
          <div className="salary-viewer pdf-paper-wrapper">
            <div className="pdf-a4-portrait">

              {/* 1. Tiêu đề công ty & Phiếu lương */}
              <div className="pdf-header">
                <div className="pdf-company-info">
                  <strong>CÔNG TY TNHH CANH ĐỒNG VÀNG (GOLDEN FARM)</strong><br />
                  7 Đường số 5, Phường An Khánh, TP. Hồ Chí Minh
                </div>
                <div className="pdf-title">
                  PHIẾU LƯƠNG THÁNG {d.MONTH}/{d.YEAR}
                </div>
                <div className="pdf-date">
                  Ngày thanh toán: 15/{String(Number(d.MONTH) + 1).padStart(2, '0')}/{d.YEAR}
                </div>
              </div>

              {/* 2. Thông tin nhân viên */}
              <table className="pdf-info-table">
                <tbody>
                  <tr>
                    <td width="50%"><strong>Họ và tên:</strong> {d.NAME}</td>
                    <td width="50%"><strong>Mã nhân viên:</strong> {d.ID}</td>
                  </tr>
                  <tr>
                    <td><strong>Chức danh công việc:</strong> {d.CHUCVU}</td>
                    <td><strong>Phòng ban:</strong> {d.PB}</td>
                  </tr>
                  <tr>
                    <td><strong>Ngày vào làm:</strong> {d.NVL}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>

              {/* 3. Bảng Lương Chính */}
              <table className="pdf-main-table">
                <thead>
                  <tr className="bg-yellow bold">
                    <th colSpan="2">THÔNG TIN TÍNH LƯƠNG</th>
                    <th colSpan="2">CÁC KHOẢN THU NHẬP (A)</th>
                    <th width="5%">đồng</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td width="22%">Mức lương</td><td width="15%" className="text-right">{d.ML}</td>
                    <td width="30%">Tiền lương</td><td width="23%" className="text-right">{d.TL}</td><td className="text-center">đồng</td>
                  </tr>
                  <tr>
                    <td>Mức trợ cấp tiền ăn</td><td className="text-right">{d.MTCTA}</td>
                    <td>Trợ cấp tiền ăn</td><td className="text-right">{d.TCTA}</td><td className="text-center">đồng</td>
                  </tr>
                  <tr>
                    <td>Mức trợ cấp điện thoại</td><td className="text-right">{d.MTCDT}</td>
                    <td>Trợ cấp điện thoại</td><td className="text-right">{d.TCDT}</td><td className="text-center">đồng</td>
                  </tr>
                  <tr>
                    <td>Mức trợ cấp xăng xe</td><td className="text-right">{d.MTCXX}</td>
                    <td>Trợ cấp xăng xe</td><td className="text-right">{d.TCXX}</td><td className="text-center">đồng</td>
                  </tr>
                  <tr>
                    <td>Mức hiệu quả &amp; tuân thủ</td><td className="text-right">{d.MHQTT}</td>
                    <td>Hiệu quả và tuân thủ</td><td className="text-right">{d.HQTT}</td><td className="text-center">đồng</td>
                  </tr>
                  <tr>
                    <td>Mức trợ cấp / phụ cấp khác</td><td className="text-right">{d.MTCPCK}</td>
                    <td>Trợ cấp / phụ cấp khác</td><td className="text-right">{d.TCPCK}</td><td className="text-center">đồng</td>
                  </tr>
                  <tr>
                    <td>Ngày công chuẩn trong tháng</td><td className="text-right">{d.NCCTT}</td>
                    <td>Trợ cấp ca đêm</td><td className="text-right">{d.TCCD}</td><td className="text-center">đồng</td>
                  </tr>
                  <tr>
                    <td>Ngày công hưởng lương</td><td className="text-right">{d.NCHL}</td>
                    <td>Lương tăng ca</td><td className="text-right">{d.LTC}</td><td className="text-center">đồng</td>
                  </tr>
                  <tr>
                    <td>Giờ công ca đêm</td><td className="text-right">{d.NCCD}</td>
                    <td>Truy lĩnh/ Cộng</td><td className="text-right">{d.TLC}</td><td className="text-center">đồng</td>
                  </tr>
                  <tr>
                    <td>Giờ chờ / di chuyển</td><td className="text-right">{d.GCDC}</td>
                    <td>Truy thu</td><td className="text-right">{d.TT}</td><td className="text-center">đồng</td>
                  </tr>
                  <tr>
                    <td>Giờ tăng ca ngày thường</td><td className="text-right">{d.GTCNT}</td>
                    <td>Khác</td><td className="text-right">{d.K}</td><td className="text-center">đồng</td>
                  </tr>
                  <tr>
                    <td>Giờ tăng ca ngày nghỉ</td><td className="text-right">{d.GTCNN}</td>
                    <td></td><td></td><td></td>
                  </tr>
                  <tr>
                    <td>Tỷ lệ hưởng HQ&amp;TT</td><td className="text-right">{d.TLDGHQTT}</td>
                    <td></td><td></td><td></td>
                  </tr>
                  <tr>
                    <td>Số người phụ thuộc</td><td className="text-right">{d.SNPT}</td>
                    <td colSpan="2" className="bg-yellow bold">CÁC KHOẢN KHẤU TRỪ (B)</td>
                    <td className="bg-yellow text-center bold">đồng</td>
                  </tr>
                  <tr>
                    <td colSpan="2" className="no-border-left"></td>
                    <td>BHXH, YT, TN (10.5%)</td><td className="text-right">{d.BHXH}</td><td className="text-center">đồng</td>
                  </tr>
                  <tr>
                    <td colSpan="2" className="no-border-left"></td>
                    <td>Thuế TNCN</td><td className="text-right">{d.TTNCN}</td><td className="text-center">đồng</td>
                  </tr>
                  <tr>
                    <td colSpan="2" className="no-border-left"></td>
                    <td>Đoàn phí</td><td className="text-right">{d.DP}</td><td className="text-center">đồng</td>
                  </tr>
                  <tr>
                    <td colSpan="2" className="no-border-left"></td>
                    <td className="bg-yellow bold">THỰC NHẬN (A-B)</td>
                    <td className="bg-yellow text-right bold">{d.TN}</td>
                    <td className="bg-yellow text-center bold">đồng</td>
                  </tr>
                </tbody>
              </table>

              {/* 4. Ghi chú */}
              <div className="pdf-notes">
                Ghi chú: {d.GC || '0'}
              </div>

              {/* 5. Bảng Theo dõi phép */}
              <table className="pdf-tracking-table">
                <thead>
                  <tr className="bg-yellow bold text-center">
                    <th>THEO DÕI</th>
                    <th>Tồn đầu kỳ</th>
                    <th>Phát sinh có</th>
                    <th>Sử dụng</th>
                    <th>Tồn cuối kỳ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-center">
                    <td className="text-left">Phép năm</td>
                    <td>{d.PNT}</td><td>{d.PNPS}</td><td>{d.PNSD}</td><td>{d.PNCK}</td>
                  </tr>
                  <tr className="text-center">
                    <td className="text-left">Giờ tích lũy (nghỉ bù)</td>
                    <td>{d.TLT}</td><td>{d.TLPS}</td><td>{d.TLSD}</td><td>{d.TLCK}</td>
                  </tr>
                </tbody>
              </table>

              {/* 6. Footer */}
              <div className="pdf-footer">
                Mọi thắc mắc (nếu có), anh/chị vui lòng liên hệ{' '}
                <span className="text-red bold">0902.180.900</span> để được giải đáp/ hướng dẫn.
              </div>

            </div>
          </div>
        )}

      </div>{/* end salary-content */}
    </div>
  )
}
