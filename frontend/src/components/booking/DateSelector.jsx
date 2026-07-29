import React, { useState, useMemo, useEffect } from 'react'
import { today } from '../../utils/timeUtils'

export default function DateSelector({ value, onChange }) {
  const [displayValue, setDisplayValue] = useState('')
  
  useEffect(() => {
    if (value) {
      // Convert ISO date to DD/MM/YYYY format
      const date = new Date(value)
      const day = String(date.getDate()).padStart(2, '0')
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const year = date.getFullYear()
      setDisplayValue(`${day}/${month}/${year}`)
    } else {
      setDisplayValue('')
    }
  }, [value])

  function formatDateToISO(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function formatDateDisplay(date) {
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  const handleDateChange = (e) => {
    const date = e.target.valueAsDate
    if (date) {
      setDisplayValue(formatDateDisplay(date))
      onChange(formatDateToISO(date))
    }
  }

  return (
    <input
      type="date"
      className="bk-input"
      value={value}
      onChange={handleDateChange}
      style={{
        fontFamily: 'inherit',
        fontSize: '0.85rem',
        padding: '0.45rem 0.6rem',
      }}
    />
  )
}
