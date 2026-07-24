import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

// รับรูปรายงานเครื่องชั่งวิเคราะห์องค์ประกอบร่างกาย (เช่น Fitdays, InBody, Omron)
// แล้วให้ Claude (vision) อ่านตัวเลขออกมาเป็น JSON เพื่อเติมฟอร์ม "บันทึกวัดผลใหม่" อัตโนมัติ
// รองรับหลายรูปในคำขอเดียว (เช่น รายงาน 2 หน้า) — ไม่บันทึกรูปไว้ที่ไหน ใช้แค่ตอนวิเคราะห์ครั้งเดียวแล้วทิ้ง
// ต้องตั้งค่า ANTHROPIC_API_KEY ใน .env.local (ดู .env.local.example)

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_IMAGES = 4
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number]

const EXTRACTION_SYSTEM_PROMPT = `คุณช่วยอ่านตัวเลขจากรูปรายงานเครื่องชั่งวิเคราะห์องค์ประกอบร่างกาย (เช่น Fitdays, InBody, Omron, Xiaomi, Renpho)
อาจได้รับรูปมากกว่า 1 รูปซึ่งเป็นรายงานฉบับเดียวกันคนละหน้า — ให้รวมข้อมูลจากทุกรูปเป็นชุดเดียว ถ้าค่าขัดแย้งกันให้เลือกค่าที่ชัดเจน/อ่านง่ายกว่า
ตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่นใดๆ ก่อนหรือหลัง ห้ามใช้ backticks
หน่วยน้ำหนักทั้งหมดในรายงานเป็นกิโลกรัม (kg) ให้ตอบค่าเป็น kg เสมอไม่ว่าจะแสดงหน่วยอะไรในรูป
รูปแบบ JSON ที่ต้องตอบ (ใช้ null สำหรับค่าที่หาไม่เจอหรือไม่มั่นใจ):
{
  "measured_at": string หรือ null (วันที่ชั่ง แปลงเป็นรูปแบบ YYYY-MM-DD เช่น จาก "Jul.13,2026" ให้เป็น "2026-07-13"),
  "height_cm": number หรือ null,
  "weight_kg": number หรือ null,
  "body_fat_pct": number หรือ null (Body fat rate %),
  "muscle_kg": number หรือ null (Muscle mass),
  "body_fat_kg": number หรือ null (Fat mass / Body fat เป็น kg),
  "body_water_kg": number หรือ null,
  "inorganic_salt_kg": number หรือ null,
  "protein_kg": number หรือ null,
  "skeletal_muscle_kg": number หรือ null,
  "visceral_fat_grade": number หรือ null (Visceral fat grade),
  "bmr_kcal": number หรือ null (Basal metabolic rate),
  "weight_range_low": number หรือ null (จากตาราง Muscle fat analysis หรือ Overall analysis ช่วง Standard ของน้ำหนัก ค่าต่ำสุด),
  "weight_range_high": number หรือ null (ค่าสูงสุดของช่วงเดียวกัน),
  "skeletal_muscle_range_low": number หรือ null (ช่วง Standard ของกล้ามเนื้อโครงร่าง/Skeletal muscle ค่าต่ำสุด),
  "skeletal_muscle_range_high": number หรือ null (ค่าสูงสุดของช่วงเดียวกัน),
  "fat_mass_range_low": number หรือ null (ช่วง Standard ของมวลไขมัน/Fat mass ค่าต่ำสุด),
  "fat_mass_range_high": number หรือ null (ค่าสูงสุดของช่วงเดียวกัน),
  "body_age_years": number หรือ null (Body age / อายุร่างกาย),
  "body_age_range_low": number หรือ null (ช่วง Standard ของอายุร่างกาย ค่าต่ำสุด ถ้ามีระบุ),
  "body_age_range_high": number หรือ null (ค่าสูงสุดของช่วงเดียวกัน),
  "muscle_range_low": number หรือ null (ช่วง Standard ของมวลกล้ามเนื้อ/Muscle mass ค่าต่ำสุด),
  "muscle_range_high": number หรือ null (ค่าสูงสุดของช่วงเดียวกัน),
  "body_water_range_low": number หรือ null (ช่วง Standard ของน้ำในร่างกาย ค่าต่ำสุด ถ้ามีระบุ),
  "body_water_range_high": number หรือ null (ค่าสูงสุดของช่วงเดียวกัน),
  "inorganic_salt_range_low": number หรือ null (ช่วง Standard ของเกลือแร่ ค่าต่ำสุด ถ้ามีระบุ),
  "inorganic_salt_range_high": number หรือ null (ค่าสูงสุดของช่วงเดียวกัน),
  "protein_range_low": number หรือ null (ช่วง Standard ของโปรตีน ค่าต่ำสุด ถ้ามีระบุ),
  "protein_range_high": number หรือ null (ค่าสูงสุดของช่วงเดียวกัน),
  "bone_mass_kg": number หรือ null (Bone mass / มวลกระดูก),
  "bone_mass_range_low": number หรือ null (ช่วง Standard ของมวลกระดูก ค่าต่ำสุด ถ้ามีระบุ),
  "bone_mass_range_high": number หรือ null (ค่าสูงสุดของช่วงเดียวกัน)
}
ถ้ารูปไม่ใช่รายงานองค์ประกอบร่างกาย หรืออ่านตัวเลขอะไรไม่ได้เลย ให้ตอบ null ทุกฟิลด์`

