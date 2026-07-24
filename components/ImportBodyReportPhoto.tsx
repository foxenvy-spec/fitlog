'use client'

import { useRef, useState } from 'react'

export interface ExtractedBodyReport {
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

const FIELD_LABEL: Record<keyof ExtractedBodyReport, string> = {
  measured_at: 'วันที่',
  height_cm: 'ส่วนสูง',
  weight_kg: 'น้ำหนัก',
  body_fat_pct: 'Body Fat %',
  muscle_kg: 'Muscle',
  body_fat_kg: 'มวลไขมัน',
  body_water_kg: 'น้ำในร่างกาย',
  inorganic_salt_kg: 'เกลือแร่',
  protein_kg: 'โปรตีน',
  skeletal_muscle_kg: 'กล้ามเนื้อโครงร่าง',
  visceral_fat_grade: 'ไขมันช่องท้อง',
  bmr_kcal: 'BMR',
  weight_range_low: 'ช่วงน้ำหนัก ต่ำสุด',
  weight_range_high: 'ช่วงน้ำหนัก สูงสุด',
  skeletal_muscle_range_low: 'ช่วงกล้ามเนื้อโครงร่าง ต่ำสุด',
  skeletal_muscle_range_high: 'ช่วงกล้ามเนื้อโครงร่าง สูงสุด',
  fat_mass_range_low: 'ช่วงมวลไขมัน ต่ำสุด',
  fat_mass_range_high: 'ช่วงมวลไขมัน สูงสุด',
  body_age_years: 'อายุร่างกาย',
  body_age_range_low: 'ช่วงอายุร่างกาย ต่ำสุด',
  body_age_range_high: 'ช่วงอายุร่างกาย สูงสุด',
  muscle_range_low: 'ช่วงมวลกล้ามเนื้อ ต่ำสุด',
  muscle_range_high: 'ช่วงมวลกล้ามเนื้อ สูงสุด',
  body_water_range_low: 'ช่วงน้ำในร่างกาย ต่ำสุด',
  body_water_range_high: 'ช่วงน้ำในร่างกาย สูงสุด',
  inorganic_salt_range_low: 'ช่วงเกลือแร่ ต่ำสุด',
  inorganic_salt_range_high: 'ช่วงเกลือแร่ สูงสุด',
  protein_range_low: 'ช่วงโปรตีน ต่ำสุด',
  protein_range_high: 'ช่วงโปรตีน สูงสุด',
  bone_mass_kg: 'มวลกระดูก',
  bone_mass_range_low: 'ช่วงมวลกระดูก ต่ำสุด',
  bone_mass_range_high: 'ช่วงมวลกระดูก สูงสุด',
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'))
    reader.readAsDataURL(file)
  })
}

// รูปที่ใช้ได้ดี: รายงานเครื่องชั่งวิเคราะห์องค์ประกอบร่างกาย เช่น Fitdays, InBody, Omron, Xiaomi
// เลือกได้หลายรูปพร้อมกัน (เช่น รายงาน 2 หน้า) ระบบจะรวมข้อมูลให้อัตโนมัติ — ไม่เก็บรูปไว้ ใช้แค่ตอนวิเคราะห์ครั้งเดียว
export default function ImportBodyReportPhoto({ onExtracted }: { onExtracted: (data: ExtractedBodyReport) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [foundFields, setFoundFields] = useState<(keyof ExtractedBodyReport)[] | null>(null)

  async function handleFiles(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList).slice(0, 4) : []
    if (files.length === 0) return
    setError(null)
    setFoundFields(null)
    setPreviews(files.map((f) => URL.createObjectURL(f)))
    setAnalyzing(true)
    try {
      const images = await Promise.all(
        files.map(async (file) => ({
          data: await fileToBase64(file),
          mediaType: file.type || 'image/jpeg',
        }))
      )
      const res = await fetch('/api/analyze-body-report-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errBody?.error ?? 'วิเคราะห์รูปไม่สำเร็จ')
      }
      const data: ExtractedBodyReport = await res.json()
      const found = (Object.keys(data) as (keyof ExtractedBodyReport)[]).filter((k) => data[k] !== null)
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

  return (
    <div className="rounded-lg border border-line border-dashed bg-surface2/50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-ink">นำเข้าจากรูปรายงาน</p>
          <p className="text-[10px] text-muted">ถ่าย/แนบรายงานเครื่องชั่ง (Fitdays, InBody ฯลฯ) เลือกได้หลายรูปถ้ามีหลายหน้า</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={analyzing}
          className="text-[11px] shrink-0 border border-line rounded px-2.5 py-1.5 text-ink hover:border-ink/40 disabled:opacity-60"
        >
          {analyzing ? 'กำลังอ่าน...' : previews.length > 0 ? 'เปลี่ยนรูป' : '📷 เลือกรูป'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {previews.length > 0 && (
        <div className="mt-2 flex items-start gap-2">
          <div className="flex gap-1.5 shrink-0">
            {previews.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="รูปที่นำเข้า" className="w-14 h-14 object-cover rounded border border-line" />
            ))}
          </div>
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
