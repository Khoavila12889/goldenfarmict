import axios from 'axios'

// URL backend được cấu hình lúc build cho Web — đổi nhanh trong frontend/.env (VITE_API_URL).
// - Khi deploy VPS/domain khác: chỉ cần sửa frontend/.env rồi npm run build.
// - Nếu VITE_API_URL bị bỏ trống: web dùng '/api' relative (= origin hiện tại),
//   tiện khi proxy API cùng domain với frontend (VD: https://app.domain.com/api).
// - Trên App Native (APK): người dùng tự nhập server khi login, không phụ thuộc file này.
const BUILTIN_API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

// ─── Cấu hình server động cho APK ─────────────────────────────────
// User nhập IP/tên miền ngay trên màn hình đăng nhập (lưu vào localStorage),
// fallback về URL build sẵn cho web.
function normalizeOrigin(url) {
  let s = (url || '').trim().replace(/\/+$/, '')
  if (s.endsWith('/api')) s = s.slice(0, -4)
  s = s.replace(/\/+$/, '')
  if (s && !/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    s = 'https://' + s
  }
  return s
}

export function isNativeApp() {
  try {
    return !!((window.Capacitor?.isNativePlatform?.() && window.Capacitor.isNativePlatform()) || window.Capacitor || window.cordova)
  } catch { return false }
}

export function getServerOrigin() {
  // App native (APK): dùng server do người dùng nhập lúc login (localStorage).
  // Web: luôn dùng URL build sẵn (VITE_API_URL hoặc '/api' tương đối) — tránh
  // localStorage cũ (server_url cũ) làm mất kết nối mà web không đổi được.
  if (isNativeApp()) {
    const saved = localStorage.getItem('server_url')
    return normalizeOrigin(saved || BUILTIN_API_URL)
  }
  return normalizeOrigin(BUILTIN_API_URL)
}

export function currentServerLabel() {
  return getServerOrigin() || 'mặc định'
}

export function setServerUrl(url) {
  const clean = normalizeOrigin(url)
  if (!clean) return ''
  localStorage.setItem('server_url', clean)
  return clean
}

export function getApiBase() {
  const origin = getServerOrigin()
  return origin ? `${origin}/api` : '/api'
}

// URL đầy đủ đến 1 endpoint của backend (theo server đang cấu hình).
// Idempotent với path đã chứa tiền tố /api (VD: đường dẫn trả về từ backend
// như '/api/forum/pages/x/p-001.webp') — tránh ghép đôi thành '/api/api/...'.
export function apiUrl(path) {
  let p = String(path || '')
  if (!p.startsWith('/')) p = `/${p}`
  if (p === '/api' || p.startsWith('/api/')) return `${getServerOrigin()}${p}`
  return `${getApiBase()}${p}`
}

const api = axios.create({
  baseURL: getApiBase(),
  headers: { 'Content-Type': 'application/json' },
})

// Luôn dùng URL server đang lưu (đổi được lúc login, không cần rebuild APK)
api.interceptors.request.use(config => {
  config.baseURL = getApiBase()
  return config
})

export function apiErrorMessage(err) {
  if (err.response?.data?.message) return err.response.data.message
  if (err.response?.data?.detail) return err.response.data.detail
  if (err.response) return `Lỗi server: ${err.response.status}`
  if (err.code === 'ERR_NETWORK') return 'Không thể kết nối máy chủ. Kiểm tra IP/tên miền và mạng.'
  return err.message || 'Lỗi kết nối đến server'
}


export function login(employee_code, password) {
  return api.post('/auth/login', { employee_code, password })
}

export function changePassword(employee_code, old_password, new_password) {
  return api.post('/auth/change-password', { employee_code, old_password, new_password })
}

export function getProfile(employee_code) {
  return api.get('/auth/profile', { params: { employee_code } })
}

export function updateProfile(employee_code, data) {
  return api.put(`/auth/profile?employee_code=${encodeURIComponent(employee_code)}`, data)
}

export function updateUsername(employee_code, username) {
  return api.put(`/auth/profile/username?employee_code=${encodeURIComponent(employee_code)}`, { username })
}

export function getDashboardStats() {
  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || ''
  return api.get('/dashboard/stats', { params: { user_code: userCode, user_role: userRole } })
}

