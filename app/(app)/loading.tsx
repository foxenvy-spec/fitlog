import Skeleton from '@/components/Skeleton'

// เป็น fallback ตอน Next.js กำลังเรนเดอร์ (app)/layout.tsx (ซึ่ง await supabase.auth.getUser()
// อยู่) — โชว์ตอนเข้าเว็บครั้งแรก/รีเฟรชหน้า ไม่ใช่ตอนสลับหน้าไปมาในแอป เพราะ layout ไม่ได้
// re-run ทุกครั้งที่เปลี่ยนหน้า ส่วน loading ระหว่างดึงข้อมูลจริงของแต่ละหน้า (client-side fetch)
// ยังคงเป็นหน้าที่ของ Skeleton/ErrorState ในตัวหน้านั้นๆ เหมือนเดิม
export default function AppLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-40" />
      </div>
      <div className="rounded-lg bg-surface border border-line px-4 py-3.5 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-2/3" />
      </div>
      <div className="rounded-lg bg-surface border border-line px-4 py-3.5 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    </div>
  )
}
