'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getWeekRange } from '@/lib/dashboardStats'
import { VOLUME_MUSCLES, MUSCLE_GROUP_COLORS, MUSCLE_GROUP_LABELS_EN, type MuscleGroup } from '@/lib/muscle-groups'
import Skeleton from './Skeleton'

// Graphic Muscle Heatmap — ไดอะแกรมรูปร่างคน (วาดเองด้วย SVG ธรรมดา ไม่พึ่ง react-body-highlighter
// เพราะไลบรารีนั้นไม่รองรับกล้ามเนื้อขา) ไล่สีตาม % สัดส่วนเซ็ตของกลุ่มกล้ามเนื้อนั้นเทียบกับ
// เซ็ตทั้งหมดในสัปดาห์นี้ พร้อมด้านหลัง (back view) และรายการท่าที่โดนกลุ่มนั้นบ้าง
type View = 'front' | 'back'

interface GroupStat {
  group: MuscleGroup
  sets: number
  pct: number
  topExercises: { name: string; sets: number }[]
}

// กลุ่มที่ปรากฏในไดอะแกรมของแต่ละมุมมอง — ด้านหน้าไม่มี "หลัง", ด้านหลังไม่มี "อก"/"แกนกลางลำตัว"
const FRONT_REGIONS: MuscleGroup[] = ['ไหล่', 'อก', 'แขน', 'แกนกลางลำตัว', 'ขา']
const BACK_REGIONS: MuscleGroup[] = ['ไหล่', 'หลัง', 'แขน', 'ขา']

// แปลง % ส่วนแบ่งของกลุ่ม เทียบกับเซ็ตรวมทั้งสัปดาห์ ให้เป็นความเข้ม opacity ของสีกลุ่มนั้น
// (เส้นโค้ง: 0% = จาง 12%, ตั้งแต่ ~35% ขึ้นไป = เข้มเต็มที่ เพราะเฉลี่ยแล้ว 6 กลุ่มจะอยู่ราว 16-17% ต่อกลุ่ม)
function intensityOpacity(pct: number): number {
  if (pct <= 0) return 0.12
  return Math.min(1, 0.12 + (pct / 35) * 0.88)
}

