import BottomNav from '@/components/BottomNav'
import SidebarNav from '@/components/SidebarNav'
import QueryProvider from '@/components/QueryProvider'
import { WeightUnitProvider } from '@/components/WeightUnitProvider'
import { ToastProvider } from '@/components/Toast'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // header เหลือแค่โลโก้ + ทางลัดไปโปรไฟล์ — อีเมล/หน่วยน้ำหนัก/ปุ่มออกจากระบบ
  // ย้ายไปรวมอยู่ที่หน้า /profile ทั้งหมดแล้ว เพื่อให้แต่ละหน้ามีหน้าที่ชัดเจนขึ้น
  const initial = (user?.email ?? '?').slice(0, 1).toUpperCase()

  return (
    <WeightUnitProvider>
      <ToastProvider>
        {/* < 768px: single column, mobile header + bottom tab bar (original layout, unchanged).
          768–1023px: same header/bottom-bar shell, just a wider centered column so cards
          can sit two-across instead of stretching one narrow strip across a tablet screen.
          >= 1024px: sidebar replaces the header + bottom bar entirely; content gets the
          remaining width to lay out as a multi-column dashboard. */}
        <div className="min-h-screen flex lg:flex-row">
          <SidebarNav />

          <div className="flex-1 flex flex-col min-w-0">
            <header className="lg:hidden sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-line safe-top">
              <div className="max-w-sm md:max-w-2xl mx-auto flex items-center justify-between px-5 py-3.5">
                <a href="/dashboard" className="font-display tracked-lg uppercase text-lg text-ink">FITLOG</a>
                <a
                  href="/profile"
                  aria-label="โปรไฟล์"
                  className="shrink-0 w-8 h-8 rounded-full bg-surface2 border border-line flex items-center justify-center font-display text-xs tracked uppercase text-amber"
                >
                  {initial}
                </a>
              </div>
            </header>

            <main className="flex-1 w-full max-w-sm md:max-w-2xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-[1600px] mx-auto px-5 pt-5 pb-24 lg:pb-10">
              <QueryProvider>{children}</QueryProvider>
            </main>

            <BottomNav />
          </div>
        </div>
      </ToastProvider>
    </WeightUnitProvider>
  )
}
