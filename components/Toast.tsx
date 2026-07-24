'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'

// Feedback Animation แบบ Hevy/Apple ("✓ Saved" ป็อปขึ้นแล้วจางหาย + สั่นเบาๆ) — ก่อนหน้านี้ FITLOG
// มีแค่ปุ่ม "บันทึกแล้ว ✓" เปลี่ยนข้อความชั่วคราวจุดเดียว (ดู log/page.tsx) ทำให้เงียบเกินไปตอนกด
// action อื่นๆ เช่นติ๊กเซ็ตเสร็จระหว่างเซสชัน — ตัวนี้เป็น toast กลางที่เรียกใช้ได้จากทุกหน้า/component
// ที่อยู่ใต้ ToastProvider (ประกาศไว้ที่ app/(app)/layout.tsx ครอบทั้งแอปที่ login แล้ว)

type ToastVariant = 'success' | 'pr'

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const VARIANT_STYLE: Record<ToastVariant, string> = {
  success: 'bg-steel text-bg border-steel',
  // PR (สถิติใหม่) เด่นกว่าการบันทึกทั่วไปหน่อย — ใช้สี amber เดียวกับที่ใช้เน้น PR ที่อื่นในแอป
  pr: 'bg-amber text-bg border-amber',
}

// Haptic feedback — สั่นสั้นๆ ตอนบันทึกสำเร็จ (แนวเดียวกับ Apple/Hevy) มีผลเฉพาะเบราว์เซอร์ที่รองรับ
// navigator.vibrate จริงๆ (ส่วนใหญ่คือ Android Chrome) — iOS Safari ไม่รองรับ API นี้เลยแม้แต่ใน
// PWA ที่ติดตั้งแล้ว ดังนั้นบน iPhone ผู้ใช้จะเห็นแค่ toast โดยไม่มีแรงสั่นไหว ซึ่งไม่ใช่บั๊ก
const VIBRATE_PATTERN: Record<ToastVariant, number | number[]> = {
  success: 15,
  pr: [15, 60, 15],
}

// รวมเวลาที่ toast อยู่บนจอ (ต้องตรงกับ duration ของ keyframe "toast" ใน tailwind.config.js —
// 1.4s = fade-in 150ms + ค้าง 900ms + fade-out 350ms) แก้ที่นี่ต้องแก้ที่นั่นด้วยเสมอ
const TOAST_DURATION_MS = 1400

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const showToast = useCallback((message: string, variant: ToastVariant = 'success') => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(VIBRATE_PATTERN[variant])
    }
    const id = ++nextId
    setToasts((prev) => [...prev, { id, message, variant }])
    timers.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      delete timers.current[id]
    }, TOAST_DURATION_MS)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* fixed เหนือทุกอย่าง (z-50) ไม่กินพื้นที่เลย์เอาต์ — pointer-events-none ทั้งกล่องและตัว toast
          เอง กันไม่ให้บังการแตะปุ่มที่อยู่ข้างใต้ระหว่างที่ toast กำลังจางหาย */}
      <div className="fixed top-0 inset-x-0 z-50 flex flex-col items-center pt-3 gap-2 pointer-events-none safe-top">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast pointer-events-none rounded-full border px-4 py-2 text-xs font-display tracked uppercase shadow-elevated ${VARIANT_STYLE[t.variant]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // เรียกใช้นอก ToastProvider (ไม่ควรเกิดขึ้นถ้า wrap ที่ layout ถูกต้อง) — คืน no-op แทนการ throw
    // กันไม่ให้ทั้งหน้าพังเพราะแค่ฟีเจอร์เสริมเรื่อง feedback animation ไม่ทำงาน
    return { showToast: () => {} }
  }
  return ctx
}
