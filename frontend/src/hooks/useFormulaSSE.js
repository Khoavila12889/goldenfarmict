/**
 * useFormulaSSE.js - SSE hook cho real-time Formula events
 *
 * Listens cho 3 event:
 *   - formula_created : payload={id, recipe_code, recipe_name, category, version, created_at, created_by}
 *   - formula_deleted : payload={id}
 *   - formula_updated : payload={id, recipe_code, recipe_name, is_active}
 *
 * Auto-reconnect khi mất kết nối SSE.
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { apiUrl } from '../services/api'

export default function useFormulaSSE({ onCreated, onDeleted, onUpdated } = {}) {
  const [connected, setConnected] = useState(false)
  const esRef = useRef(null)
  const retryRef = useRef(0)

  const onCreatedRef = useRef(onCreated)
  const onDeletedRef = useRef(onDeleted)
  const onUpdatedRef = useRef(onUpdated)

  useEffect(() => { onCreatedRef.current = onCreated }, [onCreated])
  useEffect(() => { onDeletedRef.current = onDeleted }, [onDeleted])
  useEffect(() => { onUpdatedRef.current = onUpdated }, [onUpdated])

  const connect = useCallback(() => {
    if (esRef.current) {
      try { esRef.current.close() } catch (_) {}
    }

    const token = sessionStorage.getItem('token') || ''
    const url = apiUrl(`/events${token ? `?token=${token}` : ''}`)

    let es
    try {
      es = new EventSource(url)
    } catch {
      scheduleReconnect()
      return
    }

    esRef.current = es

    es.onopen = () => {
      setConnected(true)
      retryRef.current = 0
    }

    es.addEventListener('formula_created', (e) => {
      try {
        const data = JSON.parse(e.data)
        onCreatedRef.current?.(data)
      } catch (_) {}
    })

    es.addEventListener('formula_deleted', (e) => {
      try {
        const data = JSON.parse(e.data)
        onDeletedRef.current?.(data)
      } catch (_) {}
    })

    es.addEventListener('formula_updated', (e) => {
      try {
        const data = JSON.parse(e.data)
        onUpdatedRef.current?.(data)
      } catch (_) {}
    })

    es.onerror = () => {
      setConnected(false)
      es.close()
      scheduleReconnect()
    }
  }, [])

  const scheduleReconnect = useCallback(() => {
    retryRef.current += 1
    const delay = Math.min(3000 * Math.pow(2, retryRef.current - 1), 30000)
    setTimeout(connect, delay)
  }, [connect])

  useEffect(() => {
    connect()
    return () => {
      if (esRef.current) {
        try { esRef.current.close() } catch (_) {}
      }
    }
  }, [connect])

  return { connected }
}
