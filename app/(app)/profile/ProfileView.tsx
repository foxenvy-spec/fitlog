'use client'

// หน้า "Profile" — ฮับรวมข้อมูลผู้ใช้ + ทุกอย่างที่ไม่ใช่ core loop รายวัน (log/stats)
// ไว้ที่เดียว: ข้อมูลตัว, Measures, Calendar, Achievements, ประวัติ, นำเข้า/ส่งออกข้อมูล, ตั้งค่า
// เส้นทางเดิมทั้งหมดยังใช้งานได้ปกติ หน้านี้แค่รวมทางเข้าไว้ให้เจอง่ายขึ้น

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import WeightUnitToggle from '@/components/WeightUnitToggle'
import SignOutButton from '@/components/SignOutButton'

function emailDisplayName(email: string | null | undefined) {
  if (!email) return ''
  return email.split('@')[0]
}

const LINKS = [
  { href: '/health', icon: '📏', label: 'Measures & สุขภาพ', desc: 'น้ำหนัก ส่วนสูง รูปความคืบหน้า' },
  { href: '/calendar', icon: '📆', label: 'ปฏิทิน', desc: 'ดูเวิร์กเอาต์ตามวัน' },
  { href: '/achievements', icon: '🏆', label: 'Achievements', desc: 'สถิติ streak และเป้าหมายที่ทำได้' },
  { href: '/history', icon: '🗂', label: 'ประวัติเวิร์กเอาต์', desc: 'ดูย้อนหลังทั้งหมด' },
  { href: '/export', icon: '⬇️', label: 'ส่งออกข้อมูล', desc: '' },
  { href: '/import', icon: '⬆️', label: 'นำเข้าข้อมูล', desc: '' },
]

export default function ProfileView() {
  const supabase = createClient()
  const [email, setEmail] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!active || !user) return
      setEmail(user.email ?? null)
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle()
      if (active) setDisplayName((data as { display_name: string | null } | null)?.display_name ?? null)
    })()
    return () => {
      active = false
    }
  }, [supabase])

  const name = displayName || emailDisplayName(email) || 'นักกีฬา'

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-3">
        <div className="shrink-0 w-14 h-14 rounded-full bg-surface2 border border-line flex items-center justify-center font-display text-lg tracked uppercase text-amber">
          {name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-display text-lg tracked uppercase text-ink truncate">{name}</p>
          <p className="text-[11px] text-muted font-mono truncate">{email}</p>
        </div>
      </div>

      <div className="rounded-xl bg-surface border border-line divide-y divide-line overflow-hidden">
        {LINKS.map((item) => (
          
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-4 py-3.5 active:bg-surface2 transition"
          >
            <span className="shrink-0 text-lg w-6 text-center">{item.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">{item.label}</p>
              {item.desc ? <p className="text-[11px] text-muted mt-0.5 truncate">{item.desc}</p> : null}
            </div>
            <span className="text-muted text-xs">→</span>
          </a>
        ))}
      </div>

      <div>
        <p className="text-[10px] tracked uppercase text-muted mb-2">ตั้งค่า</p>
        <div className="rounded-xl bg-surface border border-line px-4 py-3.5 flex items-center justify-between">
          <p className="text-sm text-ink">หน่วยน้ำหนัก</p>
          <WeightUnitToggle />
        </div>
      </div>

      <div className="flex justify-center pt-1">
        <SignOutButton />
      </div>
    </div>
  )
}
