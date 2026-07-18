import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  getEmployeeByCode, getResources, getBookingDates,
} from '../services/api'
import { today, nearestDate } from '../utils/timeUtils'
import useBookings from './useBookings'

export default function useScheduler() {
  const [employee, setEmployee] = useState(null)
  const [resources, setResources] = useState([])
  const [bookingDates, setBookingDates] = useState([])
  const [filterDate, setFilterDate] = useState(today())
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [sidebarBooking, setSidebarBooking] = useState(null)

  const userCode = sessionStorage.getItem('user_code')

  const filterRef = useRef({ filterDate, filterType, filterStatus })
  filterRef.current = { filterDate, filterType, filterStatus }

  const { bookings, loading, loadBookings, createBooking, finishBooking } = useBookings()

  const dateSet = useMemo(() => new Set(bookingDates), [bookingDates])

  const loadInitial = useCallback(async () => {
    try {
      const [empRes, resRes, datesRes] = await Promise.all([
        getEmployeeByCode(userCode),
        getResources(),
        getBookingDates(),
      ])
      if (empRes.data?.id) setEmployee(empRes.data)
      const resourcesData = resRes.data?.data || []
      setResources(resourcesData)
      const dates = datesRes.data?.data || []
      setBookingDates(dates)
      const nearest = nearestDate(dates, today())
      if (nearest) setFilterDate(nearest)
      return { resources: resourcesData, dates, nearest }
    } catch {
      return { resources: [], dates: [], nearest: null }
    }
  }, [userCode])

  useEffect(() => {
    loadInitial().then(({ nearest }) => {
      const f = filterRef.current
      loadBookings(nearest || f.filterDate, f.filterType, f.filterStatus)
    })
  }, [loadInitial, loadBookings])

  useEffect(() => {
    let es = null
    let reconnectTimer = null
    
    function setupSSE() {
      try {
        es = new EventSource('/api/events')
        
        function reload() {
          const f = filterRef.current
          loadBookings(f.filterDate, f.filterType, f.filterStatus)
        }
        
        es.addEventListener('booking_created', reload)
        es.addEventListener('booking_updated', reload)
        
        es.onerror = () => {
          if (es) es.close()
          // Auto reconnect after 3 seconds
          reconnectTimer = setTimeout(setupSSE, 3000)
        }
      } catch (err) {
        reconnectTimer = setTimeout(setupSSE, 3000)
      }
    }
    
    setupSSE()
    
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (es) es.close()
    }
  }, [loadBookings])

  const setFilter = useCallback((date, type, status) => {
    const nd = date ?? filterRef.current.filterDate
    const nt = type ?? filterRef.current.filterType
    const ns = status ?? filterRef.current.filterStatus
    setFilterDate(nd)
    setFilterType(nt)
    setFilterStatus(ns)
    setSelectedBooking(null)
    setSidebarBooking(null)
    loadBookings(nd, nt, ns)
  }, [loadBookings])

  const refresh = useCallback(() => {
    const f = filterRef.current
    loadBookings(f.filterDate, f.filterType, f.filterStatus)
  }, [loadBookings])

  const filteredResources = useMemo(() => {
    return filterType === 'all' ? resources : resources.filter(r => r.type === filterType)
  }, [resources, filterType])

  const handleCreateBooking = useCallback(async (data) => {
    const result = await createBooking(data)
    if (result.success) {
      refresh()
    }
    return result
  }, [createBooking, refresh])

  const handleFinishBooking = useCallback(async (id) => {
    const success = await finishBooking(id)
    if (success) {
      setSelectedBooking(null)
      setSidebarBooking(null)
      refresh()
    }
    return success
  }, [finishBooking, refresh])

  const selectBooking = useCallback((booking) => {
    setSelectedBooking(prev => prev?.id === booking?.id ? null : booking)
  }, [])

  return {
    employee,
    resources,
    filteredResources,
    bookingDates,
    dateSet,
    bookings,
    loading,
    filterDate,
    filterType,
    filterStatus,
    selectedBooking,
    sidebarBooking,
    setFilter,
    refresh,
    selectBooking,
    handleCreateBooking,
    handleFinishBooking,
    setSidebarBooking,
    setSelectedBooking,
    loadInitial,
  }
}
