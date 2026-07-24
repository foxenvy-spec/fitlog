import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// เหมือน app/api/analyze-body-report/route.ts (เวอร์ชัน Claude) ทุกอย่าง ต่างแค่เรียก
// Gemini API แทน — ใช้ free tier ของ Google AI Studio ไม่มีค่าใช้จ่าย (ในโควต้าที่กำหนด)
// ไม่ต้องติดตั้ง SDK เพิ่ม เรียกผ่าน REST ตรงๆ ด้วย fetch
// ต้องตั้งค่า GEMINI_API_KEY ใน .env.local (เอาคีย์ฟรีจาก https://aistudio.google.com/apikey)
// — คีย์เดียวกับที่ analyze-cardio-photo-gemini ใช้อยู่แล้ว ไม่ต้องตั้งใหม่

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_IMAGES = 4
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

const GEMINI_MODEL = 'gemini-3.5-flash'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const EXTRACTION_SYSTEM_PROMPT = `คุณช่วยอ่านตัวเลขจากรูปรายงานเครื่องชั่งวิเคราะห์องค์ประกอบร่างกาย (เช่น Fitdays, InBody, Omron, Xiaomi, Renpho)
อาจได้รับรูปมากกว่า 1 รูปซึ่งเป็นรายงานฉบับเดียวกันคนละหน้า — ให้รวมข้อมูลจากทุกรูปเป็นชุดเดียว ถ้าค่าขัดแย้งกันให้เลือกค่าที่ชัดเจน/อ่านง่ายกว่า
หน่วยน้ำหนักทั้งหมดในรายงานเป็นกิโลกรัม (kg) ให้ตอบค่าเป็น kg เสมอไม่ว่าจะแสดงหน่วยอะไรในรูป
measured_at คือวันที่ชั่ง แปลงเป็นรูปแบบ YYYY-MM-DD เสมอ (เช่น จาก "Jul.13,2026" ให้เป็น "2026-07-13")
visceral_fat_grade คือ Visceral fat grade, bmr_kcal คือ Basal metabolic rate, body_age_years คือ Body age/อายุร่างกาย
ช่วง *_range_low / *_range_high มาจากตาราง Muscle fat analysis หรือ Overall analysis ช่วง Standard (Low–High) ของน้ำหนัก/กล้ามเนื้อโครงร่าง/มวลไขมัน/มวลกล้ามเนื้อ/อายุร่างกาย/น้ำในร่างกาย/เกลือแร่/โปรตีน ตามลำดับ
ใช้ null สำหรับค่าที่หาไม่เจอหรือไม่มั่นใจ ถ้ารูปไม่ใช่รายงานองค์ประกอบร่างกาย หรืออ่านตัวเลขอะไรไม่ได้เลย ให้ตอบ null ทุกฟิลด์`