export function getEmployees(keyword = '', department = '', status = '') {
  return api.get('/employees', { params: { keyword, department, status } })
}

export function getEmployee(id) {
  return api.get(`/employees/${id}`)
}

export function getEmployeeByCode(code) {
  return api.get(`/employees/by-code/${code}`)
}

export function getEmployeeEquipment(id) {
  return api.get(`/employees/${id}/equipment`)
}

export function transferEquipment(id, data) {
  return api.put(`/equipment/${id}/transfer`, data)
}

export function getEquipmentList(params = {}) {
  return api.get('/equipment', { params })
}

export function createEquipment(data) {
  return api.post('/equipment', data)
}

export function importEquipment(data) {
  return api.post('/equipment/import', data)
}

export function updateEquipment(id, data) {
  return api.put(`/equipment/${id}`, data)
}

export function revokeEquipment(id) {
  return api.put(`/equipment/${id}/revoke`)
}

export function allocateEquipment(id, data) {
  return api.put(`/equipment/${id}/allocate`, data)
}

export function getEquipmentHistory(id) {
  return api.get(`/equipment/${id}/history`)
}

export function getEquipment(id) {
  return api.get(`/equipment/${id}`)
}

export function getDepartments() {
  return api.get('/employees/departments/list')
}

export function createEmployee(data, admin_code, token, role) {
  return api.post('/employees', data, { params: { admin_code, token, role } })
}

export function updateEmployee(id, data, admin_code, token, role) {
  return api.put(`/employees/${id}`, data, { params: { admin_code, token, role } })
}

export function importEmployees(data, admin_code, token, role) {
  return api.post('/employees/import', data, { params: { admin_code, token, role } })
}

export function deduplicateEmployees(admin_code, token, role) {
  return api.post('/employees/deduplicate', null, { params: { admin_code, token, role } })
}

export function deleteEmployee(id, admin_code, token, role) {
  return api.delete(`/employees/${id}`, { params: { admin_code, token, role } })
}

export function createDepartment(data) {
  return api.post('/departments', data)
}

export function updateDepartment(id, data) {
  return api.put(`/departments/${id}`, data)
}

export function deleteDepartment(id) {
  return api.delete(`/departments/${id}`)
}

export function getTickets(status = 'Tất cả', priority = 'Tất cả', search = '') {
  return api.get('/tickets', { params: { status, priority, search } })
}

export function createTicket(data) {
  return api.post('/tickets', data)
}

export function updateTicket(id, data) {
  return api.put(`/tickets/${id}`, data)
}

export function getTicketQueuePosition(userCode) {
  return api.get('/tickets/queue-position', { params: { user_code: userCode } })
}

export function deleteTicket(id) {
  return api.delete(`/tickets/${id}`)
}

export function getBookings(date = '', resource_type = 'all', status = 'all') {
  return api.get('/bookings', { params: { date, resource_type, status } })
}

export function createBooking(data) {
  return api.post('/bookings', data, { headers: bookingAuthHeaders() })
}

export function finishBooking(id) {
  return api.put(`/bookings/${id}`, { status: 'finished' })
}

export function updateBooking(id, data) {
  return api.put(`/bookings/${id}`, data)
}

export function getResources() {
  return api.get('/bookings/resources')
}

function bookingAuthHeaders() {
  return {
    'X-User-Code': sessionStorage.getItem('user_code') || '',
    'X-User-Role': sessionStorage.getItem('user_role') || '',
    'X-User-Dept': sessionStorage.getItem('user_department') || '',
    'X-User-Token': sessionStorage.getItem('token') || '',
  }
}

export function createResource(data) {
  return api.post('/bookings/resources', data, { headers: bookingAuthHeaders() })
}

export function deleteResource(id) {
  return api.delete(`/bookings/resources/${id}`, { headers: bookingAuthHeaders() })
}

export function getBookingDates() {
  return api.get('/bookings/dates')
}

export function checkOverlap(resource_id, date, start_time, end_time) {
  return api.get('/bookings/overlap', { params: { resource_id, date, start_time, end_time } })
}

// Licenses
export function getLicenses(search = '') {
  return api.get('/licenses', { params: { search } })
}

export function getLicenseStats() {
  return api.get('/licenses/stats')
}

export function createLicense(data) {
  return api.post('/licenses', data)
}

