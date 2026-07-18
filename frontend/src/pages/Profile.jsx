import React, { useEffect, useState } from 'react'
import { User, Lock, Eye, EyeOff, CheckCircle, AlertCircle, Phone, Mail, Save } from 'lucide-react'
import { changePassword, getProfile, updateProfile } from '../services/api'
import './Profile.css'

export default function Profile() {
  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || ''
  const userDepartment = sessionStorage.getItem('user_department') || ''

  const [profile, setProfile] = useState(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [personalEmail, setPersonalEmail] = useState('')
  const [profileMsg, setProfileMsg] = useState('')
  const [profileOk, setProfileOk] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pwdLoading, setPwdLoading] = useState(false)
  const [pwdMsg, setPwdMsg] = useState('')
  const [pwdOk, setPwdOk] = useState(false)

  useEffect(() => {
    getProfile(userCode).then(r => {
      const d = r.data?.data
      if (d) {
        setProfile(d)
        setFullName(d.full_name || '')
        setPhone(d.phone || '')
        setPersonalEmail(d.personal_email || '')
        sessionStorage.setItem('user_name', d.full_name || '')
        window.dispatchEvent(new Event('profileUpdated'))
      }
    }).catch(() => {})
  }, [userCode])

  async function handleSaveProfile(e) {
    e.preventDefault()
    setProfileMsg('')
    setProfileLoading(true)
    try {
      const res = await updateProfile(userCode, { full_name: fullName, phone, personal_email: personalEmail })
      setProfileMsg(res.data.message || 'Cập nhật thành công')
      setProfileOk(true)
      if (profile) setProfile({ ...profile, full_name: fullName, phone, personal_email: personalEmail })
      sessionStorage.setItem('user_name', fullName)
      sessionStorage.setItem('user_department', profile?.department || '')
      window.dispatchEvent(new Event('profileUpdated'))
    } catch (err) {
      const d = err.response?.data?.detail
      setProfileMsg(typeof d === 'string' ? d : 'Lỗi cập nhật')
      setProfileOk(false)
    } finally { setProfileLoading(false) }
  }

  async function handleChangePwd(e) {
    e.preventDefault()
    setPwdMsg('')
    if (!oldPassword || !newPassword || !confirmPassword) { setPwdMsg('Điền đầy đủ thông tin'); setPwdOk(false); return }
    if (newPassword.length < 4) { setPwdMsg('Mật khẩu mới phải có ít nhất 4 ký tự'); setPwdOk(false); return }
    if (newPassword !== confirmPassword) { setPwdMsg('Mật khẩu mới không khớp'); setPwdOk(false); return }
    setPwdLoading(true)
    try {
      const res = await changePassword(userCode, oldPassword, newPassword)
      setPwdMsg(res.data.message || 'Đổi mật khẩu thành công'); setPwdOk(true)
      setOldPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch (err) {
      const d = err.response?.data?.detail
      setPwdMsg(typeof d === 'string' ? d : 'Lỗi đổi mật khẩu'); setPwdOk(false)
    } finally { setPwdLoading(false) }
  }

  return (
    <div className="pf-wrap">
      <div className="module-header">
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><User size={22} /> Hồ sơ</h2>
      </div>

      <div className="pf-layout">
        {/* ─── Info & Edit Card ─────────────────────────────── */}
        <div className="pf-card pf-info-card">
          <h3>Thông tin cá nhân</h3>

          {profileMsg && (
            <div className={`pf-msg${profileOk ? ' pf-msg-ok' : ' pf-msg-error'}`}>
              {profileOk ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {profileMsg}
            </div>
          )}

          <form onSubmit={handleSaveProfile}>
            <div className="pf-info-row">
              <span className="pf-label">Mã NV</span>
              <span className="pf-value">{userCode}</span>
            </div>
            <div className="pf-info-row">
              <span className="pf-label">Vai trò</span>
              <span className="pf-value">{userRole === 'admin' ? 'Quản trị viên' : userRole === 'head' ? 'Trưởng phòng' : 'Nhân viên'}</span>
            </div>
            {profile?.department && (
              <div className="pf-info-row">
                <span className="pf-label">Phòng ban</span>
                <span className="pf-value">{profile.department}</span>
              </div>
            )}

            <div className="pf-field">
              <label><User size={14} /> Họ tên</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nguyễn Văn A" />
            </div>
            <div className="pf-field">
              <label><Phone size={14} /> Số điện thoại</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0912 345 678" />
            </div>
            <div className="pf-field">
              <label><Mail size={14} /> Email cá nhân</label>
              <input value={personalEmail} onChange={e => setPersonalEmail(e.target.value)} placeholder="abc@gmail.com" />
            </div>
            {profile?.email && (
              <div className="pf-info-row" style={{ fontSize: '0.82rem' }}>
                <span className="pf-label">Email công ty</span>
                <span className="pf-value" style={{ fontSize: '0.82rem' }}>{profile.email}</span>
              </div>
            )}
            <button type="submit" className="pf-submit" disabled={profileLoading}>
              {profileLoading ? 'Đang lưu...' : <><Save size={15} /> Lưu thông tin</>}
            </button>
          </form>
        </div>

        {/* ─── Change Password Card ─────────────────────────── */}
        <div className="pf-card pf-pwd-card">
          <h3><Lock size={16} /> Đổi mật khẩu</h3>

          {pwdMsg && (
            <div className={`pf-msg${pwdOk ? ' pf-msg-ok' : ' pf-msg-error'}`}>
              {pwdOk ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {pwdMsg}
            </div>
          )}

          <form onSubmit={handleChangePwd}>
            <div className="pf-field">
              <label>Mật khẩu cũ</label>
              <div className="pf-pwd-wrap">
                <input type={showOld ? 'text' : 'password'} value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)} placeholder="••••••" />
                <button type="button" className="pf-pwd-toggle" onClick={() => setShowOld(s => !s)}>
                  {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="pf-field">
              <label>Mật khẩu mới</label>
              <div className="pf-pwd-wrap">
                <input type={showNew ? 'text' : 'password'} value={newPassword}
                  onChange={e => setNewPassword(e.target.value)} placeholder="Tối thiểu 4 ký tự" />
                <button type="button" className="pf-pwd-toggle" onClick={() => setShowNew(s => !s)}>
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="pf-field">
              <label>Xác nhận mật khẩu mới</label>
              <div className="pf-pwd-wrap">
                <input type={showConfirm ? 'text' : 'password'} value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)} placeholder="Nhập lại" />
                <button type="button" className="pf-pwd-toggle" onClick={() => setShowConfirm(s => !s)}>
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" className="pf-submit" disabled={pwdLoading}>
              {pwdLoading ? 'Đang xử lý...' : 'Đổi mật khẩu'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
