import { useState, useEffect } from 'react'
import { nowTime, today, timeToMinutes, START_HOUR, END_HOUR } from '../utils/timeUtils'

export default function useCurrentTime() {
  const [currentTime, setCurrentTime] = useState(nowTime)
  const [currentDate, setCurrentDate] = useState(today)

  useEffect(() => {
    const update = () => {
      setCurrentTime(nowTime())
      setCurrentDate(today())
    }
    update()
    const id = setInterval(update, 30000)
    return () => clearInterval(id)
  }, [])

  const minutes = timeToMinutes(currentTime)
  const isWithinGrid = currentDate === today()
  const gridOffset = isWithinGrid
    ? Math.max(0, Math.min(minutes - START_HOUR * 60, (END_HOUR - START_HOUR) * 60))
    : -1

  return { currentTime, currentDate, isWithinGrid, gridOffset }
}
