'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Check if already logged in
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        router.push('/admin')
      }
    }
    checkUser()
  }, [router, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      setMessage('Login successful!')
      window.location.href = '/admin'
    } catch (error) {
      console.error(error)
      setMessage('Login failed: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-card p-8 rounded-2xl border border-blue-100 dark:border-[#322814] shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <h1 className="text-2xl font-black mb-6 text-foreground text-center">Login to Admin</h1>
        {message && (
          <div className={`p-4 mb-4 rounded ${message.includes('failed') ? 'bg-rose-100 text-rose-600 border border-rose-200' : 'bg-emerald-100 text-emerald-600 border border-emerald-200'}`}>
            {message}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 bg-blue-50/50 dark:bg-[#1e2328] border border-blue-200 dark:border-[#322814] rounded-lg focus:border-[#f1c40f] focus:ring-1 focus:ring-[#f1c40f] outline-none transition-all dark:text-[#f0e6d2]"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 bg-blue-50/50 dark:bg-[#1e2328] border border-blue-200 dark:border-[#322814] rounded-lg focus:border-[#f1c40f] focus:ring-1 focus:ring-[#f1c40f] outline-none transition-all dark:text-[#f0e6d2]"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#f1c40f] text-slate-900 font-bold rounded-lg hover:bg-[#f39c12] disabled:opacity-50 shadow-md transition-all"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}