'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="th">
      <body style={{ background: '#14161A', color: '#F3F0E8', fontFamily: 'sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 18, marginBottom: 8 }}>เกิดข้อผิดพลาดที่ไม่คาดคิด</p>
            <p style={{ fontSize: 13, color: '#9498A0' }}>โหลดแอปใหม่อีกครั้ง</p>
          </div>
        </div>
      </body>
    </html>
  )
}
