import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, Monitor, Key, Ticket, CheckCircle, Settings, Calendar, Receipt, Folder, Shield, Menu, X, User, Lock, Eye, EyeOff, CheckSquare } from 'lucide-react'
import { changePassword } from '../services/api'

const iconMap = {
  dashboard: LayoutDashboard,
  todos: CheckSquare,
  employees: Users,
  equipment: Monitor,
  licenses: Key,
  tickets: Ticket,
  approvals: CheckCircle,
  workflows: Settings,
  bookings: Calendar,
  documents: Folder,
  salary: Receipt,
  salaryAdmin: Receipt,
  profile: User,
  permissions: Shield,
}

const allNavItems = [
  { path: '/', label: 'Dashboard', icon: 'dashboard', roles: ['user', 'head', 'admin'] },
  { path: '/todos', label: 'Công việc (Todos)', icon: 'todos', roles: ['user', 'head', 'admin'] },
  { path: '/employees', label: 'Nhân viên', icon: 'employees', roles: ['head', 'admin'] },
  { path: '/equipment', label: 'Thiết bị', icon: 'equipment', roles: ['head', 'admin'] },
  { path: '/licenses', label: 'License Keys', icon: 'licenses', roles: ['head', 'admin'] },
  { path: '/tickets', label: 'Tickets', icon: 'tickets', roles: ['user', 'head', 'admin'] },
  { path: '/approvals', label: 'Phê duyệt', icon: 'approvals', roles: ['user', 'head', 'admin'] },
  { path: '/workflows', label: 'Quy trình', icon: 'workflows', roles: ['head', 'admin'] },
  { path: '/bookings', label: 'Lịch', icon: 'bookings', roles: ['user', 'head', 'admin'] },
  { path: '/documents', label: 'Tài liệu', icon: 'documents', roles: ['user', 'head', 'admin'] },
  { path: '/salary-slip', label: 'Phiếu lương', icon: 'salary', roles: ['user', 'head', 'admin'] },
  { path: '/salary-slip-admin', label: 'Quản lý lương', icon: 'salaryAdmin', roles: ['head', 'admin'] },
  { path: '/permissions', label: 'Phân quyền', icon: 'permissions', roles: ['head', 'admin'] },
]

const MODULE_MAP = {
  '/': 'dashboard',
  '/todos': 'todos',
  '/employees': 'employees',
  '/equipment': 'equipment',
  '/licenses': 'licenses',
  '/tickets': 'tickets',
  '/approvals': 'approvals',
  '/workflows': 'workflows',
  '/bookings': 'bookings',
  '/documents': 'documents',
  '/salary-slip': 'salary',
  '/salary-slip-admin': 'salary-admin',
}


