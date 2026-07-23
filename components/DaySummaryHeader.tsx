import type { DaySummary } from '@/lib/workoutDisplay'
import { formatDuration } from '@/lib/workoutDisplay'
import type { WeightUnit } from '@/lib/weightUnit'

// สรุปภาพรวมของวันนั้นๆ วางไว้บนสุดก่อนรายการท่าออกกำลังกาย ให้รู้ภาพรวมได้ภายใน 2 วินาที
// โดยไม่ต้องไล่อ่านทีละท่า — แต่ละค่าโชว์เป็นตัวเลขใหญ่ + label เล็กด้านล่าง (แทนบรรทัด emoji
// เล็กๆ เดิม) ให้หน้า Calendar/History ดูสมบูรณ์และสแกนตัวเลขสำคัญได้เร็วขึ้น
export default function DaySummaryHeader({
  summary,
  prCount,
  unit,
  toDisplay,
}: {
  summary: DaySummary
  prCount: number
  unit: WeightUnit
  toDisplay: (kg: number) => number
}) {
  const stats: { value: string; label: string }[] = []
  if (summary.caloriesKcal > 0) {
    stats.push({ value: Math.round(summary.caloriesKcal).toLocaleString(), label: 'kcal' })
  }
  if (summary.totalVolumeKg > 0) {
    stats.push({ value: Math.round(toDisplay(summary.totalVolumeKg)).toLocaleString(), label: unit })
  }
  if (summary.durationMin !== null) {
    stats.push({ value: formatDuration(summary.durationMin), label: 'เวลา' })
  }
  stats.push({ value: `${summary.exerciseCount}`, label: summary.exerciseCount === 1 ? 'Exercise' : 'Exercises' })

  return (
    <div className="rounded-lg bg-surface border border-line shadow-elevated px-2 py-3 mb-3">
      <div className="flex items-stretch">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`flex-1 text-center px-2 ${i > 0 ? 'border-l border-line' : ''}`}
          >
            <p className="font-mono text-lg font-bold text-ink tabular leading-tight">{s.value}</p>
            <p className="text-[9px] tracked uppercase text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      {(prCount > 0 || summary.muscleGroups.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 pt-2.5 border-t border-line px-2 text-xs">
          {prCount > 0 && <span className="text-violet">🏆 PR +{prCount}</span>}
          {summary.muscleGroups.length > 0 && <span className="text-muted">💪 {summary.muscleGroups.join(' • ')}</span>}
        </div>
      )}
    </div>
  )
}
