import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, ArrowLeft, Check, Mail, Lock, KeyRound } from 'lucide-react'
import { login, forgotPassword, verifyReset } from '../services/api'
import logoSrc from '../assets/logo.png'
import bgSrc from '../assets/backgroud .webp'
import './Login.css'

export default function Login() {
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  // Forgot password state
  const [showForgot, setShowForgot] = useState(false)
  const [fpStep, setFpStep] = useState(1) // 1: enter code, 2: enter email + new password
  const [fpCode, setFpCode] = useState('')
  const [fpEmail, setFpEmail] = useState('')
  const [fpNewPass, setFpNewPass] = useState('')
  const [fpConfirm, setFpConfirm] = useState('')
  const [fpEmailHint, setFpEmailHint] = useState('')
  const [fpMsg, setFpMsg] = useState('')
  const [fpMsgType, setFpMsgType] = useState('')
  const [fpLoading, setFpLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!code || !password) { setError('Vui lòng nhập mã NV và mật khẩu'); return }
    setLoading(true); setError('')
    try {
      const res = await login(code, password)
      if (res.data.success) {
        sessionStorage.setItem('token', res.data.token)
        sessionStorage.setItem('user_code', res.data.employee_code)
        sessionStorage.setItem('user_role', res.data.role)
        sessionStorage.setItem('user_department', res.data.department || '')
        sessionStorage.setItem('user_name', res.data.full_name || res.data.name || res.data.employee_code)
        navigate('/')
      } else {
        setError(res.data.message)
      }
    } catch {
      setError('Lỗi kết nối đến server')
    } finally {
      setLoading(false)
    }
  }

  function openForgot() {
    setShowForgot(true)
    setFpStep(1)
    setFpCode('')
    setFpEmail('')
    setFpNewPass('')
    setFpConfirm('')
    setFpEmailHint('')
    setFpMsg('')
    setFpMsgType('')
  }

  function closeForgot() {
    setShowForgot(false)
    setError('')
  }

  async function handleCheckCode() {
    if (!fpCode.trim()) { setFpMsg('Vui lòng nhập mã nhân viên'); setFpMsgType('error'); return }
    setFpLoading(true); setFpMsg(''); setFpMsgType('')
    try {
      const res = await forgotPassword(fpCode.trim())
      setFpEmailHint(res.data.email_hint)
      setFpStep(2)
    } catch (err) {
      const detail = err.response?.data?.detail || 'Lỗi kết nối'
      setFpMsg(detail); setFpMsgType('error')
    } finally { setFpLoading(false) }
  }

  async function handleResetSubmit(e) {
    e.preventDefault()
    if (!fpEmail.trim()) { setFpMsg('Vui lòng nhập email cá nhân'); setFpMsgType('error'); return }
    if (fpNewPass.length < 4) { setFpMsg('Mật khẩu mới phải có ít nhất 4 ký tự'); setFpMsgType('error'); return }
    if (fpNewPass !== fpConfirm) { setFpMsg('Mật khẩu xác nhận không khớp'); setFpMsgType('error'); return }
    setFpLoading(true); setFpMsg(''); setFpMsgType('')
    try {
      const res = await verifyReset(fpCode.trim(), fpEmail.trim(), fpNewPass)
      setFpMsg(res.data.message); setFpMsgType('success')
      setTimeout(() => { closeForgot() }, 2000)
    } catch (err) {
      const detail = err.response?.data?.detail || 'Lỗi kết nối'
      setFpMsg(detail); setFpMsgType('error')
    } finally { setFpLoading(false) }
  }

  return (
    <div className="login-page" style={{ backgroundImage: `url(${bgSrc})` }}>
      <div className="login-overlay" />

      <div className="login-logo">
        <img src={logoSrc} alt="Golden Farm" />
      </div>

      <div className="login-card">
        {!showForgot ? (
          <>
            <h2 className="login-title">Đăng nhập vào Cánh Đồng Vàng</h2>

            {error && (
              <div className="login-error">{error}</div>
            )}

            <form onSubmit={handleSubmit}>
                <div className="login-field">
                  <input
                    type="text"
                    placeholder="Mã NV hoặc Email..."
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    autoFocus
                  />
              </div>

              <div className="login-field login-password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mật khẩu..."
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword(p => !p)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                />
                <span>Ghi nhớ</span>
              </label>

              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? 'Đang xử lý...' : <><ArrowRight size={18} /> Đăng nhập</>}
              </button>
            </form>

            <div className="login-links">
              <button type="button" className="login-link-btn" onClick={openForgot}>
                <KeyRound size={14} /> Quên mật khẩu?
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="login-title">
              {fpStep === 1 ? 'Xác nhận tài khoản' : 'Đặt lại mật khẩu'}
            </h2>

            {fpMsg && (
              <div className={`login-error ${fpMsgType === 'success' ? 'login-success' : ''}`}
                style={fpMsgType === 'success' ? { background: '#f0fdf4', borderColor: '#86efac', color: '#166534' } : {}}>
                {fpMsg}
              </div>
            )}

            {fpStep === 1 ? (
              <div className="login-forgot-step">
                <div className="login-field">
                  <input
                    type="text"
                    placeholder="Nhập mã nhân viên..."
                    value={fpCode}
                    onChange={e => setFpCode(e.target.value)}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCheckCode() } }}
                  />
                </div>
                <button className="login-submit" onClick={handleCheckCode} disabled={fpLoading}>
                  {fpLoading ? 'Đang kiểm tra...' : <><ArrowRight size={18} /> Xác nhận</>}
                </button>
                <div className="login-links" style={{ marginTop: '0.75rem' }}>
                  <button type="button" className="login-link-btn" onClick={closeForgot}>
                    <ArrowLeft size={14} /> Quay lại đăng nhập
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleResetSubmit}>
                {fpEmailHint && (
                  <div className="login-email-hint">
                    <Mail size={14} />
                    Email xác nhận: <strong>{fpEmailHint}</strong>
                  </div>
                )}
                <div className="login-field">
                  <input
                    type="email"
                    placeholder="Nhập email cá nhân để xác nhận..."
                    value={fpEmail}
                    onChange={e => setFpEmail(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="login-field login-password-field">
                  <input
                    type="password"
                    placeholder="Mật khẩu mới..."
                    value={fpNewPass}
                    onChange={e => setFpNewPass(e.target.value)}
                  />
                </div>
                <div className="login-field login-password-field">
                  <input
                    type="password"
                    placeholder="Xác nhận mật khẩu mới..."
                    value={fpConfirm}
                    onChange={e => setFpConfirm(e.target.value)}
                  />
                </div>
                <button type="submit" className="login-submit" disabled={fpLoading}>
                  {fpLoading ? 'Đang xử lý...' : <><Check size={18} /> Đặt lại mật khẩu</>}
                </button>
                <div className="login-links" style={{ marginTop: '0.75rem' }}>
                  <button type="button" className="login-link-btn" onClick={() => setFpStep(1)}>
                    <ArrowLeft size={14} /> Quay lại
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>

      <div className="login-footer">
        Cánh Đồng Vàng - Một ngôi nhà an toàn cho toàn bộ dữ liệu của bạn
      </div>
    </div>
  )
}
