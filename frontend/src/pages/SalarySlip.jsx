import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Loader, Lock, ChevronLeft, ChevronRight, Check, AlertCircle, X, Calendar } from 'lucide-react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import useSalarySlip from '../hooks/useSalarySlip'
import './SalarySlip.css'

// "YYYY-MM" → ["MM", "YYYY"]
function parseMonth(monthStr) {
  if (!monthStr) return ['--', '----']
  const [y, m] = monthStr.split('-')
  return [m, y]
}

const MONTH_NAMES = [
  'T 1', 'T 2', 'T 3', 'T 4', 'T 5', 'T 6',
  'T 7', 'T 8', 'T 9', 'T 10', 'T 11', 'T 12'
]

export default function SalarySlip() {
  const {
    selectedMonth, salaryData, isLoading, error, needPassword,
    availableMonths, monthsLoading, pdfExporting, pdfEnabled,
    fetchSalarySlip, fetchAvailableMonths, downloadPdf, changeMonth,
  } = useSalarySlip()

  const [pwd, setPwd] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pdfMsg, setPdfMsg] = useState(null)
  const [hasRequested, setHasRequested] = useState(false)

  /* ── Custom Month Picker States ── */
  const [showPicker, setShowPicker] = useState(false)
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear())
  const pickerRef = useRef(null)

  const driverRef = useRef(null)
  const tourTimerRef = useRef(null)
  const monthClickCleanupRef = useRef(null)

  const destroyTour = useCallback(() => {
    if (tourTimerRef.current) {
      clearTimeout(tourTimerRef.current)
      tourTimerRef.current = null
    }
    if (monthClickCleanupRef.current) {
      try { monthClickCleanupRef.current() } catch (_) {}
      monthClickCleanupRef.current = null
    }
    if (driverRef.current) {
      try { driverRef.current.destroy() } catch (_) {}
      driverRef.current = null
    }
  }, [])

  const startTour = useCallback(() => {
    // 1. Dọn dẹp tour cũ nếu đang chạy
    destroyTour()

    const steps = [
      // Bước 1: Phiếu lương (nếu Modal đang mở)
      ...(document.querySelector('.salary-pwd-modal') ? [{
        element: '.salary-pwd-modal',
        popover: {
          title: 'Phiếu lương',
          description: 'Nhập mật khẩu được cung cấp để mở khóa phiếu lương.',
          side: 'top',
          showButtons: ['next', 'close'],
          nextBtnText: '>>',
        },
      }] : []),

      // Bước 2: Chọn tháng
      ...(document.querySelector('.salary-month-selector') ? [{
        element: '.salary-month-selector',
        popover: {
          title: 'Chọn tháng',
          description: 'Chuyển tháng hoặc bấm vào đây để xem phiếu lương tháng khác.',
          side: 'bottom',
          showButtons: ['close'],
        },
      }] : [])
    ]

    if (steps.length === 0) return

    // 2. Khởi tạo Driver với logic thoát đa tầng
    const d = driver({
      showProgress: false,
      animate: true,
      allowClose: true,         // Cho phép bấm ESC để thoát
      stagePadding: 4,
      stageRadius: 8,
      popoverClass: 'tour-popover-custom',
      steps: steps,

      // LOGIC THOÁT 1: Click vào nền đen -> Tắt Tour
      overlayClickBehavior: () => {
        destroyTour()
      },
      // LOGIC THOÁT 2: Click nút Close/X -> Tắt Tour
      onCloseClick: () => {
        destroyTour()
      },
      // LOGIC THOÁT 3: Khi tour tắt -> Xóa sạch Ref
      onDestroyStarted: () => {
        destroyTour()
      }
    })

    driverRef.current = d
    localStorage.setItem('has_seen_salary_tour', 'true')
    d.drive()

    // LOGIC THOÁT 4: Nếu user click thẳng vào ô Chọn Tháng -> Tắt Tour ngay lập tức để mở Dropdown chọn tháng
    setTimeout(() => {
      if (driverRef.current !== d) return
      const monthEl = document.querySelector('.salary-month-selector')
      if (monthEl) {
        const handleMonthClick = () => {
          monthEl.removeEventListener('click', handleMonthClick)
          monthClickCleanupRef.current = null
          destroyTour()
        }
        monthEl.addEventListener('click', handleMonthClick, { once: true })
        monthClickCleanupRef.current = () => {
          monthEl.removeEventListener('click', handleMonthClick)
        }
      }
    }, 200)

  }, [destroyTour])

  // Dọn dẹp bắt buộc khi component unmount
  useEffect(() => destroyTour, [destroyTour])

  useEffect(() => {
    if (isLoading) return
    if (localStorage.getItem('has_seen_salary_tour')) return

    // Hủy tour/instance cũ (nếu có) trước khi tạo hiệu ứng mới
    destroyTour()

    tourTimerRef.current = setTimeout(startTour, 600)

    // Dọn dẹp khi effect chạy lại hoặc unmount
    return () => destroyTour()
  }, [startTour, destroyTour, isLoading])

  useEffect(() => { fetchAvailableMonths() }, [])

  /* ── Sync Picker Year with Selected Month ── */
  useEffect(() => {
    if (selectedMonth) {
      setPickerYear(parseInt(selectedMonth.split('-')[0], 10))
    }
  }, [selectedMonth])

  /* ── Click outside to close picker ── */
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false)
      }
    }
    if (showPicker) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPicker])

  /* ── Month navigation ── */
  const now = new Date()
  const capMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const nextDisabled = selectedMonth >= capMonth

  const navigate = (dir) => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + dir, 1)
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (next > capMonth) return
    
    setHasRequested(true)
    changeMonth(next)
    setPwd('')
    setPwdError('')
    fetchSalarySlip(next)
  }

  const handleSelectMonth = (monthIndex) => {
    const next = `${pickerYear}-${String(monthIndex + 1).padStart(2, '0')}`
    if (next > capMonth) return
    
    setShowPicker(false)
    setHasRequested(true)
    changeMonth(next)
    setPwd('')
    setPwdError('')
    fetchSalarySlip(next)
  }

  /* ── Password submit ── */
  const handleClosePwd = () => {
    destroyTour()
    setPwd('')
    setPwdError('')
    setHasRequested(false)
    changeMonth(selectedMonth)
  }

  const handleSubmit = () => {
    destroyTour()
    if (!pwd.trim()) { setPwdError('Vui lòng nhập mật khẩu'); return }
    setPwdError('')
    fetchSalarySlip(selectedMonth, pwd)
  }

  const handleKeyDown = (e) => {
    destroyTour()
    if (e.key === 'Enter') handleSubmit()
  }

  const handlePwdChange = (e) => {
    destroyTour()
    setPwd(e.target.value)
  }

  const handlePwdFocus = () => destroyTour()

  const handleDownloadPdf = async () => {
    setPdfMsg(null)
    try {
      await downloadPdf(selectedMonth, pwd)
      setPdfMsg({ type: 'success', text: 'Đã tải PDF' })
    } catch (err) {
      setPdfMsg({ type: 'error', text: err.message })
    }
    setTimeout(() => setPdfMsg(null), 3000)
  }

  const d = salaryData

  /* ────────────── RENDER ────────────── */
  return (
    <div className="salary-container">

      {/* Password overlay */}
      {!isLoading && needPassword && (
        <div className="salary-pwd-overlay">
          <div className="salary-pwd-modal">
            <button className="salary-pwd-close" onClick={handleClosePwd} title="Đóng">
              <X size={20} />
            </button>
            <Lock size={80} className="salary-lock-icon" />
            <h3 className="salary-pwd-heading">Nhập mật khẩu để xem Phiếu lương</h3>
            <div className="salary-pwd-row">
              <input
                type="password"
                value={pwd}
                onChange={handlePwdChange}
                onFocus={handlePwdFocus}
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
        </div>
      )}

      {/* Top bar */}
      <div className="salary-header">
        <div className="salary-controls">
          
          {/* Bộ điều hướng tháng kèm Custom Picker */}
          <div className="salary-month-selector" ref={pickerRef}>
            <button className="salary-month-nav-btn" onClick={() => navigate(-1)} title="Tháng trước">
              <ChevronLeft size={16} />
            </button>
            
            <button 
              className="salary-month-display" 
              onClick={() => setShowPicker(!showPicker)} 
              title="Chọn tháng"
            >
              <Calendar size={16} />
              <span> {parseMonth(selectedMonth)[0]}/{parseMonth(selectedMonth)[1]}</span>
            </button>
            
            <button className="salary-month-nav-btn" onClick={() => navigate(1)} disabled={nextDisabled} title="Tháng sau">
              <ChevronRight size={16} />
            </button>

            {/* Custom Month Picker Popup */}
            {showPicker && (
              <div className="salary-picker-popup">
                <div className="salary-picker-header">
                  <button className="salary-picker-nav" onClick={() => setPickerYear(y => y - 1)}>
                    <ChevronLeft size={16} />
                  </button>
                  <span className="salary-picker-year">{pickerYear}</span>
                  <button 
                    className="salary-picker-nav" 
                    onClick={() => setPickerYear(y => y + 1)}
                    disabled={pickerYear >= now.getFullYear()}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="salary-picker-grid">
                  {MONTH_NAMES.map((mName, index) => {
                    const monthValue = `${pickerYear}-${String(index + 1).padStart(2, '0')}`;
                    const isDisabled = monthValue > capMonth;
                    const isActive = monthValue === selectedMonth;

                    return (
                      <button
                        key={index}
                        className={`salary-picker-cell ${isActive ? 'active' : ''}`}
                        disabled={isDisabled}
                        onClick={() => handleSelectMonth(index)}
                      >
                        {mName}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {pdfMsg && (
        <div className={`salary-pdf-msg ${pdfMsg.type}`}>
          {pdfMsg.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
          {pdfMsg.text}
        </div>
      )}

      {/* Body */}
      <div className="salary-content">
        {/* Loading */}
        {isLoading && (
          <div className="salary-state">
            <Loader size={40} className="spin" />
            <p className="salary-state-title">Đang tải...</p>
          </div>
        )}

        {/* Error */}
        {!isLoading && !needPassword && error && (
          <div className="salary-state">
            <p className="salary-state-title salary-state-error">{error}</p>
          </div>
        )}

        {/* Initial state — chọn tháng để xem */}
        {!isLoading && !needPassword && !error && !salaryData && !hasRequested && (
          <div className="salary-state">
            <Lock size={40} className="salary-state-muted" />
            <p className="salary-state-title">Chọn tháng để xem phiếu lương</p>
          </div>
        )}

        {/* No data for this month */}
        {!isLoading && !needPassword && !error && !salaryData && hasRequested && (
          <div className="salary-state">
            <p className="salary-state-title">
              Chưa có phiếu lương tháng {parseMonth(selectedMonth)[0]}/{parseMonth(selectedMonth)[1]}
            </p>
          </div>
        )}

        {/* Salary slip */}
        {!isLoading && !needPassword && !error && salaryData && (
          <div className="salary-viewer pdf-paper-wrapper">
            <div className="pdf-a4-portrait">
              {/* ... Toàn bộ nội dung PDF phiếu lương giữ nguyên ... */}
              <div className="pdf-header">
                <div className="pdf-company-info">
                  <strong>CÔNG TY TNHH CANH ĐỒNG VÀNG (GOLDEN FARM)</strong><br />
                  7 Đường số 5, Phường An Khánh, TP. Hồ Chí Minh
                </div>
                <div className="pdf-title">PHIẾU LƯƠNG THÁNG {d.MONTH}/{d.YEAR}</div>
                <div className="pdf-date">Ngày thanh toán: 15/{String(Number(d.MONTH) + 1).padStart(2, '0')}/{d.YEAR}</div>
              </div>
              
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

              <div className="pdf-notes">Ghi chú: {d.GC || '0'}</div>

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

              <div className="pdf-footer">
                Mọi thắc mắc (nếu có), anh/chị vui lòng liên hệ <span className="text-red bold">0902.180.900</span> để được giải đáp/ hướng dẫn.
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  )
}