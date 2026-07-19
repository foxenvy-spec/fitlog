'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setLoading(true)

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message === 'Invalid login credentials' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : error.message)
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) {
        setError(error.message)
      } else {
        setNotice('สมัครสำเร็จ กรุณาเช็คอีเมลเพื่อยืนยันบัญชี แล้วกลับมาล็อกอิน')
        setMode('signin')
      }
    }

    setLoading(false)
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 safe-top safe-bottom">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <BarbellMark />
          <h1 className="mt-4 font-display text-4xl tracked-lg text-ink uppercase">FITLOG</h1>
          <p className="mt-1 text-sm text-muted font-body">บันทึกทุกเซ็ต ทุกระยะทาง</p>
        </div>

        <div className="flex rounded-full bg-surface p-1 mb-6 border border-line">
          <button
            type="button"
            onClick={() => setMode('signin')}
            className={`flex-1 py-2 rounded-full text-sm font-display tracked uppercase transition ${
              mode === 'signin' ? 'bg-amber text-bg' : 'text-muted'
            }`}
          >
            เข้าสู่ระบบ
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 py-2 rounded-full text-sm font-display tracked uppercase transition ${
              mode === 'signup' ? 'bg-amber text-bg' : 'text-muted'
            }`}
          >
            สมัครสมาชิก
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs tracked uppercase text-muted mb-1.5">อีเมล</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-surface border border-line px-4 py-3 text-ink placeholder:text-muted/50 focus:border-amber outline-none"
              placeholder="you@email.com"
            />
          </div>
          <div>
            <label className="block text-xs tracked uppercase text-muted mb-1.5">รหัสผ่าน</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-surface border border-line px-4 py-3 text-ink placeholder:text-muted/50 focus:border-amber outline-none"
              placeholder="อย่างน้อย 6 ตัวอักษร"
            />
          </div>

          {error && (
            <p className="text-sm text-rusttext bg-rustdim/40 border border-rust/40 rounded-lg px-3 py-2">{error}</p>
          )}
          {notice && (
            <p className="text-sm text-steel bg-steeldim/30 border border-steel/40 rounded-lg px-3 py-2">{notice}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 rounded-lg bg-amber text-bg font-display tracked uppercase py-3 text-lg disabled:opacity-50 active:scale-[0.99] transition"
          >
            {loading ? 'กำลังโหลด...' : mode === 'signin' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
          </button>
        </form>
      </div>
    </main>
  )
}

function BarbellMark() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
      <rect x="14" y="26" width="28" height="4" rx="2" fill="#F3F0E8" />
      <rect x="6" y="18" width="6" height="20" rx="2" fill="#E8A33D" />
      <rect x="9" y="21" width="4" height="14" rx="1.5" fill="#6C8CA8" />
      <rect x="44" y="18" width="6" height="20" rx="2" fill="#E8A33D" />
      <rect x="43" y="21" width="4" height="14" rx="1.5" fill="#6C8CA8" />
    </svg>
  )
}
