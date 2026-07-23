import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// เหมือน app/api/analyze-cardio-photo/route.ts (เวอร์ชัน Claude) ทุกอย่าง ต่างแค่เรียก
// Gemini API แทน — ใช้ free tier ของ Google AI Studio ไม่มีค่าใช้จ่าย (ในโควต้าที่กำหนด)
// ไม่ต้องติดตั้ง SDK เพิ่ม เรียกผ่าน REST ตรงๆ ด้วย fetch
// ต้องตั้งค่า GEMINI_API_KEY ใน .env.local (เอาคีย์ฟรีจาก https://aistudio.google.com/apikey)

const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // เผื่อไว้ก่อนเข้ารหัส base64 (~ไฟล์ต้นฉบับ)
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

// gemini-3.5-flash: อยู่ใน free tier ของ Google AI Studio ณ ปัจจุบัน (เช็คโควต้าจริงได้ที่
// aistudio.google.com — Google ปรับโควต้า/เลิกซัพพอร์ตโมเดลได้โดยไม่แจ้งล่วงหน้า ถ้าเจอ error
// 404 "no longer available" อีกในอนาคต ให้เช็ค https://ai.google.dev/gemini-api/docs/deprecations
// แล้วเปลี่ยนชื่อโมเดลตรงนี้) ถ้าจะประหยัดโควต้ามากขึ้นอีก เปลี่ยนเป็น 'gemini-3.1-flash-lite' ได้
// แลกกับความแม่นยำที่ลดลงเล็กน้อย
const GEMINI_MODEL = 'gemini-3.5-flash'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const EXTRACTION_SYSTEM_PROMPT = `คุณช่วยอ่านตัวเลขจากรูปหน้าจอของอุปกรณ์ออกกำลังกาย (ลู่วิ่ง, นาฬิกาสมาร์ทวอทช์, แอปเช่น Strava/Garmin/Apple Health)
อ่านค่าที่เห็นในรูปแล้วตอบตาม schema ที่กำหนด ใช้ null สำหรับค่าที่หาไม่เจอหรือไม่มั่นใจ
cardio_type ให้แปลเป็นภาษาไทย (เช่น "วิ่ง", "ปั่นจักรยาน", "ว่ายน้ำ", "เดินเร็ว")
cadence คืออัตราก้าว/นาที (วิ่ง/เดิน) หรือรอบขา/นาที (ปั่นจักรยาน) — บางอุปกรณ์เรียกว่า "cadence" หรือ "steps/min" หรือ "rpm"
ถ้ารูปไม่ใช่หน้าจออุปกรณ์ออกกำลังกาย หรืออ่านตัวเลขอะไรไม่ได้เลย ให้ตอบ null ทุกฟิลด์`

// responseSchema บังคับให้ Gemini ตอบ JSON ตรงตามโครงสร้างนี้เสมอ (structured output)
// ต่างจากฝั่ง Claude ที่ต้อง parse ข้อความเอง — ความเสี่ยง JSON.parse พังจึงต่ำกว่า
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    cardio_type: { type: 'STRING', nullable: true },
    distance_km: { type: 'NUMBER', nullable: true },
    duration_min: { type: 'NUMBER', nullable: true },
    avg_heart_rate: { type: 'NUMBER', nullable: true },
    calories_kcal: { type: 'NUMBER', nullable: true },
    cadence: { type: 'NUMBER', nullable: true },
  },
  required: ['cardio_type', 'distance_km', 'duration_min', 'avg_heart_rate', 'calories_kcal', 'cadence'],
}

interface ExtractedCardioData {
  cardio_type: string | null
  distance_km: number | null
  duration_min: number | null
  avg_heart_rate: number | null
  calories_kcal: number | null
  cadence: number | null
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
    cadence: coerceNumber(obj.cadence),
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
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: EXTRACTION_SYSTEM_PROMPT }] },
        contents: [
          {
            role: 'user',
            parts: [
              { inline_data: { mime_type: safeMediaType, data: image } },
              { text: 'อ่านตัวเลขจากรูปนี้แล้วตอบกลับเป็น JSON object ล้วนๆ ตาม schema ที่กำหนดเท่านั้น ห้ามมีข้อความอื่นนำหน้าหรือต่อท้าย JSON' },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          // gemini-3.5-flash (ตระกูล Gemini 3) คิดก่อนตอบ (thinking) เป็นค่าเริ่มต้น และ thinking
          // tokens จะถูกหักออกจาก maxOutputTokens ด้วย — ถ้าตั้งค่าไม่พอ JSON จะถูกตัดครึ่งก่อนจบ
          // (ต่างจาก Gemini 2.5 ตรงที่ Gemini 3 Flash ปิด thinking แบบเต็มไม่ได้ ใช้ thinkingLevel
          // แทน thinkingBudget) เลยลดระดับการคิดลงเป็น 'low' และเผื่อ token ให้เยอะขึ้นเป็นเซฟตี้
          thinkingConfig: { thinkingLevel: 'low' },
          maxOutputTokens: 2048,
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
      // เกิดได้ถ้า Gemini บล็อกรูปด้วย safety filter — candidates ว่างแต่ promptFeedback จะมีเหตุผล
      const blockReason = data?.promptFeedback?.blockReason
      throw new Error(blockReason ? `Blocked: ${blockReason}` : 'ไม่ได้รับข้อความตอบกลับ')
    }

    // บางโมเดล (เช่น gemini-3.5-flash) บางครั้งแถมข้อความนำหน้า/ต่อท้าย JSON มาด้วย
    // ทั้งที่ตั้ง responseMimeType/responseSchema ไว้แล้ว — ตัดเอาเฉพาะช่วง { ... } ออกมาก่อน parse
    // กันเหนียวไว้แทนที่จะเชื่อว่า text จะเป็น JSON ล้วนๆ เสมอ
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
    console.error('analyze-cardio-photo-gemini error', err)
    return NextResponse.json({ error: 'วิเคราะห์รูปไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 500 })
  }
}
