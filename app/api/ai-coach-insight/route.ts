import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// AI Coach "เชิงลึก" — ต่างจาก lib/aiCoach.ts (rule-based ล้วน, ไม่เรียก AI ภายนอก) ตัวนี้ส่งค่าที่
// คำนวณไว้แล้วฝั่ง client (recovery, push/pull balance, progressive overload ฯลฯ) ไปให้ Gemini
// เรียบเรียงเป็นคำแนะนำภาษาธรรมชาติ — "ส่งเฉพาะตัวเลขสรุปที่คำนวณแล้ว" (ไม่ใช่ raw workout rows ทั้งหมด)
// ทั้งเพื่อประหยัด token และไม่ส่งข้อมูลดิบเกินจำเป็นออกนอกระบบ
// เป็น opt-in (ผู้ใช้กดปุ่มขอเอง) ไม่เรียกอัตโนมัติทุกครั้งที่เปิดหน้า — กันชนโควต้าฟรีของ Gemini
// เหมือนที่ analyze-cardio-photo-gemini/route.ts ออกแบบไว้ ถ้าเรียกไม่สำเร็จ ฝั่ง client จะ fallback
// กลับไปใช้ rule-based summary เดิมเสมอ (ดู CoachPage) — ฟีเจอร์นี้พังแล้วหน้าไม่พังตาม

const GEMINI_MODEL = 'gemini-3.5-flash'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const SYSTEM_PROMPT = `คุณคือผู้ช่วยโค้ชฟิตเนสของแอป FITLOG พูดภาษาไทย น้ำเสียงให้กำลังใจ กระชับ ตรงประเด็น
กติกาสำคัญ:
- ใช้ข้อมูลที่ให้มาเท่านั้น ห้ามเดา/แต่งตัวเลขหรือชื่อท่าที่ไม่มีในข้อมูล
- ห้ามให้คำแนะนำทางการแพทย์ (เช่น การบาดเจ็บ, อาการปวด, โภชนาการเชิงคลินิก) — ถ้าข้อมูลชวนคิดเรื่องนี้ ให้แนะนำปรึกษาผู้เชี่ยวชาญแทน
- ตอบเป็นข้อความล้วน ไม่ใช้ markdown, ไม่ใช้ bullet, ไม่เกิน 3-4 ประโยค
- ถ้าข้อมูลไม่พอให้วิเคราะห์อะไรเลย ให้บอกตรงๆ ว่ายังไม่มีข้อมูลพอ พร้อมชวนบันทึกเพิ่ม`

interface CoachInsightPayload {
  muscleRecommendation: { muscleGroup: string; pct: number } | null
  balance: { pushSets: number; pullSets: number; ratio: number | null; status: string }
  overloadPlans: {
    exerciseName: string
    action: string
    currentWeight: number
    currentReps: number
    targetWeight: number
    targetReps: number
    avgRpe: number | null
  }[]
  skippedExercises: string[] | null
  streak: number
  todayProgressPct: number | null
}

function buildUserPrompt(p: CoachInsightPayload): string {
  const lines: string[] = []
  lines.push(`Streak ปัจจุบัน: ${p.streak} วันติดต่อกัน`)
  lines.push(`ความคืบหน้าของแผนวันนี้: ${p.todayProgressPct === null ? 'ไม่มีแผนกำหนดไว้วันนี้' : `${p.todayProgressPct}%`}`)

  if (p.muscleRecommendation) {
    lines.push(`กล้ามเนื้อที่ฟื้นตัวมากที่สุด (แนะนำเทรนต่อไป): ${p.muscleRecommendation.muscleGroup} (ฟื้นตัวแล้ว ${p.muscleRecommendation.pct}%)`)
  } else {
    lines.push('ยังไม่มีข้อมูล recovery พอให้แนะนำกล้ามเนื้อ')
  }

  if (p.balance.status === 'insufficient_data') {
    lines.push('สมดุล Push/Pull สัปดาห์นี้: ข้อมูลยังไม่พอ')
  } else {
    lines.push(
      `สมดุล Push/Pull สัปดาห์นี้: Push ${p.balance.pushSets} เซ็ต, Pull ${p.balance.pullSets} เซ็ต (สถานะ: ${p.balance.status})`
    )
  }

  if (p.overloadPlans.length > 0) {
    const planLines = p.overloadPlans
      .map((pl) => `${pl.exerciseName} → ${pl.action} (ปัจจุบัน ${pl.currentWeight}kg×${pl.currentReps}, เป้าหมาย ${pl.targetWeight}kg×${pl.targetReps}${pl.avgRpe !== null ? `, RPE เฉลี่ย ${pl.avgRpe}` : ''})`)
      .join('; ')
    lines.push(`แผน Progressive Overload ที่คำนวณไว้: ${planLines}`)
  } else {
    lines.push('ยังไม่มีแผน Progressive Overload (ข้อมูลไม่พอ)')
  }

  if (p.skippedExercises && p.skippedExercises.length > 0) {
    lines.push(`ท่าที่ข้ามไปในเซสชันโปรแกรมล่าสุด: ${p.skippedExercises.join(', ')}`)
  }

  return `ข้อมูลสรุปของผู้ใช้ (คำนวณไว้แล้ว ไม่ใช่ข้อมูลดิบ):\n${lines.join('\n')}\n\nช่วยเรียบเรียงเป็นคำแนะนำสั้นๆ ให้กำลังใจ ตามกติกาที่กำหนด`
}

export async function POST(req: NextRequest) {
  // ต้องล็อกอินก่อน — กันคนนอกยิงมาใช้โควต้าฟรีของเราหมด (เหมือน analyze-cardio-photo-gemini)
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

  let payload: CoachInsightPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 })
  }

  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: buildUserPrompt(payload) }] }],
        generationConfig: {
          responseMimeType: 'text/plain',
          // ตัดความคิด (thinking) ให้ต่ำสุด — งานนี้แค่เรียบเรียงข้อความสั้นๆ จากข้อมูลที่ให้ไปแล้ว
          // ไม่ต้องคิดซับซ้อน ประหยัดทั้ง latency และโควต้า token
          thinkingConfig: { thinkingLevel: 'low' },
          maxOutputTokens: 512,
        },
      }),
    })

    if (!res.ok) {
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

    return NextResponse.json({ message: text.trim() })
  } catch (err) {
    console.error('ai-coach-insight error', err)
    return NextResponse.json({ error: 'ขอคำแนะนำจาก AI ไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 500 })
  }
}
