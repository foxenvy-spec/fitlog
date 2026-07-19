'use client'

import { useEffect, useState } from 'react'

// แถบที่ค่อยๆ "เติม" จาก 0% ไปหาค่าจริงตอน mount (แทนที่จะโผล่มาที่ความกว้างสุดท้ายทันที)
// ใช้ double requestAnimationFrame เพื่อให้เบราว์เซอร์วาดเฟรมที่ width=0 ก่อน แล้วค่อยเปลี่ยน
// เป็นค่าจริงในเฟรมถัดไป — วิธีนี้การันตีว่า CSS transition จะเล่นจริง ต่างจาก setState เฉยๆ
// ที่ React อาจ batch จนข้ามเฟรม 0 ไปเลย
export default function AnimatedBarFill({
  pct,
  color,
  className = 'h-full rounded-full transition-all duration-700 ease-out',
}: {
  pct: number
  color: string
  className?: string
}) {
  const [width, setWidth] = useState(0)
  const clamped = Math.max(0, Math.min(100, pct))

  useEffect(() => {
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setWidth(clamped))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [clamped])

  return <div className={className} style={{ width: `${width}%`, backgroundColor: color }} />
}
