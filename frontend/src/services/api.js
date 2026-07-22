import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

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

export function getDashboardStats() {
  return api.get('/dashboard/stats')
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

export function createEmployee(data) {
  return api.post('/employees', data)
}

export function updateEmployee(id, data) {
  return api.put(`/employees/${id}`, data)
}

export function deleteEmployee(id) {
  return api.delete(`/employees/${id}`)
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
  return api.post('/bookings', data)
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

export function createResource(data) {
  return api.post('/bookings/resources', data)
}

export function deleteResource(id) {
  return api.delete(`/bookings/resources/${id}`)
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

export function bulkImportLicenses(equipment_id, keys, product_name) {
  return api.post('/licenses/bulk', { equipment_id, keys, product_name })
}

export function scanLicenses() {
  return api.post('/licenses/scan')
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

// ─── Documents / Storage ──────────────────────────────────────
export function getStorageConfigs(userCode = '', userRole = '') {
  return api.get('/documents/config', {
    params: { user_code: userCode, user_role: userRole }
  })
}
export function getStorageConfig(id) {
  return api.get(`/documents/config/${id}`)
}
export function createStorageConfig(data) {
  return api.post('/documents/config', data)
}
export function updateStorageConfig(id, data) {
  return api.put(`/documents/config/${id}`, data)
}
export function deleteStorageConfig(id) {
  return api.delete(`/documents/config/${id}`)
}
export function testStorageConnection(id) {
  return api.post(`/documents/config/${id}/test`)
}
export function testStorageConnectionDirect(data) {
  return api.post('/documents/test-connection', data)
}
export function browseStorage(id, path = '/', userCode = '', userRole = 'user') {
  return api.get(`/documents/browse/${id}`, {
    params: { path, user_code: userCode, user_role: userRole }
  })
}
export function getStoragePermissions(id) {
  return api.get(`/documents/permissions/${id}`)
}
export function createStoragePermission(data) {
  return api.post('/documents/permissions', data)
}
export function deleteStoragePermission(id) {
  return api.delete(`/documents/permissions/${id}`)
}
export function getStorageDepartments() {
  return api.get('/documents/departments')
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

export function uploadSalaryExcel(file, month, admin_code, token, role, force = false) {
  const fd = new FormData()
  fd.append('excel_file', file)
  const params = { admin_code, token, role, month }
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

export default api
