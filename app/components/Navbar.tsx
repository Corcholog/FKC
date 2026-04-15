'use client'
import Link from 'next/link'
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
        <Link href="/" className="text-2xl font-bold text-yellow-400 tracking-wider">FAKE CLAN</Link>
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
