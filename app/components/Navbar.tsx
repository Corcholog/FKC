'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Home' },
  { href: '/stats', label: 'Player Stats' },
  { href: '/matches', label: 'Matches' },
  { href: '/admin', label: 'Admin Panel' },
]

export default function Navbar() {
  const pathname = usePathname()

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-gradient-to-r from-[#74b9ff]/95 to-[#0984e3]/95 backdrop-blur-md border-b border-sky-300 z-50 flex items-center shadow-md">
      <div className="max-w-7xl w-full mx-auto px-6 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-3 group">
          <Image src="/icons/fkc_icon.jpg" alt="FKC Logo" width={32} height={32} className="w-8 h-8 rounded-full border-2 border-white/80 shadow-md group-hover:scale-110 group-hover:border-[#f1c40f] transition-all object-cover" />
          <span className="text-2xl font-black text-white drop-shadow-sm tracking-wider group-hover:text-[#f1c40f] transition-colors">FAKE CLAN</span>
        </Link>
        <div className="flex gap-8">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm font-bold transition-all drop-shadow-sm ${pathname === href ? 'text-[#f1c40f]' : 'text-white/90 hover:text-[#f1c40f]'}`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
