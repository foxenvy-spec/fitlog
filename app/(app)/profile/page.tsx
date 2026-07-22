'use client'

import dynamic from 'next/dynamic'

// เหมือนกับ /dashboard: หน้านี้ดึงข้อมูล user เฉพาะคน (auth, display_name) ผ่าน
// Supabase ฝั่ง client ล้วนๆ ไม่มีประโยชน์ด้าน SEO และข้อมูลต่างกันทุกคนอยู่แล้ว
// จึงปิด SSR (ssr: false) ไปเลย กัน hydration mismatch (React error #418/#423 ที่เจอ
// ตอนดึงอีเมล/ชื่อผู้ใช้ระหว่าง server render กับ client render ไม่ตรงกัน)
const ProfileView = dynamic(() => import('./ProfileView'), {
  ssr: false,
  loading: () => <ProfileSkeleton />,
})

export default function ProfilePage() {
  return <ProfileView />
}

function ProfileSkeleton() {
  return (
    <div className="space-y-5 pb-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="shrink-0 w-14 h-14 rounded-full bg-surface2 border border-line" />
        <div className="space-y-2">
          <div className="h-4 w-28 rounded bg-surface2" />
          <div className="h-3 w-36 rounded bg-surface2" />
        </div>
      </div>
      <div className="rounded-xl bg-surface border border-line shadow-elevated divide-y divide-line overflow-hidden">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="px-4 py-3.5">
            <div className="h-3.5 w-32 rounded bg-surface2" />
          </div>
        ))}
      </div>
    </div>
  )
}
