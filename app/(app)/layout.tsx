import BottomNav from '@/components/BottomNav'
import SignOutButton from '@/components/SignOutButton'
import QueryProvider from '@/components/QueryProvider'
import { WeightUnitProvider } from '@/components/WeightUnitProvider'
import WeightUnitToggle from '@/components/WeightUnitToggle'
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

  return (
    <WeightUnitProvider>
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-line safe-top">
          <div className="max-w-sm mx-auto flex items-center justify-between px-5 py-3.5">
            <a href="/dashboard" className="font-display tracked-lg uppercase text-lg text-ink">FITLOG</a>
            <div className="flex items-center gap-3">
              <WeightUnitToggle />
              <span className="text-xs text-muted font-mono truncate max-w-[120px]">
                {user?.email}
              </span>
              <SignOutButton />
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-sm w-full mx-auto px-5 pt-5 pb-24">
          <QueryProvider>{children}</QueryProvider>
        </main>

        <BottomNav />
      </div>
    </WeightUnitProvider>
  )
}