export function deleteLicense(id) {
  return api.delete(`/licenses/${id}`)
}

export function updateLicense(id, data) {
  return api.put(`/licenses/${id}`, data)
}

export function bulkImportLicenses(equipment_id, keys, product_name, employee_id = null) {
  return api.post('/licenses/bulk', { equipment_id, keys, product_name, employee_id })
}

export function scanLicenses() {
  return api.post('/licenses/scan')
}

export function importLicenses(data) {
  return api.post('/licenses/import', data)
}

// License Categories & Items
export function getLicenseCategories() {
  return api.get('/licenses/categories')
}

export function createLicenseCategory(data) {
  return api.post('/licenses/categories', data)
}

export function updateLicenseCategory(id, data) {
  return api.put(`/licenses/categories/${id}`, data)
}

export function deleteLicenseCategory(id) {
  return api.delete(`/licenses/categories/${id}`)
}

export function getLicenseItems(catId, search = '') {
  return api.get(`/licenses/categories/${catId}/items`, { params: { search } })
}

export function createLicenseItem(catId, data) {
  return api.post(`/licenses/categories/${catId}/items`, data)
}

export function updateLicenseItem(id, data) {
  return api.put(`/licenses/items/${id}`, data)
}

export function deleteLicenseItem(id) {
  return api.delete(`/licenses/items/${id}`)
}

