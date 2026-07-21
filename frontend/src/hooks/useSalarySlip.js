import { useState, useCallback } from 'react'
import api from '../services/api'

export default function useSalarySlip() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [salaryData, setSalaryData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [needPassword, setNeedPassword] = useState(false)

  const fetchSalarySlip = useCallback(async (month, password) => {
    setIsLoading(true)
    setError(null)
    setNeedPassword(false)
    setSalaryData(null)

    const userCode = sessionStorage.getItem('user_code')
    const token = sessionStorage.getItem('token') || ''
    const role = sessionStorage.getItem('user_role') || 'user'

    try {
      const res = await api.post('/salary/verify-and-view', {
        employee_code: userCode,
        month,
        password: password || '',
        token,
        role
      })
      if (res.data.status === 'success') {
        setSalaryData(res.data.data)
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setNeedPassword(true)
        setError('Nhập mật khẩu phiếu lương')
      } else {
        setError(err.response?.status === 404
          ? null
          : (err.response?.data?.message || 'Lỗi kết nối máy chủ'))
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const changeMonth = useCallback((month) => {
    setSelectedMonth(month)
    setSalaryData(null)
    setError(null)
    setNeedPassword(false)
  }, [])

  return {
    selectedMonth,
    salaryData,
    isLoading,
    error,
    needPassword,
    fetchSalarySlip,
    changeMonth,
  }
}
