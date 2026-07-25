import React, { useState } from 'react'
import { X, Search, BookOpen, CheckSquare, Ticket, Calendar, Users, Monitor, Key, CheckCircle, Folder, Receipt, Shield, User, Briefcase } from 'lucide-react'
import todosMd from '../../docs/HDSD_Todos.md?raw'
import ticketsMd from '../../docs/HDSD_Tickets.md?raw'
import bookingsMd from '../../docs/HDSD_Bookings.md?raw'
import tripsMd from '../../docs/HDSD_BusinessTrips.md?raw'
import approvalsMd from '../../docs/HDSD_Approvals.md?raw'
import employeesMd from '../../docs/HDSD_Employees.md?raw'
import equipmentMd from '../../docs/HDSD_Equipment.md?raw'
import licensesMd from '../../docs/HDSD_Licenses.md?raw'
import documentsMd from '../../docs/HDSD_Documents.md?raw'
import salaryMd from '../../docs/HDSD_SalarySlips.md?raw'
import permissionsMd from '../../docs/HDSD_Permissions.md?raw'
import dashboardMd from '../../docs/HDSD_Dashboard.md?raw'
import profileMd from '../../docs/HDSD_Profile.md?raw'

const GUIDES = [
  { key: 'Todos', icon: CheckSquare, color: '#2563eb', bg: '#eff6ff',
    desc: 'Quản lý công việc & Task Kanban — tạo, phân công, theo dõi tiến độ', content: todosMd },
  { key: 'Tickets', icon: Ticket, color: '#dc2626', bg: '#fef2f2',
    desc: 'Yêu cầu hỗ trợ IT — gửi & theo dõi ticket xử lý', content: ticketsMd },
  { key: 'Bookings', icon: Calendar, color: '#d97706', bg: '#fef3c7',
    desc: 'Đặt lịch xe & phòng họp — đặt trước tài nguyên dùng chung', content: bookingsMd },
  { key: 'BusinessTrips', icon: Briefcase, color: '#7c3aed', bg: '#f5f3ff',
    desc: 'Đăng ký công tác — đăng ký & theo dõi lịch công tác ngoài tỉnh', content: tripsMd },
  { key: 'Approvals', icon: CheckCircle, color: '#059669', bg: '#d1fae5',
    desc: 'Phê duyệt — gửi yêu cầu trình ký theo quy trình động', content: approvalsMd },
  { key: 'Employees', icon: Users, color: '#00468C', bg: '#e8f0fe',
    desc: 'Quản lý nhân viên — danh bạ toàn công ty, thêm/sửa/xóa NV', content: employeesMd },
  { key: 'Equipment', icon: Monitor, color: '#0d9488', bg: '#ccfbf1',
    desc: 'Quản lý thiết bị CNTT — theo dõi vòng đời tài sản', content: equipmentMd },
  { key: 'Licenses', icon: Key, color: '#ca8a04', bg: '#fef9c3',
    desc: 'License & phần mềm — quản lý bản quyền, cảnh báo hết hạn', content: licensesMd },
  { key: 'Documents', icon: Folder, color: '#2563eb', bg: '#eff6ff',
    desc: 'Tài liệu — duyệt & quản lý tệp tin từ File Server dùng chung', content: documentsMd },
  { key: 'SalarySlips', icon: Receipt, color: '#dc2626', bg: '#fef2f2',
    desc: 'Phiếu lương — xem & tải phiếu lương hàng tháng', content: salaryMd },
  { key: 'Permissions', icon: Shield, color: '#7c3aed', bg: '#f5f3ff',
    desc: 'Phân quyền tài liệu — thiết lập quyền truy cập kho lưu trữ', content: permissionsMd },
  { key: 'Profile', icon: User, color: '#2563eb', bg: '#eff6ff',
    desc: 'Hồ sơ cá nhân — xem thông tin, đổi mật khẩu, thiết bị đang mượn', content: profileMd },
  { key: 'Dashboard', icon: BookOpen, color: '#0f172a', bg: '#f1f5f9',
    desc: 'Tổng quan — màn hình chính, xem nhanh ticket & lịch hôm nay', content: dashboardMd },
]

export default function HelpPage() {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  const filtered = GUIDES.filter(g =>
    !search || g.key.toLowerCase().includes(search.toLowerCase()) ||
    g.desc.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.3rem' }}>📖 Hướng dẫn sử dụng</h1>
        <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Chọn module để xem hướng dẫn chi tiết</p>
      </div>

      <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input type="text" placeholder="Tìm kiếm module..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.2rem', borderRadius: 10,
            border: '1px solid #e2e8f0', fontSize: '0.85rem', outline: 'none',
            fontFamily: 'inherit', boxSizing: 'border-box',
          }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.85rem' }}>
        {filtered.map(g => {
          const Icon = g.icon
          return (
            <div key={g.key} onClick={() => setSelected(g)}
              style={{
                background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
                padding: '1rem', cursor: 'pointer', transition: 'all 0.2s ease',
              }}
              onMouseOver={e => e.currentTarget.style.borderColor = g.color}
              onMouseOut={e => e.currentTarget.style.borderColor = '#e2e8f0'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: g.bg, color: g.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={18} />
                </div>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>{g.key}</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', lineHeight: 1.4 }}>{g.desc}</p>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Không tìm thấy module phù hợp.</div>
      )}

      {/* Guide Modal */}
      {selected && (
        <>
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.4)',
            backdropFilter: 'blur(4px)',
          }} onClick={() => setSelected(null)} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 1001, width: '90%', maxWidth: 680, maxHeight: '85vh',
            background: '#fff', borderRadius: 14, display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: selected.bg, color: selected.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <selected.icon size={16} />
                </div>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{selected.key}</span>
              </div>
              <button onClick={() => setSelected(null)}
                style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#64748b' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{
              padding: '1.25rem', overflow: 'auto', whiteSpace: 'pre-wrap',
              fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.6,
              color: '#334155', flex: 1,
            }}>
              {selected.content}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
