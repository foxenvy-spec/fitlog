'use client'

import { useEffect, useRef } from 'react'

interface WakeLockSentinelLike {
  release: () => Promise<void>
}
interface NavigatorWithWakeLock {
  wakeLock: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

// กันหน้าจอดับ/ล็อกอัตโนมัติขณะตัวจับเวลากำลังทำงาน
export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    let cancelled = false

    async function requestLock() {
      try {
        const nav = navigator as unknown as NavigatorWithWakeLock
        if (!nav.wakeLock) return
        const sentinel = await nav.wakeLock.request('screen')
        if (cancelled) {
          sentinel.release().catch(() => {})
        } else {
          sentinelRef.current = sentinel
        }
      } catch {
        // ไม่รองรับ หรือถูกปฏิเสธ — ปล่อยผ่านเงียบๆ
      }
    }

    function releaseLock() {
      sentinelRef.current?.release().catch(() => {})
      sentinelRef.current = null
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible' && active && !sentinelRef.current) {
        requestLock()
      }
    }

    if (active) {
      requestLock()
      document.addEventListener('visibilitychange', handleVisibility)
    } else {
      releaseLock()
    }

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      releaseLock()
    }
  }, [active])
}
