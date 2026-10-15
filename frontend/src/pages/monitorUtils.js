export function normalizeOnlineUsers(users) {
  if (users === undefined) return null
  if (!Array.isArray(users)) throw new Error('Danh sách người online không đúng định dạng')

  const uniqueUsers = new Map()
  for (const user of users) {
    if (!user || typeof user !== 'object' || Array.isArray(user)) {
      throw new Error('Phần tử dữ liệu không hợp lệ (online_users)')
    }
    const code = typeof user.employee_code === 'string' ? user.employee_code.trim() : ''
    if (!code) throw new Error('Người online thiếu mã nhân viên')
    const normalizedCode = code.toLocaleLowerCase('vi-VN')
    if (!uniqueUsers.has(normalizedCode)) uniqueUsers.set(normalizedCode, { ...user, employee_code: code })
  }
  return [...uniqueUsers.values()]
}
