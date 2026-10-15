import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativePlatform, buildChatWebSocketUrl, chatAttachmentUrl } from '../src/services/chatConnection.js'

test('HTTP LAN server keeps ws even inside HTTPS Android WebView', () => {
  const url = new URL(buildChatWebSocketUrl('http://192.168.1.20:8000', 'https://localhost', 'a&b=+', 'NV 01'))
  assert.equal(url.protocol, 'ws:')
  assert.equal(url.host, '192.168.1.20:8000')
  assert.equal(url.pathname, '/api/chat/ws')
  assert.equal(url.searchParams.get('token'), 'a&b=+')
  assert.equal(url.searchParams.get('employee_code'), 'NV 01')
})

test('HTTPS server and same-origin web use wss', () => {
  assert.match(buildChatWebSocketUrl('https://chat.example.com', 'http://localhost', '', ''), /^wss:\/\/chat.example.com\//)
  assert.match(buildChatWebSocketUrl('', 'https://ict.example.com', '', ''), /^wss:\/\/ict.example.com\//)
  assert.throws(() => buildChatWebSocketUrl('file://server', 'https://localhost', '', ''))
})

test('web Capacitor shim does not enable native server settings', () => {
  assert.equal(nativePlatform({ Capacitor: { isNativePlatform: () => false } }), false)
  assert.equal(nativePlatform({ Capacitor: { isNativePlatform: () => true } }), true)
  assert.equal(nativePlatform({ Capacitor: {} }), false)
  assert.equal(nativePlatform({ cordova: {} }), true)
})

test('attachment display resolves server while preserving signed upload payload', () => {
  const path = '/api/chat/uploads/file.png?expires=123&signature=abc'
  assert.equal(chatAttachmentUrl(path, 'https://ict.example.com'), `https://ict.example.com${path}`)
  assert.equal(chatAttachmentUrl(path, ''), path)
  assert.equal(chatAttachmentUrl('', 'https://ict.example.com'), '')
})
