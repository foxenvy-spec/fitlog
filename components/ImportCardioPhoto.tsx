'use client'

import { useRef, useState } from 'react'

export interface ExtractedCardioData {
  cardio_type: string | null
  distance_km: number | null
  duration_min: number | null
  avg_heart_rate: number | null
  calories_kcal: number | null
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'))
    reader.readAsDataURL(file)
  })
}

// รูปที่ใช้ได้ดี: หน้าจอลู่วิ่ง/เครื่องคาร์ดิโอ, นาฬิกา/แอปวัดชีพจร (เช่น Strava, Garmin, Apple Health)
// ที่โชว์ระยะทาง เวลา แคลอรี่ หรือชีพจรเฉลี่ยอยู่แล้ว — ระบบไม่เก็บรูปไว้ ใช้แค่ตอนวิเคราะห์ครั้งเดียว
export default function ImportCardioPhoto({ onExtracted }: { onExtracted: (data: ExtractedCardioData) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [foundFields, setFoundFields] = useState<string[] | null>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setFoundFields(null)
    setPreview(URL.createObjectURL(file))
    setAnalyzing(true)
    try {
      const base64 = await fileToBase64(file)
      const res = await fetch('/api/analyze-cardio-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: file.type || 'image/jpeg' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'วิเคราะห์รูปไม่สำเร็จ')
      }
      const data: ExtractedCardioData = await res.json()
      const found = (Object.keys(data) as (keyof ExtractedCardioData)[]).filter((k) => data[k] !== null)
      if (found.length === 0) {
        setError('อ่านค่าจากรูปไม่ได้เลย ลองถ่ายให้เห็นตัวเลขชัดๆ หรือกรอกเองด้านล่าง')
      } else {
        setFoundFields(found)
        onExtracted(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'วิเคราะห์รูปไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setAnalyzing(false)
    }
  }

  const FIELD_LABEL: Record<keyof ExtractedCardioData, string> = {
    cardio_type: 'ประเภท',
    distance_km: 'ระยะทาง',
    duration_min: 'เวลา',
    avg_heart_rate: 'ชีพจรเฉลี่ย',
    calories_kcal: 'แคลอรี่',
  }

  return (
    <div className="rounded-lg border border-line border-dashed bg-surface2/50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-ink">นำเข้าจากรูป</p>
          <p className="text-[10px] text-muted">ถ่ายหน้าจอลู่วิ่ง/นาฬิกา แล้วให้ระบบอ่านตัวเลขให้</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={analyzing}
          className="text-[11px] shrink-0 border border-line rounded px-2.5 py-1.5 text-ink hover:border-ink/40 disabled:opacity-60"
        >
          {analyzing ? 'กำลังอ่าน...' : preview ? 'เปลี่ยนรูป' : '📷 เลือกรูป'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {preview && (
        <div className="mt-2 flex items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="รูปที่นำเข้า" className="w-14 h-14 object-cover rounded border border-line" />
          <div className="flex-1 min-w-0">
            {analyzing && <p className="text-[11px] text-muted">กำลังอ่านตัวเลขจากรูป...</p>}
            {!analyzing && foundFields && (
              <p className="text-[11px] text-moss">
                เติมให้แล้ว: {foundFields.map((f) => FIELD_LABEL[f]).join(', ')} — ตรวจสอบก่อนบันทึก
              </p>
            )}
            {!analyzing && error && <p className="text-[11px] text-rusttext">{error}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
