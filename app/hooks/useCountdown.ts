import { useState, useEffect } from 'react'

export const LEIF_START_DATE = new Date("2026-05-15T00:00:00")

export function useCountdown() {
  const [time, setTime] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  })
  const [isExpired, setIsExpired] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    const calculateTimeLeft = () => {
      const now = new Date()
      const difference = LEIF_START_DATE.getTime() - now.getTime()

      if (difference <= 0) {
        setIsExpired(true)
        return
      }

      setTime({
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / (1000 * 60)) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      })
    }

    calculateTimeLeft()

    const timer = setInterval(() => {
      calculateTimeLeft()
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return { time, isExpired, isMounted }
}