// responseSchema บังคับให้ Gemini ตอบ JSON ตรงตามโครงสร้างนี้เสมอ (structured output)
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    measured_at: { type: 'STRING', nullable: true },
    height_cm: { type: 'NUMBER', nullable: true },
    weight_kg: { type: 'NUMBER', nullable: true },
    body_fat_pct: { type: 'NUMBER', nullable: true },
    muscle_kg: { type: 'NUMBER', nullable: true },
    body_fat_kg: { type: 'NUMBER', nullable: true },
    body_water_kg: { type: 'NUMBER', nullable: true },
    inorganic_salt_kg: { type: 'NUMBER', nullable: true },
    protein_kg: { type: 'NUMBER', nullable: true },
    skeletal_muscle_kg: { type: 'NUMBER', nullable: true },
    visceral_fat_grade: { type: 'NUMBER', nullable: true },
    bmr_kcal: { type: 'NUMBER', nullable: true },
    weight_range_low: { type: 'NUMBER', nullable: true },
    weight_range_high: { type: 'NUMBER', nullable: true },
    skeletal_muscle_range_low: { type: 'NUMBER', nullable: true },
    skeletal_muscle_range_high: { type: 'NUMBER', nullable: true },
    fat_mass_range_low: { type: 'NUMBER', nullable: true },
    fat_mass_range_high: { type: 'NUMBER', nullable: true },
    body_age_years: { type: 'NUMBER', nullable: true },
    body_age_range_low: { type: 'NUMBER', nullable: true },
    body_age_range_high: { type: 'NUMBER', nullable: true },
    muscle_range_low: { type: 'NUMBER', nullable: true },
    muscle_range_high: { type: 'NUMBER', nullable: true },
    body_water_range_low: { type: 'NUMBER', nullable: true },
    body_water_range_high: { type: 'NUMBER', nullable: true },
    inorganic_salt_range_low: { type: 'NUMBER', nullable: true },
    inorganic_salt_range_high: { type: 'NUMBER', nullable: true },
    protein_range_low: { type: 'NUMBER', nullable: true },
    protein_range_high: { type: 'NUMBER', nullable: true },
    bone_mass_kg: { type: 'NUMBER', nullable: true },
    bone_mass_range_low: { type: 'NUMBER', nullable: true },
    bone_mass_range_high: { type: 'NUMBER', nullable: true },
  },
  required: [
    'measured_at',
    'height_cm',
    'weight_kg',
    'body_fat_pct',
    'muscle_kg',
    'body_fat_kg',
    'body_water_kg',
    'inorganic_salt_kg',
    'protein_kg',
    'skeletal_muscle_kg',
    'visceral_fat_grade',
    'bmr_kcal',
    'weight_range_low',
    'weight_range_high',
    'skeletal_muscle_range_low',
    'skeletal_muscle_range_high',
    'fat_mass_range_low',
    'fat_mass_range_high',
    'body_age_years',
    'body_age_range_low',
    'body_age_range_high',
    'muscle_range_low',
    'muscle_range_high',
    'body_water_range_low',
    'body_water_range_high',
    'inorganic_salt_range_low',
    'inorganic_salt_range_high',
    'protein_range_low',
    'protein_range_high',
    'bone_mass_kg',
    'bone_mass_range_low',
    'bone_mass_range_high',
  ],
}

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
  // ต้องล็อกอินก่อนถึงจะเรียก API นี้ได้ — กันคนนอกยิงมาใช้โควต้าฟรีของเราหมด
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์ — ดู .env.local.example' },
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

  const parts: { inline_data: { mime_type: string; data: string } }[] = []
  for (const img of images) {
    if (!img?.data || typeof img.data !== 'string') {
      return NextResponse.json({ error: 'ไม่พบรูปที่ส่งมา' }, { status: 400 })
    }
    if (img.data.length > MAX_IMAGE_BYTES * 1.4) {
      return NextResponse.json({ error: 'ไฟล์รูปใหญ่เกินไป' }, { status: 400 })
    }
    const safeMediaType = ALLOWED_MEDIA_TYPES.includes(img.mediaType as (typeof ALLOWED_MEDIA_TYPES)[number])
      ? (img.mediaType as (typeof ALLOWED_MEDIA_TYPES)[number])
      : 'image/jpeg'
    parts.push({ inline_data: { mime_type: safeMediaType, data: img.data } })
  }

  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: EXTRACTION_SYSTEM_PROMPT }] },
        contents: [
          {
            role: 'user',
            parts: [
              ...parts,
              {
                text: 'อ่านตัวเลขจากรูปเหล่านี้แล้วตอบกลับเป็น JSON object ล้วนๆ ตาม schema ที่กำหนดเท่านั้น ห้ามมีข้อความอื่นนำหน้าหรือต่อท้าย JSON',
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          // gemini-3.5-flash คิดก่อนตอบ (thinking) เป็นค่าเริ่มต้น และ thinking tokens จะถูกหักออกจาก
          // maxOutputTokens ด้วย — ลดระดับการคิดลงเป็น 'low' และเผื่อ token ให้เยอะขึ้นเป็นเซฟตี้
          // (รายงานมีฟิลด์เยอะกว่าฝั่งคาร์ดิโอ เลยเผื่อ maxOutputTokens ไว้สูงกว่า)
          thinkingConfig: { thinkingLevel: 'low' },
          maxOutputTokens: 3072,
        },
      }),
    })

    if (!res.ok) {
      // 429 = ชนโควต้า free tier ของ Gemini วันนี้/นาทีนี้ — ข้อความแยกไว้ให้รู้สาเหตุชัดๆ
      if (res.status === 429) {
        return NextResponse.json({ error: 'ใช้โควต้าฟรีของ Gemini หมดชั่วคราว ลองใหม่อีกสักครู่' }, { status: 429 })
      }
      const errBody = await res.text().catch(() => '')
      console.error('Gemini API error', res.status, errBody)
      throw new Error(`Gemini API responded ${res.status}`)
    }

    const data = await res.json()
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      const blockReason = data?.promptFeedback?.blockReason
      throw new Error(blockReason ? `Blocked: ${blockReason}` : 'ไม่ได้รับข้อความตอบกลับ')
    }

    // บางโมเดล (เช่น gemini-3.5-flash) บางครั้งแถมข้อความนำหน้า/ต่อท้าย JSON มาด้วย ทั้งที่ตั้ง
    // responseMimeType/responseSchema ไว้แล้ว — ตัดเอาเฉพาะช่วง { ... } ออกมาก่อน parse กันเหนียวไว้
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
      console.error('Gemini response did not contain JSON', text)
      throw new Error('รูปแบบคำตอบจาก Gemini ไม่ถูกต้อง')
    }
    const jsonSlice = text.slice(jsonStart, jsonEnd + 1)

    const parsed = JSON.parse(jsonSlice)
    return NextResponse.json(coerceResult(parsed))
  } catch (err) {
    console.error('analyze-body-report-gemini error', err)
    return NextResponse.json({ error: 'วิเคราะห์รูปไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 500 })
  }
}
