'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import ErrorState from '@/components/ErrorState'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <ErrorState
      title="เกิดข้อผิดพลาด"
      message="มีบางอย่างผิดพลาดในหน้านี้ ลองใหม่อีกครั้ง"
      onRetry={reset}
    />
  )
}
