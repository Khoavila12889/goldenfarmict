export function nativePlatform(windowObject) {
  const capacitor = windowObject?.Capacitor
  if (typeof capacitor?.isNativePlatform === 'function') return capacitor.isNativePlatform()
  return Boolean(windowObject?.cordova || capacitor?.getPlatform?.() === 'android' || capacitor?.getPlatform?.() === 'ios')
}

export function buildChatWebSocketUrl(origin, pageOrigin, token, code) {
  const url = new URL(`${origin || pageOrigin}/api/chat/ws`)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Máy chủ phải dùng HTTP hoặc HTTPS')
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.search = new URLSearchParams({ token, employee_code: code }).toString()
  return url.toString()
}

// Resolve only for display; the signed relative URL must stay intact in send payloads.
export function chatAttachmentUrl(path, origin) {
  if (!path) return ''
  return path.startsWith('/api/chat/uploads/') ? `${origin}${path}` : path
}
