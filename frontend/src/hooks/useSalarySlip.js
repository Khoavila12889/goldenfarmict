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
  const [availableMonths, setAvailableMonths] = useState([])
  const [monthsLoading, setMonthsLoading] = useState(false)
  const [pdfExporting, setPdfExporting] = useState(false)

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

  const fetchAvailableMonths = useCallback(async () => {
    const userCode = sessionStorage.getItem('user_code')
    const token = sessionStorage.getItem('token') || ''
    const role = sessionStorage.getItem('user_role') || 'user'
    setMonthsLoading(true)
    try {
      const res = await fetch(`/api/salary/available-months?employee_code=${userCode}&token=${token}&role=${role}`)
      const data = await res.json()
      if (res.ok) setAvailableMonths(data.data || [])
    } catch (_) {} finally {
      setMonthsLoading(false)
    }
  }, [])

  const downloadPdf = useCallback(async (month, password) => {
    const userCode = sessionStorage.getItem('user_code')
    const token = sessionStorage.getItem('token') || ''
    const role = sessionStorage.getItem('user_role') || 'user'
    setPdfExporting(true)
    try {
      const res = await fetch('/api/salary/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_code: userCode,
          month,
          password: password || '',
          token,
          role
        })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Lỗi xuất PDF')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `luong_${userCode}_${month}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      throw err
    } finally {
      setPdfExporting(false)
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
    availableMonths,
    monthsLoading,
    pdfExporting,
    fetchSalarySlip,
    fetchAvailableMonths,
    downloadPdf,
    changeMonth,
  }
}
