import React, { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard, Users, Monitor, Key, Ticket, CheckCircle, 
  Settings, Calendar, Receipt, Folder, Shield, Menu, X, User, 
  Lock, Eye, EyeOff, CheckSquare, HelpCircle, Activity, MessageSquare,
  CalendarOff, PenTool
} from 'lucide-react'
import { changePassword, getProfile, apiUrl } from '../services/api'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import logoSrc from '../assets/logo.png'

const iconMap = {
  dashboard: LayoutDashboard,
  todos: CheckSquare,
  chat: MessageSquare,
  employees: Users,
  equipment: Monitor,
  licenses: Key,
  tickets: Ticket,
  approvals: CheckCircle,
  workflows: Settings,
  bookings: Calendar,
  nghiphep: CalendarOff,
  documents: Folder,
  salary: Receipt,
  salaryAdmin: Receipt,
  profile: User,
  permissions: Shield,
  monitor: Activity,
  help: HelpCircle,
  drawioTools: PenTool,
}

const allNavItems = [
  { path: '/', label: 'Dashboard', icon: 'dashboard', roles: ['user', 'head', 'admin'] },
  { path: '/todos', label: 'Công việc (Todos)', icon: 'todos', roles: ['user', 'head', 'admin'] },
  { path: '/chat', label: 'Chat', icon: 'chat', roles: ['user', 'head', 'admin'] },
  { path: '/employees', label: 'Nhân viên', icon: 'employees', roles: ['head', 'admin'] },
  { path: '/equipment', label: 'Thiết bị', icon: 'equipment', roles: ['head', 'admin'] },
  { path: '/licenses', label: 'License Keys', icon: 'licenses', roles: ['head', 'admin'] },
  { path: '/tickets', label: 'Tickets', icon: 'tickets', roles: ['user', 'head', 'admin'] },
  { path: '/approvals', label: 'Phê duyệt', icon: 'approvals', roles: ['user', 'head', 'admin'] },
  { path: '/workflows', label: 'Quy trình', icon: 'workflows', roles: ['head', 'admin'] },
  { path: '/bookings', label: 'Lịch(Booking)', icon: 'bookings', roles: ['user', 'head', 'admin'] },
  { path: '/nghiphep', label: 'Nghỉ phép', icon: 'nghiphep', roles: ['user', 'head', 'admin'] },
  { path: '/documents', label: 'Tài liệu', icon: 'documents', roles: ['user', 'head', 'admin'] },
  { path: '/tools/drawio', label: 'Vẽ sơ đồ (Draw.io)', icon: 'drawioTools', roles: ['user', 'head', 'admin'] },
  { path: '/salary-slip', label: 'Phiếu lương', icon: 'salary', roles: ['user', 'head', 'admin'] },
  { path: '/salary-slip-admin', label: 'Quản lý lương', icon: 'salaryAdmin', roles: ['head', 'admin'] },
  { path: '/permissions', label: 'Phân quyền', icon: 'permissions', roles: ['admin'] },
  { path: '/monitor', label: 'Giám sát', icon: 'monitor', roles: ['admin'] },
  { path: '/help', label: 'Trợ giúp', icon: 'help', roles: ['user', 'head', 'admin'] },
]

const MODULE_MAP = {
  '/': 'dashboard',
  '/todos': 'todos',
  '/chat': 'chat',
  '/employees': 'employees',
  '/equipment': 'equipment',
  '/licenses': 'licenses',
  '/tickets': 'tickets',
  '/approvals': 'approvals',
  '/workflows': 'workflows',
  '/bookings': 'bookings',
  '/nghiphep': 'nghiphep',
  '/documents': 'documents',
  '/salary-slip': 'salary',
  '/salary-slip-admin': 'salary-admin',
  '/permissions': 'permissions',
  '/monitor': 'monitor',
  '/help': 'help',
}

