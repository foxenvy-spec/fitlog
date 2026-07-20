import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

// รับรูปหน้าจอลู่วิ่ง/นาฬิกา/แอปคาร์ดิโอ แล้วให้ Claude (vision) อ่านตัวเลขออกมาเป็น JSON
// ไม่บันทึกรูปไว้ที่ไหน — ใช้แค่ตอนวิเคราะห์ครั้งเดียวแล้วทิ้ง
// ต้องตั้งค่า ANTHROPIC_API_KEY ใน .env.local (ดู .env.local.example)

const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // เผื่อไว้ก่อนเข้ารหัส base64 (~ไฟล์ต้นฉบับ)
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

const EXTRACTION_SYSTEM_PROMPT = `คุณช่วยอ่านตัวเลขจากรูปหน้าจอของอุปกรณ์ออกกำลังกาย (ลู่วิ่ง, นาฬิกาสมาร์ทวอทช์, แอปเช่น Strava/Garmin/Apple Health)
ตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่นใดๆ ก่อนหรือหลัง ห้ามใช้ backticks
รูปแบบ JSON ที่ต้องตอบ (ใช้ null สำหรับค่าที่หาไม่เจอหรือไม่มั่นใจ):
{
  "cardio_type": string หรือ null (เช่น "วิ่ง", "ปั่นจักรยาน", "ว่ายน้ำ", "เดินเร็ว" — แปลเป็นภาษาไทย),
  "distance_km": number หรือ null,
  "duration_min": number หรือ null,
  "avg_heart_rate": number หรือ null (ชีพจรเฉลี่ย หน่วย bpm),
  "calories_kcal": number หรือ null
}
ถ้ารูปไม่ใช่หน้าจออุปกรณ์ออกกำลังกาย หรืออ่านตัวเลขอะไรไม่ได้เลย ให้ตอบ null ทุกฟิลด์`

interface ExtractedCardioData {
  cardio_type: string | null
  distance_km: number | null
  duration_min: number | null
  avg_heart_rate: number | null
  calories_kcal: number | null
}

function coerceNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return null
}

function coerceResult(raw: unknown): ExtractedCardioData {
  const obj = (raw ?? {}) as Record<string, unknown>
  return {
    cardio_type: typeof obj.cardio_type === 'string' && obj.cardio_type.trim() !== '' ? obj.cardio_type.trim() : null,
    distance_km: coerceNumber(obj.distance_km),
    duration_min: coerceNumber(obj.duration_min),
    avg_heart_rate: coerceNumber(obj.avg_heart_rate),
    calories_kcal: coerceNumber(obj.calories_kcal),
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

  let body: { image?: string; mediaType?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 })
  }

  const { image, mediaType } = body
  if (!image || typeof image !== 'string') {
    return NextResponse.json({ error: 'ไม่พบรูปที่ส่งมา' }, { status: 400 })
  }
  if (image.length > MAX_IMAGE_BYTES * 1.4) {
    // base64 ใหญ่กว่าไฟล์ต้นฉบับราว 1.37 เท่า
    return NextResponse.json({ error: 'ไฟล์รูปใหญ่เกินไป' }, { status: 400 })
  }
  const safeMediaType = ALLOWED_MEDIA_TYPES.includes(mediaType as (typeof ALLOWED_MEDIA_TYPES)[number])
    ? (mediaType as (typeof ALLOWED_MEDIA_TYPES)[number])
    : 'image/jpeg'

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 300,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: safeMediaType, data: image } },
            { type: 'text', text: 'อ่านตัวเลขจากรูปนี้แล้วตอบเป็น JSON ตามรูปแบบที่กำหนด' },
          ],
        },
      ],
    })

    const textBlock = response.content.find((c) => c.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('ไม่ได้รับข้อความตอบกลับ')
    }

    const cleaned = textBlock.text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return NextResponse.json(coerceResult(parsed))
  } catch (err) {
    console.error('analyze-cardio-photo error', err)
    return NextResponse.json({ error: 'วิเคราะห์รูปไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 500 })
  }
}
