'use client'

// รายการเซ็ตแบบ "กดได้ด้วยนิ้วโป้ง" ทีละเซ็ต — แทนที่ input เซ็ต/reps/น้ำหนักแบบก้อนเดียว
// เดิมที่บังคับให้ reps/น้ำหนักเท่ากันทุกเซ็ต ตอนนี้แต่ละเซ็ตปรับเองได้ เก็บ progress ระหว่างฝึกจริง
// (เช่น drop set 95x8, 95x8, 95x6) และให้ auto-fill ค่าจากเซ็ตก่อนหน้าเวลากด "+" เพิ่มเซ็ตใหม่

export interface SetRow {
  id: string
  reps: string
  weight: string
  done: boolean
}

let nextRowId = 0
export function newSetRow(reps = '', weight = ''): SetRow {
  nextRowId += 1
  return { id: `row-${Date.now()}-${nextRowId}`, reps, weight, done: false }
}

function Stepper({
  value,
  onChange,
  step,
  suffix,
}: {
  value: string
  onChange: (v: string) => void
  step: number
  suffix?: string
}) {
  function bump(delta: number) {
    const cur = value ? Number(value) : 0
    const next = Math.max(0, Math.round((cur + delta) * 10) / 10)
    onChange(String(next))
  }
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => bump(-step)}
        className="w-8 h-8 shrink-0 rounded-full bg-surface2 border border-line text-ink text-sm active:scale-95 transition"
        aria-label="ลด"
      >
        −
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          // เดิมใช้ type="number" — เบราว์เซอร์บางตัวจะรายงาน e.target.value เป็น "" ทันที
          // ที่พิมพ์เลขทศนิยมค้างอยู่ (เช่น "92.") เพราะยังไม่ใช่ตัวเลขที่ valid สมบูรณ์
          // ผลคือ input ถูกเคลียร์กลับเป็นว่างทุกครั้งที่พิมพ์ กลายเป็นพิมพ์เองไม่ได้เลย
          // แก้โดยใช้ type="text" + กรองอักขระเอง: อนุญาตแค่ตัวเลขกับจุดทศนิยมจุดเดียว
          const raw = e.target.value
          if (raw === '' || /^\d*\.?\d*$/.test(raw)) onChange(raw)
        }}
        className="input font-mono text-center w-16 px-1"
      />
      {suffix && <span className="text-[10px] text-muted -ml-0.5">{suffix}</span>}
      <button
        type="button"
        onClick={() => bump(step)}
        className="w-8 h-8 shrink-0 rounded-full bg-surface2 border border-line text-ink text-sm active:scale-95 transition"
        aria-label="เพิ่ม"
      >
        +
      </button>
    </div>
  )
}

export default function SetEntryList({
  rows,
  onChange,
  weightUnit = 'kg',
  weightStep,
}: {
  rows: SetRow[]
  onChange: (rows: SetRow[]) => void
  weightUnit?: 'kg' | 'lb'
  weightStep?: number
}) {
  const step = weightStep ?? (weightUnit === 'lb' ? 5 : 2.5)
  const weightLabel = weightUnit === 'lb' ? 'น้ำหนัก (ปอนด์)' : 'น้ำหนัก (กก.)'

  function updateRow(id: string, patch: Partial<SetRow>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeRow(id: string) {
    onChange(rows.filter((r) => r.id !== id))
  }

  function addSet() {
    // Copy Last Set / Auto Fill: เซ็ตใหม่เอาค่า reps/น้ำหนักจากเซ็ตล่าสุดในรายการมาให้เลย
    // กดครั้งเดียวไม่ต้องพิมพ์ใหม่ ตรงกับ workflow ตอนฝึกจริงที่ทำซ้ำน้ำหนักเดิมบ่อยๆ
    const last = rows[rows.length - 1]
    onChange([...rows, newSetRow(last?.reps ?? '', last?.weight ?? '')])
  }

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="flex items-center gap-2 px-1 text-[10px] tracked uppercase text-muted">
          <span className="w-6 text-center">#</span>
          <span className="flex-1 pl-1">{weightLabel}</span>
          <span className="flex-1 pl-1">Reps</span>
          <span className="w-8 text-center">✓</span>
          <span className="w-6" />
        </div>
      )}
      <ul className="space-y-1.5">
        {rows.map((row, i) => (
          <li
            key={row.id}
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 transition ${
              row.done ? 'bg-steel/10 border-steel' : 'bg-surface border-line'
            }`}
          >
            <span className="w-6 text-center text-xs font-mono text-muted">{i + 1}</span>
            <div className="flex-1">
              <Stepper value={row.weight} onChange={(v) => updateRow(row.id, { weight: v })} step={step} />
            </div>
            <div className="flex-1">
              <Stepper value={row.reps} onChange={(v) => updateRow(row.id, { reps: v })} step={1} />
            </div>
            <button
              type="button"
              onClick={() => updateRow(row.id, { done: !row.done })}
              aria-pressed={row.done}
              aria-label={row.done ? 'เซ็ตนี้เสร็จแล้ว' : 'ทำเซ็ตนี้เสร็จแล้ว'}
              className={`w-8 h-8 shrink-0 rounded-full border text-sm transition active:scale-95 ${
                row.done ? 'bg-steel text-bg border-steel' : 'bg-surface2 border-line text-muted'
              }`}
            >
              ✓
            </button>
            <button
              type="button"
              onClick={() => removeRow(row.id)}
              className="w-6 shrink-0 text-muted hover:text-rust text-xs"
              aria-label="ลบเซ็ตนี้"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={addSet}
        className="w-full rounded-lg border border-dashed border-line text-muted hover:text-amber hover:border-amber/50 transition py-2.5 text-xs font-display tracked uppercase"
      >
        + เพิ่มเซ็ต{rows.length > 0 ? ' (ก็อปจากเซ็ตก่อนหน้า)' : ''}
      </button>
    </div>
  )
}
