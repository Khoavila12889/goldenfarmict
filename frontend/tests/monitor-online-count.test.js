import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeOnlineUsers } from '../src/pages/monitorUtils.js'

test('online user list is the same unique set used by the count', () => {
  const users = normalizeOnlineUsers([
    { employee_code: 'E001', full_name: 'An' },
    { employee_code: 'e001', full_name: 'An (tab thứ hai)' },
    { employee_code: 'E002', full_name: 'Bình' },
  ])

  assert.equal(users.length, 2)
  assert.deepEqual(users.map(user => user.employee_code), ['E001', 'E002'])
})

test('missing list remains unknown instead of becoming zero', () => {
  assert.equal(normalizeOnlineUsers(undefined), null)
})

test('malformed online entries are rejected instead of inflating the count', () => {
  assert.throws(() => normalizeOnlineUsers([{ full_name: 'Thiếu mã' }]), /thiếu mã nhân viên/i)
  assert.throws(() => normalizeOnlineUsers('E001'), /không đúng định dạng/i)
})