export default function WeeklyMuscleHeatmap() {
  const supabase = createClient()
  const { start, end } = getWeekRange()
  const [view, setView] = useState<View>('front')
  const [expanded, setExpanded] = useState<MuscleGroup | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['weekly-muscle-heatmap', start, end],
    queryFn: async () => {
      const { data } = await supabase
        .from('workouts')
        .select('muscle_group, sets, exercise_name')
        .eq('type', 'strength')
        .gte('performed_at', start)
        .lte('performed_at', end)

      const rows = (data as { muscle_group: string | null; sets: number | null; exercise_name: string | null }[]) ?? []
      const setsByGroup: Record<string, number> = {}
      const exercisesByGroup: Record<string, Record<string, number>> = {}
      rows.forEach((r) => {
        if (!r.muscle_group) return
        const sets = r.sets ?? 0
        setsByGroup[r.muscle_group] = (setsByGroup[r.muscle_group] ?? 0) + sets
        const exMap = (exercisesByGroup[r.muscle_group] ??= {})
        const name = r.exercise_name ?? 'ไม่ระบุชื่อท่า'
        exMap[name] = (exMap[name] ?? 0) + sets
      })
      return { setsByGroup, exercisesByGroup }
    },
    staleTime: 60_000,
  })

  const stats: GroupStat[] = useMemo(() => {
    const setsByGroup = data?.setsByGroup ?? {}
    const exercisesByGroup = data?.exercisesByGroup ?? {}
    const totalSets = VOLUME_MUSCLES.reduce((sum, g) => sum + (setsByGroup[g] ?? 0), 0)
    return VOLUME_MUSCLES.map((group) => {
      const sets = setsByGroup[group] ?? 0
      const pct = totalSets > 0 ? (sets / totalSets) * 100 : 0
      const topExercises = Object.entries(exercisesByGroup[group] ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name, exSets]) => ({ name, sets: exSets }))
      return { group, sets, pct, topExercises }
    })
  }, [data])

  const statByGroup = useMemo(() => {
    const map = new Map<MuscleGroup, GroupStat>()
    stats.forEach((s) => map.set(s.group, s))
    return map
  }, [stats])

  const hasAnyData = stats.some((s) => s.sets > 0)
  const regions = view === 'front' ? FRONT_REGIONS : BACK_REGIONS

  function regionStyle(group: MuscleGroup) {
    const stat = statByGroup.get(group)
    const pct = stat?.pct ?? 0
    const color = MUSCLE_GROUP_COLORS[group]
    return {
      fill: color,
      fillOpacity: intensityOpacity(pct),
      stroke: color,
      strokeOpacity: 0.5,
      strokeWidth: 1,
      cursor: 'pointer',
      transition: 'fill-opacity 0.3s ease',
    } as const
  }

  function toggleExpand(group: MuscleGroup) {
    setExpanded((prev) => (prev === group ? null : group))
  }

  return (
    <div className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] tracked uppercase text-muted">Graphic Muscle Heatmap</p>
          <p className="font-display text-base tracked uppercase text-ink mt-0.5">สัดส่วนกล้ามเนื้อ (สัปดาห์นี้)</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {(['front', 'back'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`text-[10px] tracked uppercase px-2 py-1 rounded border transition ${
                view === v ? 'border-amber text-amber bg-amber/10' : 'border-line text-muted hover:text-ink'
              }`}
            >
              {v === 'front' ? 'ด้านหน้า' : 'ด้านหลัง'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 pb-4">
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : (
        <div className="px-4 pb-4 flex flex-col sm:flex-row gap-4">
          {/* ไดอะแกรม SVG */}
          <div className="shrink-0 mx-auto sm:mx-0">
            <svg viewBox="0 0 200 420" width="180" height="378" role="img" aria-label={`ไดอะแกรมกล้ามเนื้อ ${view === 'front' ? 'ด้านหน้า' : 'ด้านหลัง'}`}>
              {/* หัว + คอ (ไม่ไฮไลต์) */}
              <circle cx="100" cy="28" r="18" fill="#2E333A" />
              <rect x="92" y="42" width="16" height="16" rx="4" fill="#2E333A" />

              {view === 'front' ? (
                <>
                  {/* ไหล่ */}
                  <ellipse cx="55" cy="78" rx="20" ry="15" style={regionStyle('ไหล่')} onClick={() => toggleExpand('ไหล่')} />
                  <ellipse cx="145" cy="78" rx="20" ry="15" style={regionStyle('ไหล่')} onClick={() => toggleExpand('ไหล่')} />
                  {/* แขน */}
                  <rect x="24" y="88" width="24" height="115" rx="12" style={regionStyle('แขน')} onClick={() => toggleExpand('แขน')} />
                  <rect x="152" y="88" width="24" height="115" rx="12" style={regionStyle('แขน')} onClick={() => toggleExpand('แขน')} />
                  {/* อก */}
                  <path d="M68 66 h64 v55 q-32 14 -64 0 z" style={regionStyle('อก')} onClick={() => toggleExpand('อก')} />
                  {/* แกนกลางลำตัว */}
                  <rect x="72" y="122" width="56" height="70" rx="10" style={regionStyle('แกนกลางลำตัว')} onClick={() => toggleExpand('แกนกลางลำตัว')} />
                  {/* ขา */}
                  <rect x="66" y="196" width="30" height="185" rx="14" style={regionStyle('ขา')} onClick={() => toggleExpand('ขา')} />
                  <rect x="104" y="196" width="30" height="185" rx="14" style={regionStyle('ขา')} onClick={() => toggleExpand('ขา')} />
                </>
              ) : (
                <>
                  {/* ไหล่ */}
                  <ellipse cx="55" cy="78" rx="20" ry="15" style={regionStyle('ไหล่')} onClick={() => toggleExpand('ไหล่')} />
                  <ellipse cx="145" cy="78" rx="20" ry="15" style={regionStyle('ไหล่')} onClick={() => toggleExpand('ไหล่')} />
                  {/* แขน */}
                  <rect x="24" y="88" width="24" height="115" rx="12" style={regionStyle('แขน')} onClick={() => toggleExpand('แขน')} />
                  <rect x="152" y="88" width="24" height="115" rx="12" style={regionStyle('แขน')} onClick={() => toggleExpand('แขน')} />
                  {/* หลัง (บน+ล่าง รวมเป็นก้อนเดียว) */}
                  <path d="M68 66 h64 v126 q-32 14 -64 0 z" style={regionStyle('หลัง')} onClick={() => toggleExpand('หลัง')} />
                  {/* ขา (hamstring/calf) */}
                  <rect x="66" y="196" width="30" height="185" rx="14" style={regionStyle('ขา')} onClick={() => toggleExpand('ขา')} />
                  <rect x="104" y="196" width="30" height="185" rx="14" style={regionStyle('ขา')} onClick={() => toggleExpand('ขา')} />
                </>
              )}
            </svg>
          </div>

          {/* รายการสัดส่วน + breakdown ท่า */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {!hasAnyData ? (
              <p className="text-xs text-muted text-center py-6">ยังไม่มีข้อมูลสัปดาห์นี้ — เริ่มบันทึกแล้วสัดส่วนจะขึ้นที่นี่</p>
            ) : (
              stats
                .filter((s) => regions.includes(s.group))
                .map((s) => {
                  const isOpen = expanded === s.group
                  const color = MUSCLE_GROUP_COLORS[s.group]
                  return (
                    <div key={s.group} className="rounded-md bg-surface2 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleExpand(s.group)}
                        className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color, opacity: intensityOpacity(s.pct) }} />
                        <span className="text-xs text-ink flex-1 min-w-0">
                          {s.group} <span className="text-muted text-[10px]">({MUSCLE_GROUP_LABELS_EN[s.group]})</span>
                        </span>
                        <span className="text-[11px] font-mono font-bold shrink-0" style={{ color }}>
                          {Math.round(s.pct)}%
                        </span>
                        <span className="text-[10px] font-mono text-muted shrink-0 w-14 text-right">{s.sets} เซ็ต</span>
                        {s.topExercises.length > 0 && <span className="text-muted text-[10px] shrink-0">{isOpen ? '▲' : '▼'}</span>}
                      </button>
                      {isOpen && s.topExercises.length > 0 && (
                        <ul className="px-2.5 pb-2 space-y-1">
                          {s.topExercises.map((ex) => (
                            <li key={ex.name} className="flex items-center justify-between text-[11px] text-muted pl-[18px]">
                              <span className="truncate">{ex.name}</span>
                              <span className="font-mono shrink-0 ml-2">{ex.sets} เซ็ต</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
