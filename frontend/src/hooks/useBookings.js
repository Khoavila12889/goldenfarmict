import { useState, useCallback, useRef } from 'react'
import {
  getBookings as fetchBookings,
  createBooking as apiCreateBooking,
  finishBooking as apiFinishBooking,
  checkOverlap,
} from '../services/api'
import { isExpired } from '../utils/bookingUtils'

export default function useBookings() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const bookingsRef = useRef(bookings)
  bookingsRef.current = bookings

  const loadBookings = useCallback(async (date, type, status) => {
    setLoading(true)
    try {
      const res = await fetchBookings(date, type, status)
      const data = res.data?.data || []
      setBookings(data)
      return data
    } catch {
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const createBooking = useCallback(async (data) => {
    const overlapRes = await checkOverlap(data.resource_id, data.book_date, data.start_time, data.end_time)
    if (overlapRes.data?.overlap) {
      return { success: false, error: '⛔ Khung giờ này đã có người đặt! Vui lòng chọn giờ khác.' }
    }
    try {
      await apiCreateBooking(data)
      return { success: true }
    } catch {
      return { success: false, error: 'Lỗi kết nối máy chủ.' }
    }
  }, [])

  const finishBooking = useCallback(async (id) => {
    try {
      await apiFinishBooking(id)
      return true
    } catch {
      return false
    }
  }, [])

  const getActiveBookings = useCallback(() => {
    return bookingsRef.current.filter(b => b.status === 'active' && !isExpired(b))
  }, [])

  return {
    bookings,
    setBookings,
    loading,
    setLoading,
    loadBookings,
    createBooking,
    finishBooking,
    getActiveBookings,
  }
}
