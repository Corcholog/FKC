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
    <nav className="fixed top-0 left-0 right-0 h-16 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800 z-50 flex items-center">
      <div className="max-w-7xl w-full mx-auto px-6 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-3 group">
          <Image src="/icons/fkc_icon.jpg" alt="FKC Logo" width={32} height={32} className="w-8 h-8 rounded-full border border-yellow-400/50 shadow-[0_0_10px_rgba(250,204,21,0.2)] group-hover:scale-110 group-hover:border-yellow-400 transition-all object-cover" />
          <span className="text-2xl font-bold text-yellow-400 tracking-wider">FAKE CLAN</span>
        </Link>
        <div className="flex gap-8">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm font-semibold transition ${pathname === href ? 'text-yellow-400' : 'hover:text-yellow-400'}`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
