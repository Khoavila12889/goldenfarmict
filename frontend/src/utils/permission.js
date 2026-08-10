export const PERM_KEYS = ['can_read', 'can_write', 'can_upload', 'can_edit', 'can_delete', 'can_reshare', 'allow_download']

export const PERM_LABELS = {
  can_read: { label: 'Đọc', desc: 'Xem nội dung thư mục và tệp' },
  can_write: { label: 'Tạo/Sửa', desc: 'Tạo tệp/thư mục mới' },
  can_upload: { label: 'Upload', desc: 'Upload file lên thư mục' },
  can_edit: { label: 'Chỉnh sửa', desc: 'Sửa nội dung tệp hiện có' },
  can_delete: { label: 'Xóa', desc: 'Xóa tệp và thư mục' },
  can_reshare: { label: 'Chia sẻ lại', desc: 'Cấp quyền cho người khác' },
}

export const EXTRA_PERMS = {
  allow_download: { label: 'Cho phép tải xuống', desc: 'Tải tệp về máy' },
}

export const ALL_PERM_INFO = { ...PERM_LABELS, ...EXTRA_PERMS }

export function toPermObject(row) {
  const obj = {}
  PERM_KEYS.forEach(k => { obj[k] = Boolean(row?.[k]) })
  return obj
}

/**
 * Tính toán quyền cuối cùng của một đối tượng.
 * Thứ tự ưu tiên: Cá nhân (USER) > Phòng ban (DEPARTMENT) > Tất cả (EVERYONE).
 *
 * @param {object} everyonePerms - quyền cấp toàn cục (EveryOne)
 * @param {object|null} deptPerms - quyền phòng ban (nếu đối tượng thuộc phòng ban)
 * @param {object} explicitPerms - quyền được cấp trực tiếp cho đối tượng đang xét
 * @returns {{ effectivePerms: object, inheritedFrom: object }}
 */
export function resolveEffectivePermissions(everyonePerms, deptPerms, explicitPerms) {
  const effectivePerms = {}
  const inheritedFrom = {}

  PERM_KEYS.forEach(key => {
    let hasPerm = Boolean(everyonePerms?.[key])
    let source = hasPerm ? 'EVERYONE' : null

    if (deptPerms?.[key]) {
      hasPerm = true
      source = 'DEPARTMENT'
    }

    if (explicitPerms && explicitPerms[key] === true) {
      hasPerm = true
      source = 'USER'
    }

    effectivePerms[key] = hasPerm
    inheritedFrom[key] = (source !== 'USER' && source !== null) ? source : null
  })

  return { effectivePerms, inheritedFrom }
}