export default function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [showUserPopup, setShowUserPopup] = useState(false)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pwdMsg, setPwdMsg] = useState('')
  const [pwdOk, setPwdOk] = useState(false)
  const [pwdLoading, setPwdLoading] = useState(false)
  const [userPerms, setUserPerms] = useState(null)
  const navigate = useNavigate()
  const userCode = sessionStorage.getItem('user_code')
  const userRole = sessionStorage.getItem('user_role')
  const userDepartment = sessionStorage.getItem('user_department')

  const [userName, setUserName] = useState(
    sessionStorage.getItem('user_name') || sessionStorage.getItem('full_name') || userCode || 'Nhân viên'
  )

  useEffect(() => {
    const handleProfileUpdate = () => {
      const updatedName = sessionStorage.getItem('user_name') || sessionStorage.getItem('full_name') || userCode || 'Nhân viên'
      setUserName(updatedName)
    }
    window.addEventListener('profileUpdated', handleProfileUpdate)
    return () => window.removeEventListener('profileUpdated', handleProfileUpdate)
  }, [userCode])

  useEffect(() => {
    if (userRole === 'admin') return
    const token = sessionStorage.getItem('token')
    fetch(`/api/auth/permissions?employee_code=${userCode}&token=${token}&role=${userRole}`)
      .then(r => r.json())
      .then(d => setUserPerms(d.data || {}))
      .catch(() => setUserPerms({}))
  }, [userCode, userRole])

  function hasModuleAccess(path) {
    const moduleKey = MODULE_MAP[path]
    if (!moduleKey) return true
    if (userRole === 'admin') return true
    if (userPerms && userPerms[moduleKey]) return userPerms[moduleKey].can_view
    return allNavItems.find(i => i.path === path)?.roles?.includes(userRole) ?? true
  }

  function handleLogout() {
    sessionStorage.clear()
    navigate('/login')
  }

  function handleOpenProfile() {
    navigate('/profile')
    closeMenu()
  }

  function toggleUserPopup() {
    setShowUserPopup(s => !s)
    setOldPwd(''); setNewPwd(''); setConfirmPwd(''); setPwdMsg('')
  }

  async function handleChangePwd(e) {
    e.preventDefault(); setPwdMsg('')
    if (!oldPwd || !newPwd || !confirmPwd) { setPwdMsg('Điền đầy đủ thông tin'); setPwdOk(false); return }
    if (newPwd.length < 4) { setPwdMsg('Mật khẩu mới phải ≥ 4 ký tự'); setPwdOk(false); return }
    if (newPwd !== confirmPwd) { setPwdMsg('Mật khẩu mới không khớp'); setPwdOk(false); return }
    setPwdLoading(true)
    try {
      const res = await changePassword(userCode, oldPwd, newPwd)
      setPwdMsg(res.data.message || 'Đổi mật khẩu thành công'); setPwdOk(true)
      setOldPwd(''); setNewPwd(''); setConfirmPwd('')
    } catch (err) {
      const d = err.response?.data?.detail
      setPwdMsg(typeof d === 'string' ? d : 'Lỗi đổi mật khẩu'); setPwdOk(false)
    } finally { setPwdLoading(false) }
  }

  const navItems = allNavItems.filter(item => hasModuleAccess(item.path))

  function closeMenu() { setIsSidebarOpen(false) }

  return (
    <div className="layout">
      <style>{`
        :root {
          --bk-primary: #0a5b35;
          --bk-primary-light: #12804b;
          --bk-primary-dark: #063d23;
          --bk-on-primary: #ffffff;
          --bk-on-primary-muted: rgba(255, 255, 255, 0.75);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #f4f7fb; }
        .layout { display: flex; flex-direction: column; min-height: 100vh; font-family: 'Inter', sans-serif; }

        /* ─── Topbar (universal) ──────────────────────────────── */
        .bk-topbar {
          display: flex; align-items: center; justify-content: space-between;
          position: sticky; top: 0; z-index: 102;
          height: 52px; padding: 0 0.75rem;
          background: var(--bk-primary); color: var(--bk-on-primary);
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          flex-shrink: 0;
        }
        .bk-topbar-btn {
          display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px; background: transparent; border: none;
          color: var(--bk-on-primary); cursor: pointer; border-radius: 8px;
          transition: background-color 0.2s ease, color 0.2s ease;
        }
        .bk-topbar-btn:hover { background: var(--bk-primary-light); color: #fff; }
        .bk-topbar-btn:active { background: var(--bk-primary-dark); }
        .bk-topbar-title { font-weight: 700; font-size: 0.9rem; white-space: nowrap; }

        /* ─── Sidebar Overlay ─────────────────────────────────── */
        .bk-sidebar-overlay {
          position: fixed; inset: 0; z-index: 90;
          background: rgba(15, 23, 42, 0.4);
          opacity: 0; visibility: hidden;
          transition: opacity 0.3s ease, visibility 0.3s ease;
        }
        .bk-sidebar-overlay.open { opacity: 1; visibility: visible; }

        /* ─── Sidebar Drawer ──────────────────────────────────── */
        .bk-sidebar {
          position: fixed; top: 52px; left: 0; z-index: 100;
          width: auto; min-width: 0; max-width: 320px; height: calc(100vh - 52px);
          background: var(--bk-primary);
          display: flex; flex-direction: column;
          transform: translateX(-100%);
          transition: transform 0.3s ease;
          box-shadow: var(--bk-shadow-lg, 0 4px 16px rgba(15,23,42,0.08));
        }
        .bk-sidebar.open { transform: translateX(0); }

        .sidebar-menu { padding: 1rem 0 0.75rem; flex: 1; overflow-y: auto; }
        .menu-item {
          display: flex; align-items: center; gap: 0.6rem;
          padding: 0.55rem 1.25rem; color: var(--bk-on-primary-muted); text-decoration: none;
          font-size: 0.85rem; font-weight: 500; white-space: nowrap; transition: all 0.15s ease;
        }
        .menu-item:hover { background: var(--bk-primary-light); color: #fff; }
        .menu-item.active { background: var(--bk-primary-dark); color: #fff; font-weight: 600; }

        .sidebar-footer {
          padding: 1rem 1.25rem 0.65rem; border-top: 1px solid var(--bk-primary-light);
          flex-shrink: 0;
        }
        .user-profile-box {
          display: flex; align-items: center; gap: 0.5rem;
          color: var(--bk-on-primary); font-size: 0.9rem;
          margin-bottom: 0.75rem; padding: 0.4rem 0.5rem;
          border-radius: 6px; cursor: pointer; transition: background 0.2s;
        }
        .user-profile-box:hover { background: var(--bk-primary-light); color: var(--bk-on-primary); }
        .profile-icon { color: var(--bk-on-primary-muted); flex-shrink: 0; }
        .user-profile-box:hover .profile-icon { color: var(--bk-on-primary); }
        .user-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
        .logout-btn {
          width: 100%; padding: 0.6rem; background: transparent;
          border: 1px solid var(--bk-on-primary-muted); color: var(--bk-on-primary);
          border-radius: 20px; cursor: pointer; font-size: 0.85rem; transition: all 0.2s;
        }
        .logout-btn:hover { background: rgba(220,38,38,0.2); border-color: rgba(220,38,38,0.4); }

        /* ─── Main Content ────────────────────────────────────── */
        .main-content { flex: 1; padding: 1.5rem; min-height: calc(100vh - 52px); width: 100%; }

        /* ─── Responsive ──────────────────────────────────────── */
        @media (max-width: 1024px) {
          .main-content { padding: 1rem; }
        }
        @media (max-width: 768px) {
          .main-content { padding: 0.75rem; }
        }
        @media (max-width: 480px) {
          .main-content { padding: 0.5rem; }
        }

        /* ─── User Popup ──────────────────────────────────────── */
        .user-popup-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.4);
        }
        .user-popup {
          position: fixed; top: 0; right: 0; z-index: 210;
          width: 300px; height: 100vh;
          background: #fff;
          display: flex; flex-direction: column;
          box-shadow: -4px 0 20px rgba(0,0,0,0.15);
          animation: popupSlideIn 0.2s ease;
        }
        @keyframes popupSlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @media (max-width: 768px) {
          .user-popup { width: 100%; }
        }

        .user-popup-header {
          display: flex; align-items: center; gap: 0.6rem;
          padding: 1rem 1rem 0.75rem;
          border-bottom: 1px solid #e2e8f0;
        }
        .user-popup-header > div { flex: 1; min-width: 0; }
        .user-popup-name { font-weight: 700; font-size: 0.95rem; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .user-popup-role { font-size: 0.78rem; color: #64748b; }
        .user-popup-close {
          display: flex; align-items: center; justify-content: center;
          width: 28px; height: 28px; border: none; background: transparent;
          color: #94a3b8; cursor: pointer; border-radius: 6px; flex-shrink: 0;
        }
        .user-popup-close:hover { background: #f1f5f9; color: #475569; }
        .user-popup-section {
          flex: 1; overflow-y: auto; padding: 1rem;
        }
        .user-popup-section h4 {
          margin: 0 0 0.75rem; font-size: 0.85rem; font-weight: 600;
          color: #334155; display: flex; align-items: center; gap: 0.35rem;
        }
        .user-popup-msg {
          font-size: 0.8rem; padding: 0.45rem 0.65rem; border-radius: 6px; margin-bottom: 0.75rem;
        }
        .user-popup-msg.ok { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
        .user-popup-msg.err { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
        .user-popup-field { margin-bottom: 0.65rem; }
        .user-popup-field label {
          display: block; font-size: 0.75rem; font-weight: 600; color: #475569; margin-bottom: 0.2rem;
        }
        .user-popup-pwd { position: relative; }
        .user-popup-pwd input {
          width: 100%; padding: 0.5rem 2.2rem 0.5rem 0.65rem;
          border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.85rem;
          outline: none; box-sizing: border-box; transition: border-color 0.15s;
        }
        .user-popup-pwd input:focus { border-color: var(--bk-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--bk-primary) 10%, transparent); }
        .user-popup-eye {
          position: absolute; right: 5px; top: 50%; transform: translateY(-50%);
          background: none; border: none; color: #94a3b8; cursor: pointer;
          padding: 4px; display: flex;
        }
        .user-popup-eye:hover { color: #475569; }
        .user-popup-submit {
          width: 100%; padding: 0.55rem; margin-top: 0.35rem;
          background: var(--bk-primary); color: var(--bk-on-primary); border: none; border-radius: 6px;
          font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: background 0.15s;
        }
        .user-popup-submit:hover { background: var(--bk-primary-dark); }
        .user-popup-submit:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>

      {/* Sidebar Overlay */}
      <div className={`bk-sidebar-overlay${isSidebarOpen ? ' open' : ''}`} onClick={closeMenu} />

      {/* Sidebar Drawer */}
      <aside className={`bk-sidebar${isSidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-menu">
          {navItems.map(item => {
            const IconComp = iconMap[item.icon]
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`}
                onClick={closeMenu}
              >
                {IconComp && <IconComp size={18} />} {item.label}
              </NavLink>
            )
          })}
        </div>
        <div className="sidebar-footer">
          <div className="user-profile-box" onClick={handleOpenProfile} title="Xem thông tin hồ sơ">
            <User size={16} className="profile-icon" />
            <span className="user-name">{userName}</span>
          </div>
          <button className="logout-btn" onClick={handleLogout}>Đăng xuất</button>
        </div>
      </aside>

      {/* Topbar (universal) */}
      <header className="bk-topbar">
        <button className="bk-topbar-btn" onClick={() => setIsSidebarOpen(true)}>
          <Menu size={20} />
        </button>
        <span className="bk-topbar-title">GOLDENFARM ICT</span>
        <button className="bk-topbar-btn" onClick={toggleUserPopup}>
          <User size={20} />
        </button>
      </header>

      {/* User Popup */}
      {showUserPopup && (
        <>
          <div className="user-popup-overlay" onClick={toggleUserPopup} />
          <div className="user-popup">
            <div className="user-popup-header">
              <User size={22} />
              <div>
                <div className="user-popup-name">{userName}</div>
                <div className="user-popup-role">
                  {userRole === 'admin' ? 'Quản trị viên' : userRole === 'head' ? 'Trưởng phòng' : 'Nhân viên'}
                  {userDepartment ? ` · ${userDepartment}` : ''}
                </div>
              </div>
              <button className="user-popup-close" onClick={toggleUserPopup}><X size={16} /></button>
            </div>

            <div className="user-popup-section">
              <h4><Lock size={14} /> Đổi mật khẩu</h4>

              {pwdMsg && (
                <div className={`user-popup-msg ${pwdOk ? 'ok' : 'err'}`}>{pwdMsg}</div>
              )}

              <form onSubmit={handleChangePwd}>
                <div className="user-popup-field">
                  <label>Mật khẩu cũ</label>
                  <div className="user-popup-pwd">
                    <input type={showOld ? 'text' : 'password'} value={oldPwd}
                      onChange={e => setOldPwd(e.target.value)} placeholder="••••••" />
                    <button type="button" className="user-popup-eye" onClick={() => setShowOld(s => !s)}>
                      {showOld ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div className="user-popup-field">
                  <label>Mật khẩu mới</label>
                  <div className="user-popup-pwd">
                    <input type={showNew ? 'text' : 'password'} value={newPwd}
                      onChange={e => setNewPwd(e.target.value)} placeholder="Tối thiểu 4 ký tự" />
                    <button type="button" className="user-popup-eye" onClick={() => setShowNew(s => !s)}>
                      {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div className="user-popup-field">
                  <label>Xác nhận mật khẩu mới</label>
                  <div className="user-popup-pwd">
                    <input type={showConfirm ? 'text' : 'password'} value={confirmPwd}
                      onChange={e => setConfirmPwd(e.target.value)} placeholder="Nhập lại" />
                    <button type="button" className="user-popup-eye" onClick={() => setShowConfirm(s => !s)}>
                      {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <button type="submit" className="user-popup-submit" disabled={pwdLoading}>
                  {pwdLoading ? 'Đang xử lý...' : 'Đổi mật khẩu'}
                </button>
              </form>
            </div>
          </div>
        </>
      )}

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
