'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useTheme } from './ThemeProvider'

const links = [
  { href: '/', label: 'Home' },
  { href: '/stats', label: 'Player Stats' },
  { href: '/matches', label: 'Matches' },
  { href: '/admin', label: 'Admin Panel' },
]

export default function Navbar() {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-gradient-to-r from-[#74b9ff]/95 to-[#0984e3]/95 dark:from-[#010a13]/95 dark:to-[#091428]/95 backdrop-blur-md border-b border-sky-300 dark:border-[#322814] z-50 flex items-center shadow-md">
      <div className="max-w-7xl w-full mx-auto px-6 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-3 group">
          <Image src="/icons/fkc_icon.jpg" alt="FKC Logo" width={32} height={32} className="w-8 h-8 border-2 border-white/80 shadow-md group-hover:scale-110 group-hover:border-[#f1c40f] transition-all object-cover" />
          <span className="text-2xl font-black text-white drop-shadow-sm tracking-wider group-hover:text-[#f1c40f] transition-colors">FAKE CLAN</span>
        </Link>
        <div className="flex items-center gap-8">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm font-bold transition-all drop-shadow-sm ${pathname === href ? 'text-[#f1c40f]' : 'text-white/90 hover:text-[#f1c40f]'}`}
            >
              {label}
            </Link>
          ))}
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="w-8 h-8 flex items-center justify-center border border-white/30 dark:border-[#c89b3c]/50 text-white hover:border-[#f1c40f] hover:text-[#f1c40f] transition-all text-base"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
    </nav>
  )
}