export function uploadLicenseContract(itemId, file) {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(`/licenses/items/${itemId}/upload`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

// ─── Approvals ──────────────────────────────────────────────────

export function getWorkflows(active = true) {
  return api.get('/workflows', { params: { active } })
}

export function createWorkflow(data) {
  return api.post('/workflows', data)
}

export function getWorkflow(id) {
  return api.get(`/workflows/${id}`)
}

export function updateWorkflow(id, data) {
  return api.put(`/workflows/${id}`, data)
}

export function deleteWorkflow(id) {
  return api.delete(`/workflows/${id}`)
}

export function addWorkflowStep(wfId, data) {
  return api.post(`/workflows/${wfId}/steps`, data)
}

export function updateWorkflowStep(stepId, data) {
  return api.put(`/workflows/steps/${stepId}`, data)
}

export function deleteWorkflowStep(stepId) {
  return api.delete(`/workflows/steps/${stepId}`)
}

export function createApprovalRequest(data) {
  return api.post('/requests', data)
}

export function listApprovalRequests(params = {}) {
  return api.get('/requests', { params })
}

export function getApprovalRequest(id) {
  return api.get(`/requests/${id}`)
}

export function updateApprovalRequest(id, data) {
  return api.put(`/requests/${id}`, data)
}

export function submitApprovalRequest(id) {
  return api.put(`/requests/${id}/submit`)
}

export function cancelApprovalRequest(id) {
  return api.put(`/requests/${id}/cancel`)
}

export function approveRequest(id, data) {
  return api.put(`/requests/${id}/approve`, data)
}

export function rejectRequest(id, data) {
  return api.put(`/requests/${id}/reject`, data)
}

export function getPendingApprovals(userCode) {
  return api.get('/requests/pending', { params: { user_code: userCode } })
}

// ─── Business Trips ──────────────────────────────────────────────

export function getBusinessTrips(params = {}) {
  // Thêm thông tin user để backend kiểm tra phân quyền
  const userRole = sessionStorage.getItem('user_role') || 'user'
  const userCode = sessionStorage.getItem('user_code') || ''
  const userDept = sessionStorage.getItem('user_department') || ''
  
  return api.get('/business-trips', { 
    params: { 
      ...params, 
      user_code: userCode,
      user_role: userRole,
      user_dept: userDept
    } 
  })
}

export function createBusinessTrip(data) {
  return api.post('/business-trips', data)
}

export function updateBusinessTrip(id, data) {
  // Thêm thông tin user để backend kiểm tra quyền
  const userRole = sessionStorage.getItem('user_role') || 'user'
  const userCode = sessionStorage.getItem('user_code') || ''
  
  return api.put(`/business-trips/${id}`, {
    ...data,
    user_code: userCode,
    user_role: userRole
  })
}

export function deleteBusinessTrip(id) {
  // Thêm thông tin user để backend kiểm tra quyền
  const userRole = sessionStorage.getItem('user_role') || 'user'
  const userCode = sessionStorage.getItem('user_code') || ''
  
  return api.delete(`/business-trips/${id}`, {
    params: {
      user_code: userCode,
      user_role: userRole
    }
  })
}

export function getTodos(params = {}) {
  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || ''
  const userDept = sessionStorage.getItem('user_department') || ''
  const userToken = sessionStorage.getItem('token') || ''
  return api.get('/todos', {
    params,
    headers: {
      'X-User-Code': userCode,
      'X-User-Role': userRole,
      'X-User-Dept': userDept,
      'X-User-Token': userToken
    }
  })
}

export function getTodoStats() {
  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || ''
  const userDept = sessionStorage.getItem('user_department') || ''
  const userToken = sessionStorage.getItem('token') || ''
  return api.get('/todos/stats', {
    headers: {
      'X-User-Code': userCode,
      'X-User-Role': userRole,
      'X-User-Dept': userDept,
      'X-User-Token': userToken
    }
  })
}

export function createTodo(data) {
  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || ''
  const userDept = sessionStorage.getItem('user_department') || ''
  const userToken = sessionStorage.getItem('token') || ''
  return api.post('/todos', data, {
    headers: {
      'X-User-Code': userCode,
      'X-User-Role': userRole,
      'X-User-Dept': userDept,
      'X-User-Token': userToken
    }
  })
}

export function updateTodo(id, data) {
  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || ''
  const userToken = sessionStorage.getItem('token') || ''
  return api.put(`/todos/${id}`, data, {
    headers: {
      'X-User-Code': userCode,
      'X-User-Role': userRole,
      'X-User-Token': userToken
    }
  })
}

export function updateTodoStatus(id, status) {
  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || ''
  const userDept = sessionStorage.getItem('user_department') || ''
  const userToken = sessionStorage.getItem('token') || ''
  return api.patch(`/todos/${id}/status`, { status }, {
    headers: {
      'X-User-Code': userCode,
      'X-User-Role': userRole,
      'X-User-Dept': userDept,
      'X-User-Token': userToken
    }
  })
}

export function approveTodo(id) {
  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || ''
  const userDept = sessionStorage.getItem('user_department') || ''
  const userToken = sessionStorage.getItem('token') || ''
  return api.patch(`/todos/${id}/approve`, {}, {
    headers: {
      'X-User-Code': userCode,
      'X-User-Role': userRole,
      'X-User-Dept': userDept,
      'X-User-Token': userToken
    }
  })
}

export function getTodoAssignees() {
  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || ''
  const userDept = sessionStorage.getItem('user_department') || ''
  const userToken = sessionStorage.getItem('token') || ''
  return api.get('/todos/assignees', {
    headers: {
      'X-User-Code': userCode,
      'X-User-Role': userRole,
      'X-User-Dept': userDept,
      'X-User-Token': userToken
    }
  })
}

export function deleteTodo(id) {
  const userCode = sessionStorage.getItem('user_code') || ''
  const userRole = sessionStorage.getItem('user_role') || ''
  const userToken = sessionStorage.getItem('token') || ''
  return api.delete(`/todos/${id}`, {
    headers: {
      'X-User-Code': userCode,
      'X-User-Role': userRole,
      'X-User-Token': userToken
    }
  })
}

function todoAuthHeaders() {
  return {
    'X-User-Code': sessionStorage.getItem('user_code') || '',
    'X-User-Role': sessionStorage.getItem('user_role') || '',
    'X-User-Dept': sessionStorage.getItem('user_department') || '',
    'X-User-Token': sessionStorage.getItem('token') || ''
  }
}

export function getTodoComments(todoId) {
  return api.get(`/todos/${todoId}/comments`, { headers: todoAuthHeaders() })
}

export function addTodoComment(todoId, content) {
  return api.post(`/todos/${todoId}/comments`, { content }, { headers: todoAuthHeaders() })
}

export function getTodoAttachments(todoId) {
  return api.get(`/todos/${todoId}/attachments`, { headers: todoAuthHeaders() })
}

export function uploadTodoAttachment(todoId, file) {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(`/todos/${todoId}/attachments`, fd, {
    headers: { ...todoAuthHeaders(), 'Content-Type': 'multipart/form-data' }
  })
}

export function addTodoUrl(todoId, url, title = '') {
  return api.post(`/todos/${todoId}/links`, { url, title }, { headers: todoAuthHeaders() })
}

export function deleteTodoAttachment(attachmentId) {
  return api.delete(`/attachments/${attachmentId}`, { headers: todoAuthHeaders() })
}

// ─── Documents / Storage ──────────────────────────────────────
export function getStorageConfigs(userCode = '', userRole = '') {
  return api.get('/documents/config', {
    params: { user_code: userCode, user_role: userRole }
  })
}
function docAuthParams() {
  const adminCode = sessionStorage.getItem('user_code') || ''
  const token = sessionStorage.getItem('token') || ''
  const role = sessionStorage.getItem('user_role') || ''
  return { admin_code: adminCode, token, role }
}

export function getStorageConfig(id) {
  return api.get(`/documents/config/${id}`, { params: docAuthParams() })
}
export function exportStorageConfig(id) {
  return api.get(`/documents/config/${id}/export`, { params: docAuthParams() })
}
export function createStorageConfig(data) {
  return api.post('/documents/config', data, { params: docAuthParams() })
}
export function updateStorageConfig(id, data) {
  return api.put(`/documents/config/${id}`, data, { params: docAuthParams() })
}
export function deleteStorageConfig(id) {
  return api.delete(`/documents/config/${id}`, { params: docAuthParams() })
}
export function testStorageConnection(id) {
  return api.post(`/documents/config/${id}/test`, {}, { params: docAuthParams() })
}
export function testStorageConnectionDirect(data) {
  return api.post('/documents/test-connection', data, { params: docAuthParams() })
}
export function browseStorage(id, path = '/', userCode = '', userRole = 'user') {
  return api.get(`/documents/browse/${id}`, {
    params: { path, user_code: userCode, user_role: userRole }
  })
}
export function getStoragePermissions(id) {
  return api.get(`/documents/permissions/${id}`, { params: docAuthParams() })
}
export function createStoragePermission(data) {
  return api.post('/documents/permissions', data, { params: docAuthParams() })
}
export function deleteStoragePermission(id) {
  return api.delete(`/documents/permissions/${id}`, { params: docAuthParams() })
}
export function getStorageDepartments() {
  return api.get('/documents/departments')
}

export function getOnlyOfficeConfig(configId, filePath, userCode, userRole, fileId = '') {
  return api.get('/documents/onlyoffice/config', {
    params: { config_id: configId, file_path: filePath, file_id: fileId, user_code: userCode, user_role: userRole }
  })
}

// ─── Draw.io (Diagrams.net) ───────────────────────────────────
export function loadDrawioFile(configId, filePath, userCode, userRole) {
  return api.get('/documents/drawio/load', {
    params: { config_id: configId, file_path: filePath, user_code: userCode, user_role: userRole },
    responseType: 'text',
  })
}

export function saveDrawioFile(configId, filePath, xml, userCode, userRole) {
  return api.put('/documents/drawio/save', { xml }, {
    params: { config_id: configId, file_path: filePath, user_code: userCode, user_role: userRole },
  })
}

// ─── Document Sharing ───────────────────────────────────────────
function shareAuthParams() {
  const userCode = sessionStorage.getItem('user_code') || ''
  const token = sessionStorage.getItem('token') || ''
  const role = sessionStorage.getItem('user_role') || 'user'
  return { user_code: userCode, token, user_role: role }
}

export function getDocumentShares(configId, filePath) {
  return api.get('/documents/shares', {
    params: { config_id: configId, file_path: filePath, ...shareAuthParams() }
  })
}

export function createDocumentShare(data) {
  return api.post('/documents/shares', data, { params: shareAuthParams() })
}

export function deleteDocumentShare(id) {
  return api.delete(`/documents/shares/${id}`, { params: shareAuthParams() })
}

export function getShareInfo(token) {
  return api.get(`/shares/${token}/info`, { params: shareAuthParams() })
}

export function getShareContents(token, path = '') {
  return api.get(`/shares/${token}/contents`, {
    params: { path, ...shareAuthParams() }
  })
}

export function getShareOnlyOfficeConfig(token, file = {}) {
  return api.get(`/shares/${token}/onlyoffice/config`, {
    params: {
      ...(file.file_path ? { file_path: file.file_path } : {}),
      ...(file.file_id ? { file_id: file.file_id } : {}),
      ...(file.file_name ? { file_name: file.file_name } : {}),
      ...shareAuthParams(),
    }
  })
}

export function getShareDownloadUrl(token, filePath = '', fileId = '', disposition = 'inline') {
  const userCode = sessionStorage.getItem('user_code') || ''
  const userToken = sessionStorage.getItem('token') || ''
  const role = sessionStorage.getItem('user_role') || 'user'
  const auth = `user_code=${encodeURIComponent(userCode)}&user_role=${encodeURIComponent(role)}&token=${encodeURIComponent(userToken)}`
  let url = `${getApiBase()}/shares/${token}/download?${auth}`
  if (filePath) url += `&file_path=${encodeURIComponent(filePath)}`
  if (fileId) url += `&file_id=${encodeURIComponent(fileId)}`
  if (disposition === 'attachment') url += '&disposition=attachment'
  return url
}

export function getShareArchiveUrl(token, path = '') {
  const userCode = sessionStorage.getItem('user_code') || ''
  const userToken = sessionStorage.getItem('token') || ''
  const role = sessionStorage.getItem('user_role') || 'user'
  const auth = `user_code=${encodeURIComponent(userCode)}&user_role=${encodeURIComponent(role)}&token=${encodeURIComponent(userToken)}`
  let url = `${getApiBase()}/shares/${token}/archive?${auth}`
  if (path) url += `&path=${encodeURIComponent(path)}`
  return url
}

// ─── Auth / Password Reset ──────────────────────────────────────
export function forgotPassword(employee_code) {
  return api.post('/auth/forgot-password', { employee_code })
}

export function verifyReset(employee_code, personal_email, new_password) {
  return api.post('/auth/verify-reset', { employee_code, personal_email, new_password })
}

export function adminResetPassword(admin_code, admin_token, target_code, new_password) {
  return api.post('/auth/admin-reset-password', { admin_code, admin_token, target_code, new_password })
}

// ─── Software Categories & Items (Refactored Module) ───────────
export function getSoftwareCategories() {
  return api.get('/software/categories')
}

export function createSoftwareCategory(data) {
  return api.post('/software/categories', data)
}

export function updateSoftwareCategory(id, data) {
  return api.put(`/software/categories/${id}`, data)
}

export function deleteSoftwareCategory(id) {
  return api.delete(`/software/categories/${id}`)
}

export function getSoftwareItems(catId, search = '') {
  return api.get(`/software/categories/${catId}/items`, { params: { search } })
}

export function createSoftwareItem(catId, data) {
  return api.post(`/software/categories/${catId}/items`, data)
}

export function updateSoftwareItem(id, data) {
  return api.put(`/software/items/${id}`, data)
}

export function deleteSoftwareItem(id) {
  return api.delete(`/software/items/${id}`)
}

export function uploadSoftwareContract(itemId, file) {
  const fd = new FormData()
  fd.append('file', file)
  return api.post(`/software/items/${itemId}/upload`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

// ─── Salary Slip Admin ─────────────────────────────────────────
export function getSalaryEmployees(month, department, search, admin_code, token, role) {
  return api.get('/salary-slips/admin/with-salary', {
    params: { month, department, search, admin_code, token, role }
  })
}

export function searchAllEmployees(department, search, admin_code, token, role) {
  return api.get('/salary-slips/admin/employees', {
    params: { department, search, admin_code, token, role }
  })
}

export function getSalaryView(employee_code, month, admin_code, token, role) {
  return api.get(`/salary-slips/admin/view/${employee_code}`, {
    params: { month, admin_code, token, role }
  })
}

export function updateSalaryFields(employee_code, month, fields, admin_code, token, role) {
  return api.put('/salary-slips/admin/update-fields', {
    employee_code, month, fields
  }, {
    params: { admin_code, token, role }
  })
}

export function exportSalaryPdf(employee_code, month, password, admin_code, token, role, fields) {
  return api.post('/salary-slips/admin/export-pdf', {
    employee_code, month, password, fields
  }, {
    params: { admin_code, token, role },
    responseType: 'blob'
  })
}

export function batchExportSalaryPdf(month, department, admin_code, token, role) {
  return api.post('/salary-slips/admin/batch-export-pdf', {
    month, department
  }, {
    params: { admin_code, token, role },
    responseType: 'blob'
  })
}

export function downloadSalaryTemplate() {
  return api.get('/salary-slips/admin/download-template', {
    responseType: 'blob',
  })
}

export function uploadSalaryExcel(file, month, admin_code, token, role, force = false, payment_date = '') {
  const fd = new FormData()
  fd.append('excel_file', file)
  const params = { admin_code, token, role, month, payment_date }
  if (force) params.force = 'true'
  return api.post('/salary-slips/admin/upload-salaries', fd, {
    params,
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function getSalaryUploadHistory(admin_code, token, role) {
  return api.get('/salary-slips/admin/upload-history', {
    params: { admin_code, token, role }
  })
}

export function getSalaryUploadFileUrl(logId, admin_code, token, role) {
  const base = getApiBase()
  const params = new URLSearchParams({ admin_code, token, role })
  return `${base}/salary-slips/admin/download-upload/${logId}?${params}`
}

export function deleteSalarySlip(employee_code, month, admin_code, token, role) {
  return api.delete(`/salary-slips/admin/${employee_code}`, {
    params: { month, admin_code, token, role }
  })
}

// ─── Salary Slip Employee ───────────────────────────────────────
export function verifySalaryView(employee_code, month, password, token, role) {
  return api.post('/salary/verify-and-view', {
    employee_code, month, password, token, role
  })
}

export function getAvailableMonths(employee_code, token, role) {
  return api.get('/salary/available-months', {
    params: { employee_code, token, role }
  })
}

export function downloadSalaryPdf(employee_code, month, password, token, role) {
  return api.post('/salary/export-pdf', {
    employee_code, month, password, token, role
  }, { responseType: 'blob' })
}

// ─── Permissions ─────────────────────────────────────────────────
export function getUsers(adminCode, token, role) {
  return api.get('/auth/users', { params: { admin_code: adminCode, token, role } })
}
export function searchUsers(q, dept, adminCode, token, role) {
  return api.get('/auth/users/search', { params: { q, department: dept, admin_code: adminCode, token, role } })
}
export function getUserPermissions(targetCode, adminCode, token, role) {
  return api.get(`/auth/permissions/${targetCode}`, { params: { admin_code: adminCode, token, role } })
}
export function updateUserPermissions(targetCode, perms, adminCode, token, role) {
  return api.put(`/auth/permissions/${targetCode}`, perms, { params: { admin_code: adminCode, token, role } })
}
export function updateUserRole(targetCode, newRole, adminCode, token, role) {
  return api.put(`/auth/role/${targetCode}`, { role: newRole }, { params: { admin_code: adminCode, token, role } })
}
export function getPermissionModules() {
  return api.get('/auth/permissions/modules')
}
// ─── Document Permissions ────────────────────────────────────────
export function createDepartmentPermission(data, adminCode, token, role) {
  return api.post('/documents/permissions/department', data, { params: { admin_code: adminCode, token, role } })
}

// ─── Chat Nội bộ ─────────────────────────────────────────────────
function chatAuthHeaders() {
  return {
    'X-User-Code': sessionStorage.getItem('user_code') || '',
    'X-User-Role': sessionStorage.getItem('user_role') || '',
    'X-User-Dept': sessionStorage.getItem('user_department') || '',
    'X-User-Token': sessionStorage.getItem('token') || '',
  }
}

export function getChatRooms() {
  return api.get('/chat/rooms', { headers: chatAuthHeaders() })
}

export function getChatMessages(roomId, limit = 50, offset = 0) {
  return api.get(`/chat/messages/${roomId}`, {
    params: { limit, offset },
    headers: chatAuthHeaders(),
  })
}

export function createChatRoom(data) {
  return api.post('/chat/rooms', data, { headers: chatAuthHeaders() })
}

export function uploadChatFile(file) {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/chat/upload', fd, {
    headers: { ...chatAuthHeaders(), 'Content-Type': 'multipart/form-data' },
  })
}

export function getChatContacts(q = '') {
  return api.get('/chat/contacts', { params: { q }, headers: chatAuthHeaders() })
}

export function getChatOnline() {
  return api.get('/chat/online', { headers: chatAuthHeaders() })
}

export function getChatRoomMembers(roomId) {
  return api.get(`/chat/rooms/${roomId}/members`, { headers: chatAuthHeaders() })
}

export function renameChatRoom(roomId, name) {
  return api.put(`/chat/rooms/${roomId}`, { name }, { headers: chatAuthHeaders() })
}

export function deleteChatRoom(roomId) {
  return api.delete(`/chat/rooms/${roomId}`, { headers: chatAuthHeaders() })
}

export function addChatRoomMembers(roomId, employeeCodes) {
  return api.post(`/chat/rooms/${roomId}/members`, { employee_codes: employeeCodes }, { headers: chatAuthHeaders() })
}

export function removeChatRoomMember(roomId, employeeCode) {
  return api.delete(`/chat/rooms/${roomId}/members/${encodeURIComponent(employeeCode)}`, { headers: chatAuthHeaders() })
}

export function getChatPinnedMessages(roomId) {
  return api.get(`/chat/rooms/${roomId}/pinned`, { headers: chatAuthHeaders() })
}

export function pinChatMessage(messageId) {
  return api.put(`/chat/messages/${messageId}/pin`, {}, { headers: chatAuthHeaders() })
}

export function unpinChatMessage(messageId) {
  return api.delete(`/chat/messages/${messageId}/pin`, { headers: chatAuthHeaders() })
}

export function chatWebSocketUrl() {
  const code = sessionStorage.getItem('user_code') || ''
  const token = sessionStorage.getItem('token') || ''
  const origin = getServerOrigin()
  // origin luôn dạng http(s)://host[:port] (đã được normalize bỏ '/api' + trailing slash).
  const originHttps = origin && origin.startsWith('https')
  const pageHttps = window.location.protocol === 'https:'
  const protocol = (originHttps || pageHttps) ? 'wss:' : 'ws:'
  // Lấy host KHÔNG bao gồm scheme — tránh tạo URL sai kiểu 'ws://http://host'.
  const host = origin ? origin.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '') : window.location.host
  return `${protocol}//${host}/api/chat/ws?token=${encodeURIComponent(token)}&employee_code=${encodeURIComponent(code)}`
}

// ─── Forum — Thông báo nội bộ (forum-like) ──────────────────────────
function forumAuthHeaders() {
  return {
    'X-User-Code': sessionStorage.getItem('user_code') || '',
    'X-User-Role': sessionStorage.getItem('user_role') || '',
    'X-User-Dept': sessionStorage.getItem('user_department') || '',
    'X-User-Token': sessionStorage.getItem('token') || '',
  }
}

export function getForumPosts() {
  return api.get('/forum/posts', { headers: forumAuthHeaders() })
}

export function createForumPost(data) {
  return api.post('/forum/posts', data, { headers: forumAuthHeaders() })
}

export function updateForumPost(id, data) {
  return api.put(`/forum/posts/${id}`, data, { headers: forumAuthHeaders() })
}

export function deleteForumPost(id) {
  return api.delete(`/forum/posts/${id}`, { headers: forumAuthHeaders() })
}

export function getForumReplies(postId) {
  return api.get(`/forum/posts/${postId}/replies`, { headers: forumAuthHeaders() })
}

export function getForumOnlyOfficeConfig(postId) {
  return api.get(`/forum/posts/${postId}/onlyoffice/config`, { headers: forumAuthHeaders() })
}

export function createForumReply(postId, content) {
  return api.post(`/forum/posts/${postId}/replies`, { content }, { headers: forumAuthHeaders() })
}

export function uploadForumFile(file) {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/forum/upload', fd, {
    headers: { ...forumAuthHeaders(), 'Content-Type': 'multipart/form-data' },
  })
}

// PDF đính kèm → danh sách trang ảnh WebP đã convert (xem nhanh thay OnlyOffice)
export function getForumPdfPages(filename) {
  return api.get(`/forum/uploads/${encodeURIComponent(filename)}/pages`, { headers: forumAuthHeaders() })
}

// PDF trong module Tài liệu → trang ảnh WebP (storage FTP/SMB/GDrive)
export function getDocumentPdfPages({ configId, filePath, fileId = '', size = 0, userCode, userRole }) {
  const params = {
    config_id: configId,
    file_path: filePath,
    file_id: fileId,
    size,
    user_code: userCode,
    user_role: userRole,
  }
  return api.get('/documents/pdf-pages', { params })
}

export default api
