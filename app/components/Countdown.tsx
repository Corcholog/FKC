'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

const LEIF_START_DATE = new Date("2026-05-15T00:00:00")

export default function Countdown() {
  const [time, setTime] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  })
  const [isExpired, setIsExpired] = useState(false)

  useEffect(() => {
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

  return (
    <div className="relative w-full py-10 bg-gradient-to-r from-[#0a1a2f] via-[#0f2c52] to-[#1b4f9c] border-y border-yellow-400 shadow-2xl overflow-hidden">

      {/* subtle pattern */}
      <div className="absolute inset-0 opacity-10 bg-[url('/patterns/grid.svg')]" />

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-center gap-12">

          {/* LOGO */}
          <div className="relative w-54 h-56 flex-shrink-0">
            <Image
              src="/icons/leif.jpg"
              alt="LEIF 2026"
              fill
              className="object-contain rounded-xl shadow-[0_0_25px_rgba(255,215,0,0.4)]"
            />
          </div>

          {/* TEXT + COUNTDOWN */}
          <div className="flex flex-col items-center">

            {/* TITLE */}
            <div className="mb-4 text-center">
              <h2 className="text-3xl font-black text-white tracking-wider drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]">
                Liga E-sports Inter-Facultades
              </h2>
              <p className="text-yellow-300 font-bold text-sm tracking-[0.3em] uppercase">
                TEMPORADA 2026
              </p>
            </div>

            {isExpired ? (
              <div className="bg-black/40 backdrop-blur-md px-10 py-5 rounded-2xl border-2 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)]">
                <p className="text-3xl font-black text-yellow-400 animate-pulse text-center">
                  🧀 Se pudrio el queso!
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center">

                <p className="text-sm text-white/70 font-bold uppercase tracking-widest mb-3 text-center">
                  Tiempo restante para darlo todo
                </p>

                {/* TIMER BOXES */}
                <div className="flex gap-4">

                  {/* DAYS */}
                  <div className="flex flex-col items-center">
                    <div className="bg-black/60 border border-yellow-400 rounded-xl px-5 py-4 shadow-[0_0_15px_rgba(250,204,21,0.4)] min-w-[80px] text-center">
                      <span className="text-3xl font-black text-white font-mono">
                        {time.days}
                      </span>
                    </div>
                    <span className="text-xs text-yellow-300 uppercase tracking-widest mt-1">
                      dias
                    </span>
                  </div>

                  {/* HOURS */}
                  <div className="flex flex-col items-center">
                    <div className="bg-black/60 border border-yellow-400 rounded-xl px-5 py-4 shadow-[0_0_15px_rgba(250,204,21,0.4)] min-w-[80px] text-center">
                      <span className="text-3xl font-black text-white font-mono">
                        {time.hours.toString().padStart(2, '0')}
                      </span>
                    </div>
                    <span className="text-xs text-yellow-300 uppercase tracking-widest mt-1">
                      horas
                    </span>
                  </div>

                  {/* MINUTES */}
                  <div className="flex flex-col items-center">
                    <div className="bg-black/60 border border-yellow-400 rounded-xl px-5 py-4 shadow-[0_0_15px_rgba(250,204,21,0.4)] min-w-[80px] text-center">
                      <span className="text-3xl font-black text-white font-mono">
                        {time.minutes.toString().padStart(2, '0')}
                      </span>
                    </div>
                    <span className="text-xs text-yellow-300 uppercase tracking-widest mt-1">
                      min
                    </span>
                  </div>

                  {/* SECONDS */}
                  <div className="flex flex-col items-center">
                    <div className="bg-black/60 border border-yellow-400 rounded-xl px-5 py-4 shadow-[0_0_20px_rgba(250,204,21,0.6)] min-w-[80px] text-center animate-pulse">
                      <span className="text-3xl font-black text-white font-mono">
                        {time.seconds.toString().padStart(2, '0')}
                      </span>
                    </div>
                    <span className="text-xs text-yellow-300 uppercase tracking-widest mt-1">
                      seg
                    </span>
                  </div>

                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}