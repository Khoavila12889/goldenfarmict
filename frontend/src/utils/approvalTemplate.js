import { getWorkflows } from '../services/api'

const KEYWORDS = {
  leave: ['nghỉ', 'phép', 'leave', 'vacation'],
  business_trip: ['công tác', 'trip', 'business', 'đi công tác'],
}

let cache = null
let cachePromise = null

async function fetchTemplates() {
  if (cache) return cache
  if (!cachePromise) {
    cachePromise = getWorkflows(true)
      .then(r => r.data?.data || [])
      .then(list => { cache = list; return list })
      .catch(() => (cache = []))
  }
  return cachePromise
}

export async function getApprovalTemplate(kind) {
  const list = await fetchTemplates()
  if (!list || list.length === 0) return null
  const kws = KEYWORDS[kind] || []
  const name = (t) => `${t.name || ''} ${t.description || ''}`.toLowerCase()
  const matched = list.find(t => kws.some(k => name(t).includes(k)))
  return matched || list[0]
}