import type { createClient } from './supabase/client'

// ชื่อที่แสดงบน Dashboard (การ์ดทักทายด้านบนสุด) — เก็บใน public.profiles.display_name
// ผู้ใช้ตั้งเองได้ผ่านปุ่มตั้งค่า ⚙️ ที่ Dashboard ถ้าเว้นว่างไว้ (null/สตริงว่าง) แอปจะ
// fallback ไปใช้ชื่อที่ตัดจาก email แทนเหมือนเดิม (ดู emailDisplayName ใน dashboard/page.tsx)

export async function saveDisplayName(
  supabase: ReturnType<typeof createClient>,
  name: string
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('ยังไม่ได้ล็อกอิน')

  const trimmed = name.trim()
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: user.id, display_name: trimmed === '' ? null : trimmed, updated_at: new Date().toISOString() })
  if (error) throw error
}
