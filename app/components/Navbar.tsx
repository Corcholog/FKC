'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useTheme } from './ThemeProvider'
import { useCountdown } from '@/app/hooks/useCountdown'
import CountdownModal from './Countdown'

const links = [
  { href: '/', label: 'Home' },
  { href: '/stats', label: 'Player Stats' },
  { href: '/matches', label: 'Matches' },
  { href: '/admin', label: 'Admin Panel' },
]

export default function Navbar() {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()
  
  const { time, isExpired, isMounted } = useCountdown()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [hasClosed, setHasClosed] = useState(true)

  useEffect(() => {
    if (pathname === '/') {
      setIsModalOpen(true)
      setHasClosed(false)
    }
  }, [pathname])

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setHasClosed(true)
  }

  const handleOpenModal = () => {
    setIsModalOpen(true)
  }

  return (
    <>
      {isModalOpen && <CountdownModal onClose={handleCloseModal} />}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-gradient-to-r from-[#74b9ff]/95 to-[#0984e3]/95 dark:from-[#010a13]/95 dark:to-[#091428]/95 backdrop-blur-md border-b border-sky-300 dark:border-[#322814] z-50 flex items-center shadow-md">
        <div className="max-w-7xl w-full mx-auto px-6 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3 group">
            <Image src="/icons/fkc_icon.jpg" alt="FKC Logo" width={32} height={32} className="w-8 h-8 border-2 border-white/80 shadow-md group-hover:scale-110 group-hover:border-[#f1c40f] transition-all object-cover" />
            <span className="text-2xl font-black text-white drop-shadow-sm tracking-wider group-hover:text-[#f1c40f] transition-colors">FAKE CLAN</span>
          </Link>
          <div className="flex items-center gap-6">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`text-sm font-bold transition-all drop-shadow-sm ${pathname === href ? 'text-[#f1c40f]' : 'text-white/90 hover:text-[#f1c40f]'}`}
              >
                {label}
              </Link>
            ))}

            <div className="w-px h-6 bg-white/20 dark:bg-white/10 mx-2 hidden md:block" />

            {/* Mini Timer */}
            {isMounted && hasClosed && !isExpired && (
              <button 
                onClick={handleOpenModal}
                className="flex items-center gap-2 px-3 py-1 bg-black/40 hover:bg-black/60 border border-yellow-400/50 hover:border-yellow-400 rounded transition-all text-xs text-white group shadow-[0_0_10px_rgba(250,204,21,0.1)]"
                title="Open Countdown"
              >
                <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-yellow-300 font-black tracking-widest uppercase mr-1 opacity-80 group-hover:opacity-100 transition-opacity hidden sm:inline">LEIF 2026</span>
                <span className="font-mono font-bold tracking-widest text-yellow-50 group-hover:text-yellow-400 transition-colors">
                  {time.days}D {time.hours.toString().padStart(2, '0')}:{time.minutes.toString().padStart(2, '0')}
                </span>
              </button>
            )}

            {isMounted && hasClosed && isExpired && (
               <button 
                 onClick={handleOpenModal}
                 className="flex items-center gap-2 px-3 py-1 bg-yellow-500/20 hover:bg-yellow-500/40 border border-yellow-400 rounded transition-all text-xs text-yellow-400 font-black animate-pulse group"
                 title="Open Countdown"
               >
                 <span className="text-yellow-300 font-black tracking-widest uppercase mr-1 opacity-80 group-hover:opacity-100 transition-opacity hidden sm:inline">LEIF 2026</span>
                 🧀 IT'S TIME
               </button>
            )}

            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="w-8 h-8 flex items-center justify-center border border-white/30 dark:border-[#c89b3c]/50 text-white hover:border-[#f1c40f] hover:text-[#f1c40f] transition-all text-base ml-2"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </nav>
    </>
  )
}
