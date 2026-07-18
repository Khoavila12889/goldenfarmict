export const SLOT_HEIGHT = 36
export const START_HOUR = 7
export const END_HOUR = 19
export const TOTAL_SLOTS = (END_HOUR - START_HOUR) * 2
export const COL_WIDTH = 150
export const TIME_WIDTH = 58

export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function nowTime() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function timeSlots() {
  const slots = []
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const h = Math.floor(i / 2) + START_HOUR
    const m = (i % 2) * 30
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  return slots
}

export function slotIndex(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return Math.max(0, ((h - START_HOUR) * 60 + m) / 30)
}

export function gridPos(start, end) {
  const si = slotIndex(start)
  const ei = slotIndex(end)
  return {
    top: si * SLOT_HEIGHT,
    height: Math.max((ei - si) * SLOT_HEIGHT, SLOT_HEIGHT * 0.5),
  }
}

export function addHour(t) {
  const [h, m] = t.split(':').map(Number)
  return `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function snapToSlot(time) {
  const [h, m] = time.split(':').map(Number)
  const totalMin = h * 60 + m
  const snapped = Math.round(totalMin / 30) * 30
  const nh = Math.floor(snapped / 60)
  const nm = snapped % 60
  return `${String(Math.max(START_HOUR, Math.min(END_HOUR - 1, nh))).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function diffMinutes(start, end) {
  return timeToMinutes(end) - timeToMinutes(start)
}

export function clampTime(t) {
  const m = timeToMinutes(t)
  const startMin = START_HOUR * 60
  const endMin = END_HOUR * 60
  return minutesToTime(Math.max(startMin, Math.min(endMin, m)))
}

export function daysDiff(a, b) {
  return (new Date(a) - new Date(b)) / (1000 * 60 * 60 * 24)
}

export function nearestDate(dates, target) {
  if (!dates.length) return null
  let best = dates[0]
  let bestDiff = Math.abs(daysDiff(dates[0], target))
  for (const d of dates) {
    const diff = Math.abs(daysDiff(d, target))
    if (diff < bestDiff) {
      bestDiff = diff
      best = d
    }
  }
  return best
}
