'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/dashboard', label: 'หน้าแรก', icon: HomeIcon },
  { href: '/log', label: 'บันทึก', icon: PlusIcon },
  { href: '/program', label: 'โปรแกรม', icon: ListIcon },
  { href: '/calendar', label: 'ปฏิทิน', icon: CalendarIcon },
  { href: '/timer', label: 'ไทม์เมอร์', icon: TimerIcon },
  { href: '/stats', label: 'สถิติ', icon: ChartIcon },
  { href: '/coach', label: 'AI Coach', icon: SparkleIcon },
  { href: '/health', label: 'สุขภาพ', icon: HeartIcon },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 bg-surface/95 backdrop-blur border-t border-line safe-bottom">
      <div className="max-w-sm mx-auto grid grid-cols-8">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-1 py-2.5"
            >
              <Icon active={active} />
              <span
                className={`text-[9.5px] font-display tracked uppercase ${
                  active ? 'text-amber' : 'text-muted'
                }`}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function HomeIcon({ active }: { active: boolean }) {
  const c = active ? '#E8A33D' : '#9498A0'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 11.5 12 4l8 7.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9h12v-9" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 19v-5h4v5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon({ active }: { active: boolean }) {
  const c = active ? '#E8A33D' : '#9498A0'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.8" />
      <path d="M12 8v8M8 12h8" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ListIcon({ active }: { active: boolean }) {
  const c = active ? '#E8A33D' : '#9498A0'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M8 6h11M8 12h11M8 18h11" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke={c} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

function ChartIcon({ active }: { active: boolean }) {
  const c = active ? '#E8A33D' : '#9498A0'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M5 19V10M12 19V5M19 19v-7" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CalendarIcon({ active }: { active: boolean }) {
  const c = active ? '#E8A33D' : '#9498A0'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="5.5" width="16" height="14" rx="2" stroke={c} strokeWidth="1.8" />
      <path d="M4 10h16M8 3.5v3M16 3.5v3" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function TimerIcon({ active }: { active: boolean }) {
  const c = active ? '#E8A33D' : '#9498A0'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="13" r="7.5" stroke={c} strokeWidth="1.8" />
      <path d="M12 13V9M9.5 3.5h5M12 13l3 2" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function SparkleIcon({ active }: { active: boolean }) {
  const c = active ? '#E8A33D' : '#9498A0'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3.5 13.6 9 19 12l-5.4 3 -1.6 5.5L10.4 15 5 12l5.4-3z"
        stroke={c}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function HeartIcon({ active }: { active: boolean }) {
  const c = active ? '#E8A33D' : '#9498A0'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 20s-7-4.35-9.5-9C.9 7.5 3 4 6.5 4c2 0 3.3 1.1 5.5 3.2C14.2 5.1 15.5 4 17.5 4 21 4 23.1 7.5 21.5 11c-2.5 4.65-9.5 9-9.5 9z"
        stroke={c}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}