export default function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [showUserPopup, setShowUserPopup] = useState(false)
  
  // States cho Topbar Auto-hide
  const [isTopbarVisible, setIsTopbarVisible] = useState(true)
  const [isTourActive, setIsTourActive] = useState(() => !localStorage.getItem('has_seen_welcome_tour'))

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
  const [profileData, setProfileData] = useState(null)
  
  const navigate = useNavigate()
  const userCode = sessionStorage.getItem('user_code')
  const userRole = sessionStorage.getItem('user_role')
  const userDepartment = sessionStorage.getItem('user_department')

  const [userName, setUserName] = useState(
    sessionStorage.getItem('user_name') || sessionStorage.getItem('full_name') || userCode || 'Nhân viên'
  )

  // ─── LOGIC AUTO HIDE TOPBAR BẰNG TỌA ĐỘ CHUỘT ─────────────────
  useEffect(() => {
    let hideTimer

    const handleMouseMove = (e) => {
      if (isTourActive || isSidebarOpen || showUserPopup) {
        setIsTopbarVisible(true)
        clearTimeout(hideTimer)
        return
      }

      if (e.clientY <= 60) {
        setIsTopbarVisible(true)
        clearTimeout(hideTimer)
      } else {
        clearTimeout(hideTimer)
        hideTimer = setTimeout(() => {
          setIsTopbarVisible(false)
        }, 2500)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)

    hideTimer = setTimeout(() => {
      if (!isTourActive && !isSidebarOpen && !showUserPopup) {
        setIsTopbarVisible(false)
      }
    }, 3000)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      clearTimeout(hideTimer)
    }
  }, [isTourActive, isSidebarOpen, showUserPopup])

  useEffect(() => {
    const handleProfileUpdate = () => {
      const updatedName = sessionStorage.getItem('user_name') || sessionStorage.getItem('full_name') || userCode || 'Nhân viên'
      setUserName(updatedName)
    }
    window.addEventListener('profileUpdated', handleProfileUpdate)
    return () => window.removeEventListener('profileUpdated', handleProfileUpdate)
  }, [userCode])

  // Lấy phân quyền động từ Backend — tất cả user kể cả admin
  useEffect(() => {
    const stored = sessionStorage.getItem('user_permissions')
    if (stored) {
      try { setUserPerms(JSON.parse(stored)) } catch (_) {}
    }
    fetch(apiUrl(`/auth/permissions?employee_code=${userCode}`))
      .then(r => r.json())
      .then(d => {
        const perms = d.data || {}
        setUserPerms(perms)
        sessionStorage.setItem('user_permissions', JSON.stringify(perms))
      })
      .catch(() => { /* keep existing value */ })
  }, [userCode])

  // Tour hướng dẫn
  useEffect(() => {
    if (!isTourActive) return

    let welcomeDriver = null
    let sidebarDriver = null
    let dismissTimer = null

    const handleTourFinish = () => {
      localStorage.setItem('has_seen_welcome_tour', 'true')
      setIsTourActive(false) 
    }

    const startSidebarTour = () => {
      setIsSidebarOpen(true)

      setTimeout(() => {
        const salaryEl = document.querySelector('[data-tour="salary"]')
        if (!salaryEl) {
          handleTourFinish()
          navigate('/salary-slip')
          return
        }

        sidebarDriver = driver({
          animate: true,
          popoverClass: 'tour-popover',
          steps: [{
            element: '[data-tour="salary"]',
            popover: {
              title: 'Phiếu lương',
              description: 'Nhấn "Xem ngay" để đến trang Phiếu lương và nhập mật khẩu.',
              side: 'right',
              showButtons: ['close'],
              doneBtnText: 'Xem ngay',
            },
          }],
          onDoneClick: () => {
            sidebarDriver.destroy()
            handleTourFinish()
            navigate('/salary-slip')
          },
          onDestroyed: handleTourFinish,
        })
        sidebarDriver.drive()
      }, 400)
    }

    const showTimer = setTimeout(() => {
      welcomeDriver = driver({
        animate: true,
        popoverClass: 'tour-popover',
        steps: [{
          element: '.bk-topbar',
          popover: {
            title: 'Chào mừng bạn đến với GOLDENFARM ICT!',
            description: 'Hệ thống quản lý tập trung dành cho doanh nghiệp.',
            doneBtnText: 'Bắt đầu',
            showButtons: ['next'],
            side: 'bottom',
            align: 'center',
          },
        }],
        onDoneClick: () => {
          clearTimeout(dismissTimer)
          if (welcomeDriver) welcomeDriver.destroy()
          startSidebarTour()
        },
        onDestroyed: handleTourFinish,
      })
      welcomeDriver.drive()

      dismissTimer = setTimeout(() => {
        if (welcomeDriver && welcomeDriver.isActive()) {
          welcomeDriver.destroy()
          startSidebarTour()
        }
      }, 5000)
    }, 500)

    return () => {
      clearTimeout(showTimer)
      clearTimeout(dismissTimer)
      if (welcomeDriver && welcomeDriver.isActive()) welcomeDriver.destroy()
      if (sidebarDriver && sidebarDriver.isActive()) sidebarDriver.destroy()
    }
  }, [navigate, userRole, isTourActive])

  // ─── HÀM KIỂM TRA QUYỀN TRUY CẬP MODULE CHUẨN RBAC ──────────────────
  function hasModuleAccess(path) {
    if (path === '/' || path === '/help' || path === '/chat') return true
    if (userRole === 'admin') return true
    if (path === '/permissions') return false

    const moduleKey = MODULE_MAP[path]
    if (!moduleKey) return false

    // 1. Dùng runtime state (từ API fetch hoặc sessionStorage)
    const perms = userPerms !== null ? userPerms : (() => {
      try { return JSON.parse(sessionStorage.getItem('user_permissions') || 'null') } catch { return null }
    })()

    if (perms && typeof perms === 'object') {
      if (perms[moduleKey] !== undefined) return !!perms[moduleKey].can_view
      // Được cấp module "Reset mật khẩu" → cho vào trang Nhân viên
      // (chế độ giới hạn: chỉ xem danh sách + nút reset mật khẩu)
      if (path === '/employees') {
        const pr = perms['password-reset']
        if (pr && (pr.can_view || pr.can_edit)) return true
      }
      return false
    }

    // 2. Fallback static role config (chờ API load lần đầu)
    const navItem = allNavItems.find(i => i.path === path)
    return navItem?.roles?.includes(userRole) ?? false
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
    if (!showUserPopup) {
      getProfile(userCode).then(r => {
        const d = r.data?.data
        if (d) {
          setProfileData(d)
          setUserName(d.full_name || userName)
          sessionStorage.setItem('user_name', d.full_name || '')
        }
      }).catch(() => {})
    }
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
    <div className={`layout ${!isTopbarVisible ? 'topbar-hidden' : ''}`}>
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

        .bk-topbar-trigger {
          position: fixed; top: 0; left: 0; width: 100%; height: 15px;
          z-index: 101; 
        }

        .bk-topbar {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          position: fixed; top: 0; left: 0; width: 100%; z-index: 102;
          height: 52px; padding: 0 0.75rem;
          background: var(--bk-primary); color: var(--bk-on-primary);
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          transition: background-color 0.35s ease, box-shadow 0.35s ease;
        }

        .bk-topbar-left { display: flex; justify-content: flex-start; }
        .bk-topbar-center { display: flex; justify-content: center; transition: all 0.3s ease; }
        .bk-topbar-right { display: flex; justify-content: flex-end; transition: all 0.3s ease; }

        .layout.topbar-hidden .bk-topbar {
          background-color: transparent;
          box-shadow: none;
          pointer-events: none; 
        }

        .layout.topbar-hidden .bk-topbar-center,
        .layout.topbar-hidden .bk-topbar-right .user-btn {
          opacity: 0;
          visibility: hidden;
          transform: translateY(-20px);
        }

        .layout.topbar-hidden .bk-topbar-btn.menu-btn {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
          pointer-events: auto;
          background-color: var(--bk-primary);
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
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

        .bk-topbar-logo {
          height: 34px;
          width: auto;
          display: block;
          object-fit: contain;
        }

        .bk-sidebar-overlay {
          position: fixed; inset: 0; z-index: 90;
          background: rgba(15, 23, 42, 0.4);
          opacity: 0; visibility: hidden;
          transition: opacity 0.3s ease, visibility 0.3s ease;
        }
        .bk-sidebar-overlay.open { opacity: 1; visibility: visible; }

        .bk-sidebar {
          position: fixed; left: 0; right: auto; z-index: 100;
          width: auto; min-width: 0; max-width: 320px; 
          top: 52px; height: calc(100vh - 52px);
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
          padding: 0.75rem 1.25rem 0.5rem; margin-top: 0.5rem;
          border-top: 1px solid var(--bk-primary-light);
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
        .logout-btn:hover { background: var(--bk-primary-light); color: var(--bk-on-primary); border-color: var(--bk-primary-light); }

        .main-content { 
          flex: 1; 
          padding: 1.5rem; 
          width: 100%; 
          margin-top: 52px; 
          min-height: calc(100vh - 52px);
          transition: margin-top 0.35s cubic-bezier(0.4, 0, 0.2, 1), min-height 0.35s ease;
        }
        .layout.topbar-hidden .main-content {
          margin-top: 0;
          min-height: 100vh;
        }

        @media (max-width: 1024px) {
          .main-content { padding: 1rem; }
        }
        @media (max-width: 768px) {
          .main-content { padding: 0.75rem; }
        }
        @media (max-width: 480px) {
          .main-content { padding: 0.5rem; }
        }

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
        .user-popup-info { margin-bottom: 1rem; }
        .user-popup-info-row {
          display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;
          padding: 0.5rem 0; border-bottom: 1px dashed #e2e8f0; font-size: 0.82rem;
        }
        .user-popup-info-row:last-child { border-bottom: none; }
        .user-popup-info-row span { color: #64748b; font-weight: 500; flex-shrink: 0; }
        .user-popup-info-row strong { color: #0f172a; font-weight: 600; text-align: right; word-break: break-all; }
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

      {/* Vùng kích hoạt ẩn Topbar */}
      <div className="bk-topbar-trigger" />

      {/* TOPBAR */}
      <header className="bk-topbar">
        <div className="bk-topbar-left">
          <button className="bk-topbar-btn menu-btn" onClick={() => setIsSidebarOpen(true)}>
            <Menu size={20} />
          </button>
        </div>

        <div className="bk-topbar-center">
          <img src={logoSrc} alt="GOLDENFARM ICT" className="bk-topbar-logo" />
        </div>

        <div className="bk-topbar-right">
          <button className="bk-topbar-btn user-btn" onClick={toggleUserPopup}>
            <User size={20} />
          </button>
        </div>
      </header>

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
                data-tour={item.icon}
              >
                {IconComp && <IconComp size={18} />} {item.label}
              </NavLink>
            )
          })}
          <div className="sidebar-footer">
            <div className="user-profile-box" onClick={handleOpenProfile} title="Xem thông tin hồ sơ">
              <User size={16} className="profile-icon" />
              <span className="user-name">{userName}</span>
            </div>
            <button className="logout-btn" onClick={handleLogout}>Đăng xuất</button>
          </div>
        </div>
      </aside>

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
              <h4><User size={14} /> Thông tin cá nhân</h4>

              <div className="user-popup-info">
                <div className="user-popup-info-row">
                  <span>Mã NV</span><strong>{userCode}</strong>
                </div>
                {profileData?.username && (
                  <div className="user-popup-info-row">
                    <span>Tên đăng nhập</span><strong>{profileData.username}</strong>
                  </div>
                )}
                <div className="user-popup-info-row">
                  <span>Vai trò</span>
                  <strong>{userRole === 'admin' ? 'Quản trị viên' : userRole === 'head' ? 'Trưởng phòng' : 'Nhân viên'}</strong>
                </div>
                {profileData?.department && (
                  <div className="user-popup-info-row">
                    <span>Phòng ban</span><strong>{profileData.department}</strong>
                  </div>
                )}
                {profileData?.full_name && (
                  <div className="user-popup-info-row">
                    <span>Họ tên</span><strong>{profileData.full_name}</strong>
                  </div>
                )}
                {profileData?.phone && (
                  <div className="user-popup-info-row">
                    <span>Số điện thoại</span><strong>{profileData.phone}</strong>
                  </div>
                )}
                {profileData?.personal_email && (
                  <div className="user-popup-info-row">
                    <span>Email cá nhân</span><strong>{profileData.personal_email}</strong>
                  </div>
                )}
                {profileData?.email && (
                  <div className="user-popup-info-row">
                    <span>Email công ty</span><strong>{profileData.email}</strong>
                  </div>
                )}
              </div>

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