interface ExtractedBodyReport {
  measured_at: string | null
  height_cm: number | null
  weight_kg: number | null
  body_fat_pct: number | null
  muscle_kg: number | null
  body_fat_kg: number | null
  body_water_kg: number | null
  inorganic_salt_kg: number | null
  protein_kg: number | null
  skeletal_muscle_kg: number | null
  visceral_fat_grade: number | null
  bmr_kcal: number | null
  weight_range_low: number | null
  weight_range_high: number | null
  skeletal_muscle_range_low: number | null
  skeletal_muscle_range_high: number | null
  fat_mass_range_low: number | null
  fat_mass_range_high: number | null
  body_age_years: number | null
  body_age_range_low: number | null
  body_age_range_high: number | null
  muscle_range_low: number | null
  muscle_range_high: number | null
  body_water_range_low: number | null
  body_water_range_high: number | null
  inorganic_salt_range_low: number | null
  inorganic_salt_range_high: number | null
  protein_range_low: number | null
  protein_range_high: number | null
  bone_mass_kg: number | null
  bone_mass_range_low: number | null
  bone_mass_range_high: number | null
}

function coerceNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function coerceDate(v: unknown): string | null {
  if (typeof v === 'string' && DATE_RE.test(v.trim())) return v.trim()
  return null
}

function coerceResult(raw: unknown): ExtractedBodyReport {
  const obj = (raw ?? {}) as Record<string, unknown>
  return {
    measured_at: coerceDate(obj.measured_at),
    height_cm: coerceNumber(obj.height_cm),
    weight_kg: coerceNumber(obj.weight_kg),
    body_fat_pct: coerceNumber(obj.body_fat_pct),
    muscle_kg: coerceNumber(obj.muscle_kg),
    body_fat_kg: coerceNumber(obj.body_fat_kg),
    body_water_kg: coerceNumber(obj.body_water_kg),
    inorganic_salt_kg: coerceNumber(obj.inorganic_salt_kg),
    protein_kg: coerceNumber(obj.protein_kg),
    skeletal_muscle_kg: coerceNumber(obj.skeletal_muscle_kg),
    visceral_fat_grade: coerceNumber(obj.visceral_fat_grade),
    bmr_kcal: coerceNumber(obj.bmr_kcal),
    weight_range_low: coerceNumber(obj.weight_range_low),
    weight_range_high: coerceNumber(obj.weight_range_high),
    skeletal_muscle_range_low: coerceNumber(obj.skeletal_muscle_range_low),
    skeletal_muscle_range_high: coerceNumber(obj.skeletal_muscle_range_high),
    fat_mass_range_low: coerceNumber(obj.fat_mass_range_low),
    fat_mass_range_high: coerceNumber(obj.fat_mass_range_high),
    body_age_years: coerceNumber(obj.body_age_years),
    body_age_range_low: coerceNumber(obj.body_age_range_low),
    body_age_range_high: coerceNumber(obj.body_age_range_high),
    muscle_range_low: coerceNumber(obj.muscle_range_low),
    muscle_range_high: coerceNumber(obj.muscle_range_high),
    body_water_range_low: coerceNumber(obj.body_water_range_low),
    body_water_range_high: coerceNumber(obj.body_water_range_high),
    inorganic_salt_range_low: coerceNumber(obj.inorganic_salt_range_low),
    inorganic_salt_range_high: coerceNumber(obj.inorganic_salt_range_high),
    protein_range_low: coerceNumber(obj.protein_range_low),
    protein_range_high: coerceNumber(obj.protein_range_high),
    bone_mass_kg: coerceNumber(obj.bone_mass_kg),
    bone_mass_range_low: coerceNumber(obj.bone_mass_range_low),
    bone_mass_range_high: coerceNumber(obj.bone_mass_range_high),
  }
}

export async function POST(req: NextRequest) {
  // ต้องล็อกอินก่อนถึงจะเรียก API นี้ได้ — กันคนนอกยิงมาใช้โควตา Anthropic ของเราฟรีๆ
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY บนเซิร์ฟเวอร์ — ดู .env.local.example' },
      { status: 500 }
    )
  }

  let body: { images?: { data?: string; mediaType?: string }[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 })
  }

  const images = body.images
  if (!Array.isArray(images) || images.length === 0) {
    return NextResponse.json({ error: 'ไม่พบรูปที่ส่งมา' }, { status: 400 })
  }
  if (images.length > MAX_IMAGES) {
    return NextResponse.json({ error: `ส่งรูปได้ไม่เกิน ${MAX_IMAGES} รูปต่อครั้ง` }, { status: 400 })
  }

  const content: Anthropic.MessageParam['content'] = []
  for (const img of images) {
    if (!img?.data || typeof img.data !== 'string') {
      return NextResponse.json({ error: 'ไม่พบรูปที่ส่งมา' }, { status: 400 })
    }
    if (img.data.length > MAX_IMAGE_BYTES * 1.4) {
      return NextResponse.json({ error: 'ไฟล์รูปใหญ่เกินไป' }, { status: 400 })
    }
    const safeMediaType: AllowedMediaType = ALLOWED_MEDIA_TYPES.includes(img.mediaType as AllowedMediaType)
      ? (img.mediaType as AllowedMediaType)
      : 'image/jpeg'
    content.push({ type: 'image', source: { type: 'base64', media_type: safeMediaType, data: img.data } })
  }
  content.push({ type: 'text', text: 'อ่านตัวเลขจากรูปเหล่านี้แล้วตอบเป็น JSON ตามรูปแบบที่กำหนด' })

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 500,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    })

    const textBlock = response.content.find((c) => c.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('ไม่ได้รับข้อความตอบกลับ')
    }

    const cleaned = textBlock.text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return NextResponse.json(coerceResult(parsed))
  } catch (err) {
    console.error('analyze-body-report error', err)
    return NextResponse.json({ error: 'วิเคราะห์รูปไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 500 })
  }
}
