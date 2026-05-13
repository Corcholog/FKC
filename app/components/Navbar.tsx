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
  { href: '/tournament', label: 'Scouting' },
  { href: '/stages', label: 'Stages' },
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
      <nav className="fixed top-0 left-0 right-0 h-16 bg-background backdrop-blur-md border-b border-border z-50 flex items-center shadow-lg shadow-black/60">
        <div className="max-w-7xl w-full mx-auto px-6 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3 group">
            <Image src="/icons/fkc_icon.jpg" alt="FKC Logo" width={32} height={32} className="w-8 h-8 border-2 border-accent shadow-lg group-hover:shadow-[0_0_12px_rgba(246,201,14,0.6)] group-hover:scale-110 transition-all object-cover rounded-sharp" />
            <span className="text-lg font-black text-accent drop-shadow-sm tracking-[0.1em] group-hover:text-foreground transition-colors uppercase">FAKE CLAN</span>
          </Link>
          <div className="flex items-center gap-4 sm:gap-6">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`text-xs sm:text-sm font-bold uppercase tracking-widest transition-all ${
                  pathname === href
                    ? 'text-accent border-b-2 border-accent'
                    : 'text-muted-foreground hover:text-accent'
                }`}
              >
                {label}
              </Link>
            ))}

            <div className="w-px h-6 bg-border mx-2 hidden md:block" />

            {/* Mini Timer */}
            {isMounted && hasClosed && !isExpired && (
              <button 
                onClick={handleOpenModal}
                className="flex items-center gap-2 px-2.5 py-1 bg-card hover:bg-popover border border-accent/40 hover:border-accent rounded-sharp transition-all text-xs group shadow-lg shadow-accent/20"
                title="Open Countdown"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                <span className="text-accent font-black tracking-widest uppercase opacity-80 group-hover:opacity-100 transition-opacity hidden sm:inline text-[0.65rem]">LEIF 2026</span>
                <span className="font-mono font-bold tracking-widest text-foreground group-hover:text-accent transition-colors text-[0.7rem]">
                  {time.days}D {time.hours.toString().padStart(2, '0')}:{time.minutes.toString().padStart(2, '0')}
                </span>
              </button>
            )}

            {isMounted && hasClosed && isExpired && (
               <button 
                 onClick={handleOpenModal}
                 className="flex items-center gap-2 px-2.5 py-1 bg-accent/20 hover:bg-accent/30 border border-accent rounded-sharp transition-all text-xs text-accent font-black animate-pulse group"
                 title="Open Countdown"
               >
                 <span className="text-accent font-black tracking-widest uppercase opacity-80 group-hover:opacity-100 transition-opacity hidden sm:inline text-[0.65rem]">LIVE</span>
                 ⚔️
               </button>
            )}

            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="w-8 h-8 flex items-center justify-center border border-border hover:border-accent text-muted-foreground hover:text-accent transition-all text-base ml-2 rounded-sharp"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </nav>
    </>
  )
}
