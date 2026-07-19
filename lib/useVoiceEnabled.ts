'use client'

import { useCallback, useEffect, useState } from 'react'

const KEY = 'fitlog:voiceCoach'

// เปิด/ปิด Voice Coach — จำค่าไว้ในเครื่อง (localStorage) ข้ามเซสชัน
export function useVoiceEnabled() {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY)
      if (stored !== null) setEnabled(stored === '1')
    } catch {
      // ignore
    }
  }, [])

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(KEY, next ? '1' : '0')
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  return { enabled, toggle }
}
