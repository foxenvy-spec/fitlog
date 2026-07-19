'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query'
import * as Sentry from '@sentry/nextjs'

// staleTime สั้นพอที่ข้อมูลยังใหม่ แต่ยาวพอที่จะข้าม refetch ตอนสลับแท็บ/กลับมาหน้าเดิม
// gcTime เก็บ cache ไว้เผื่อผู้ใช้กลับมาหน้า dashboard ภายในไม่กี่นาที ไม่ต้องยิง query ซ้ำ
export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        // ดัก error ของทุก query ที่ล้มเหลวไว้ที่จุดเดียว แทนที่จะต้อง try/catch
        // แยกทุกจุดที่เรียก useQuery — Sentry จะรู้ทันทีว่า query ไหนพัง พร้อม queryKey
        // เป็น context ให้สืบต่อได้ว่าเป็นหน้าไหน (dashboard, heatmap, weekly-volume ฯลฯ)
        queryCache: new QueryCache({
          onError: (error, query) => {
            Sentry.captureException(error, {
              tags: { source: 'react-query' },
              extra: { queryKey: query.queryKey },
            })
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  )

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
