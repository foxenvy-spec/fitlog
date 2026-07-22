'use client'

// หน้า "Train" — ฮับรวมทุกอย่างที่เกี่ยวกับการเล่นเวิร์กเอาต์ไว้ที่เดียว แทนที่การกระจาย
// บันทึก/โปรแกรม/เทมเพลต/ไทม์เมอร์ ไว้เป็นแท็บแยกใน bottom nav (ของเดิมมี 8 แท็บ แน่นเกินไป)
// เส้นทางเดิม (/log, /session, /program, /templates, /timer, /exercises) ยังใช้งานได้ปกติ
// หน้านี้แค่รวมทางเข้าไว้ให้เจอง่ายขึ้นเท่านั้น

const PRIMARY = [
  {
    href: '/session',
    icon: '▶',
    title: 'เริ่ม / ไปต่อ เวิร์กเอาต์',
    desc: 'เล่นตามโปรแกรมที่ตั้งไว้วันนี้',
  },
  {
    href: '/log',
    icon: '✚',
    title: 'บันทึกด้วยตัวเอง',
    desc: 'จดเซ็ต น้ำหนัก คาร์ดิโอ แบบอิสระ',
  },
]

const SECONDARY = [
  { href: '/program', icon: '📅', label: 'โปรแกรม' },
  { href: '/templates', icon: '📋', label: 'เทมเพลต' },
  { href: '/timer', icon: '⏱', label: 'ไทม์เมอร์' },
  { href: '/exercises', icon: '🏋', label: 'คลังท่าออกกำลัง' },
]

export default function TrainPage() {
  return (
    <div className="space-y-5 pb-4">
      <div>
        <p className="text-[10px] tracked uppercase text-muted">Train</p>
        <h1 className="font-display text-xl tracked uppercase text-ink">เริ่มเล่นเลย</h1>
      </div>

      <div className="space-y-2.5">
        {PRIMARY.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="block rounded-xl bg-surface border border-line shadow-elevated px-4 py-4 active:scale-[0.99] transition"
          >
            <div className="flex items-center gap-3">
              <span className="shrink-0 w-10 h-10 rounded-full bg-amber/15 text-amber flex items-center justify-center text-lg">
                {item.icon}
              </span>
              <div className="min-w-0">
                <p className="font-display tracked uppercase text-ink text-sm">{item.title}</p>
                <p className="text-[11px] text-muted mt-0.5 truncate">{item.desc}</p>
              </div>
            </div>
          </a>
        ))}
      </div>

      <div>
        <p className="text-[10px] tracked uppercase text-muted mb-2">เครื่องมือ</p>
        <div className="grid grid-cols-2 gap-2.5">
          {SECONDARY.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg bg-surface border border-line shadow-elevated flex flex-col items-center justify-center gap-1.5 py-5 text-muted hover:text-amber hover:border-amber/50 transition"
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[10px] font-display tracked uppercase">{item.label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
