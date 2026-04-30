'use client'

import Image from 'next/image'
import { useCountdown } from '@/app/hooks/useCountdown'

interface CountdownModalProps {
  onClose: () => void
}

export default function CountdownModal({ onClose }: CountdownModalProps) {
  const { time, isExpired, isMounted } = useCountdown()

  if (!isMounted) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      {/* Background click to close */}
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className="relative w-full max-w-xl py-12 flex items-center justify-center bg-gradient-to-br from-[#0a1a2f] via-[#0f2c52] to-[#1b4f9c] overflow-hidden rounded-2xl border-2 border-yellow-400/50 shadow-[0_0_50px_rgba(255,215,0,0.15)] z-10 scale-in-center animate-in zoom-in-95 duration-300">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white/70 hover:text-white hover:bg-black/60 transition-all z-20 border border-white/10"
          aria-label="Close"
        >
          ✕
        </button>

        {/* subtle pattern */}
        <div className="absolute inset-0 opacity-10 bg-[url('/patterns/grid.svg')]" />

        <div className="relative w-full px-6">
          <div className="flex flex-col items-center justify-center gap-8">

            {/* LOGO */}
            <div className="relative w-32 h-32 md:w-40 md:h-40 xl:w-48 xl:h-48 flex-shrink-0">
              <Image
                src="/icons/leif.jpg"
                alt="LEIF 2026"
                fill
                className="object-contain border-2 border-yellow-400 shadow-[0_0_25px_rgba(255,215,0,0.4)]"
              />
            </div>

            {/* TEXT + COUNTDOWN */}
            <div className="flex flex-col items-center w-full">

              {/* TITLE */}
              <div className="mb-4 text-center">
                <h2 className="text-2xl lg:text-3xl font-black text-white tracking-wider drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]">
                  Liga E-sports <br /> Inter-Facultades
                </h2>
                <p className="text-yellow-300 font-bold text-sm tracking-[0.3em] uppercase">
                  TEMPORADA 2026
                </p>
              </div>

              {isExpired ? (
                <div className="relative bg-black/40 backdrop-blur-md px-10 py-5 border-2 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)]">
                  <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-yellow-400"></div>
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-yellow-400"></div>
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
                  <div className="flex gap-2 justify-center w-full">

                    {/* DAYS */}
                    <div className="flex flex-col items-center flex-1">
                      <div className="relative bg-black/60 border border-yellow-400/50 w-full py-2 shadow-[0_0_15px_rgba(250,204,21,0.3)] text-center min-w-[50px]">
                        <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-yellow-400"></div>
                        <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-yellow-400"></div>
                        <span className="text-xl md:text-2xl font-black text-white font-mono">
                          {time.days}
                        </span>
                      </div>
                      <span className="text-[9px] lg:text-[10px] text-yellow-300 uppercase tracking-widest mt-1">
                        dias
                      </span>
                    </div>

                    {/* HOURS */}
                    <div className="flex flex-col items-center flex-1">
                      <div className="relative bg-black/60 border border-yellow-400/50 w-full py-2 shadow-[0_0_15px_rgba(250,204,21,0.3)] text-center min-w-[50px]">
                        <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-yellow-400"></div>
                        <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-yellow-400"></div>
                        <span className="text-xl md:text-2xl font-black text-white font-mono">
                          {time.hours.toString().padStart(2, '0')}
                        </span>
                      </div>
                      <span className="text-[9px] lg:text-[10px] text-yellow-300 uppercase tracking-widest mt-1">
                        horas
                      </span>
                    </div>

                    {/* MINUTES */}
                    <div className="flex flex-col items-center flex-1">
                      <div className="relative bg-black/60 border border-yellow-400/50 w-full py-2 shadow-[0_0_15px_rgba(250,204,21,0.3)] text-center min-w-[50px]">
                        <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-yellow-400"></div>
                        <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-yellow-400"></div>
                        <span className="text-xl md:text-2xl font-black text-white font-mono">
                          {time.minutes.toString().padStart(2, '0')}
                        </span>
                      </div>
                      <span className="text-[9px] lg:text-[10px] text-yellow-300 uppercase tracking-widest mt-1">
                        min
                      </span>
                    </div>

                    {/* SECONDS */}
                    <div className="flex flex-col items-center flex-1">
                      <div className="relative bg-black/60 border border-yellow-400/50 w-full py-2 shadow-[0_0_15px_rgba(250,204,21,0.3)] text-center min-w-[50px]">
                        <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-yellow-400"></div>
                        <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-yellow-400"></div>
                        <span className="text-xl md:text-2xl font-black text-white font-mono">
                          {time.seconds.toString().padStart(2, '0')}
                        </span>
                      </div>
                      <span className="text-[9px] lg:text-[10px] text-yellow-300 uppercase tracking-widest mt-1">
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
    </div>
  )
}