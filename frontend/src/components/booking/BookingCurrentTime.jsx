import React from 'react'
import { SLOT_HEIGHT } from '../../utils/timeUtils'

export default function BookingCurrentTime({ minutes, isToday }) {
  if (minutes < 0 || !isToday) return null

  const top = (minutes / 30) * SLOT_HEIGHT

  return (
    <div
      className="bk-current-time"
      style={{ top }}
    />
  )
}
