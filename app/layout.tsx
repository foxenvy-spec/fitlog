import type { Metadata, Viewport } from 'next'
import { Oswald, Kanit, Inter, IBM_Plex_Sans_Thai, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

// tailwind.config.js กำหนด font-display/font-body/font-mono ให้อ้างอิงตัวแปร CSS พวกนี้
// (--font-oswald, --font-kanit, --font-inter, --font-plex-thai, --font-mono) — ต้องประกาศค่าจริง
// ผ่าน next/font ตรงนี้ ไม่งั้นตัวแปรจะไม่มีค่า ทำให้ font-family ทั้งก้อนกลายเป็นค่าที่ใช้ไม่ได้
// (invalid) แล้วเบราว์เซอร์เงียบๆ fallback ไปใช้ font default แทนทั้งแอปโดยไม่มีใครสังเกต
const oswald = Oswald({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-oswald',
  display: 'swap',
})
const kanit = Kanit({
  subsets: ['thai', 'latin'],
  weight: ['500', '600', '700'],
  variable: '--font-kanit',
  display: 'swap',
})
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})
const plexThai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-thai',
  display: 'swap',
})
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

// นี่คือ ROOT layout ของทั้งแอป (ต้องมี <html>/<body> เสมอ — Next.js บังคับ)
// ห้ามลบ/ทับด้วยเนื้อหาของ app/(app)/layout.tsx อีก เพราะจะทำให้หน้าเว็บพังทั้งหมด
// (ไม่มี <html>/<body>, ไม่ได้ import globals.css) — ทำให้ hydrate ไม่ได้และขึ้นจอขาว
export const metadata: Metadata = {
  title: 'FITLOG — บันทึกการออกกำลังกาย',
  description: 'จดรายละเอียดและสถิติการออกกำลังกาย เวทเทรนนิ่งและคาร์ดิโอ',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-512.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#14161A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th" className={`${oswald.variable} ${kanit.variable} ${inter.variable} ${plexThai.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
