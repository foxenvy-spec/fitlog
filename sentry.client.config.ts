// รันเฉพาะฝั่ง client (browser) — ดักปัญหาที่เกิดตอนผู้ใช้ใช้งานจริง เช่น
// dashboard query ล้มเหลว, unhandled exception ใน component
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // เก็บ trace ตัวอย่างบางส่วนพอ ไม่ต้อง 100% เพื่อประหยัด quota
  tracesSampleRate: 0.2,

  // Session Replay: อัดวิดีโอ session แบบไม่มีข้อมูลส่วนตัว (mask ทุกข้อความ/media)
  // ให้เยอะขึ้นเฉพาะ session ที่มี error เกิดขึ้นจริง จะได้เห็นว่าผู้ใช้เจออะไร
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
})
