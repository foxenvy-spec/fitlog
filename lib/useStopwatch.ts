'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// นาฬิกาจับเวลานับขึ้น ใช้เป็นฐานให้ทุกโหมด (นับขึ้นตรงๆ สำหรับ Stopwatch/AMRAP
// หรือเอา totalMs - elapsedMs สำหรับตัวนับถอยหลัง)
//
// เดิม setElapsedMs ถูกเรียกทุกเฟรม (requestAnimationFrame = ~60 ครั้ง/วินาที) ทำให้ทั้ง
// component tree ของหน้า timer re-render ถี่ตลอดเวลาที่จับเวลา — ระหว่างออกกำลังกายจริง
// หน้าจอมักเปิดค้างไว้นาน (คู่กับ useWakeLock) จุดนี้กินแบตและอาจเห็นอาการกระตุกบนเครื่องรุ่นล่าง
// TimerShell เองก็ทำ progress bar เป็น CSS transition อยู่แล้ว (duration-200) ดังนั้นการอัปเดต
// React state ทุกเฟรมไม่ได้ทำให้ผู้ใช้เห็นอะไรลื่นขึ้นจริง — throttle เหลือ ~10 ครั้ง/วินาทีก็เนียนพอ
const STATE_UPDATE_INTERVAL_MS = 100

export function useStopwatch() {
  const [elapsedMs, setElapsedMs] = useState(0)
  const [running, setRunning] = useState(false)
  const startRef = useRef<number | null>(null)
  const baseRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  // ค่า elapsed แบบ real-time เขียนทุกเฟรม (ref เขียนไม่ trigger re-render จึงไม่มีต้นทุน)
  // ใช้เวลาต้องการค่าแม่นยำ ณ ขณะนั้นจริงๆ โดยไม่ต้องรอรอบ throttle ของ state เช่นตอนกดจับ lap
  const elapsedRef = useRef(0)
  const lastCommitRef = useRef(0)

  const tick = useCallback(() => {
    if (startRef.current !== null) {
      const now = baseRef.current + (Date.now() - startRef.current)
      elapsedRef.current = now
      if (Date.now() - lastCommitRef.current >= STATE_UPDATE_INTERVAL_MS) {
        lastCommitRef.current = Date.now()
        setElapsedMs(now)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    if (running) {
      rafRef.current = requestAnimationFrame(tick)
    }
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [running, tick])

  const start = useCallback(() => {
    setRunning((wasRunning) => {
      if (!wasRunning) startRef.current = Date.now()
      return true
    })
  }, [])

  const pause = useCallback(() => {
    setRunning((wasRunning) => {
      if (wasRunning && startRef.current !== null) {
        baseRef.current += Date.now() - startRef.current
        startRef.current = null
      }
      // flush ค่าสุดท้ายให้ตรงเป๊ะตอนหยุดทันที ไม่ต้องรอรอบ throttle ถัดไป
      elapsedRef.current = baseRef.current
      setElapsedMs(baseRef.current)
      return false
    })
  }, [])

  const reset = useCallback(() => {
    baseRef.current = 0
    elapsedRef.current = 0
    setElapsedMs(0)
    setRunning((wasRunning) => {
      startRef.current = wasRunning ? Date.now() : null
      return wasRunning
    })
  }, [])

  const getElapsedMs = useCallback(() => elapsedRef.current, [])

  return { elapsedMs, running, start, pause, reset, getElapsedMs }
}

export function formatClock(ms: number, showHours = false) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  if (showHours || h > 0) {
    return `${String(h).padStart(2, '0')}:${mm}:${ss}`
  }
  return `${mm}:${ss}`
}

export function formatStopwatch(ms: number) {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  const cs = Math.floor((ms % 1000) / 10)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}
