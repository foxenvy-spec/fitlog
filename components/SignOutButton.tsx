'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignOutButton() {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-xs tracked uppercase text-muted border border-line rounded-full px-3 py-1.5 hover:text-rust hover:border-rust/50 transition"
    >
      ออก
    </button>
  )
}
