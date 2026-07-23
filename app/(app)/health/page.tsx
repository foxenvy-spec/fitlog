'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import type { BodyMetric, Profile, ProgressPhoto } from '@/lib/types'
import { useWeightUnit } from '@/components/WeightUnitProvider'

function todayStr() {
  const d = new Date()
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 10)
}

function shortLabel(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

function bmiOf(weightKg: number | null, heightCm: number | null) {
  if (!weightKg || !heightCm) return null
  const h = heightCm / 100
  return weightKg / (h * h)
}

function bmiCategory(bmi: number) {
  if (bmi < 18.5) return 'น้ำหนักน้อย'
  if (bmi < 23) return 'ปกติ'
  if (bmi < 25) return 'ท้วม'
  if (bmi < 30) return 'อ้วน'
  return 'อ้วนมาก'
}

import ErrorState from '@/components/ErrorState'
import LoadingState from '@/components/LoadingState'

export default function HealthPage() {
  const supabase = createClient()
  const { unit, toDisplay, format } = useWeightUnit()
  const [metrics, setMetrics] = useState<BodyMetric[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [photos, setPhotos] = useState<(ProgressPhoto & { url?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<'metrics' | 'photos'>('metrics')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const [metricsRes, profileRes, photosRes] = await Promise.all([
      supabase.from('body_metrics').select('*').order('measured_at', { ascending: false }).limit(60),
      supabase.from('profiles').select('*').maybeSingle(),
      supabase.from('progress_photos').select('*').order('taken_at', { ascending: false }),
    ])

    const firstError = metricsRes.error ?? profileRes.error ?? photosRes.error
    if (firstError) {
      setLoadError(firstError.message)
      setLoading(false)
      return
    }

    setMetrics((metricsRes.data as BodyMetric[]) ?? [])
    setProfile((profileRes.data as Profile) ?? (user ? { user_id: user.id, height_cm: null, updated_at: '' } : null))

    const photoRows = (photosRes.data as ProgressPhoto[]) ?? []
    if (photoRows.length > 0) {
      const { data: signed } = await supabase.storage
        .from('progress-photos')
        .createSignedUrls(
          photoRows.map((p) => p.storage_path),
          3600
        )
      const urlMap = new Map((signed ?? []).map((s) => [s.path, s.signedUrl ?? undefined]))
      setPhotos(photoRows.map((p) => ({ ...p, url: urlMap.get(p.storage_path) ?? undefined })))
    } else {
      setPhotos([])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const latest = metrics[0] ?? null
  const bmi = bmiOf(latest?.weight_kg ?? null, profile?.height_cm ?? null)

  const weightTrend = useMemo(() => {
    return [...metrics]
      .filter((m) => m.weight_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.weight_kg as number) }))
  }, [metrics, toDisplay])

  const bodyFatTrend = useMemo(() => {
    return [...metrics]
      .filter((m) => m.body_fat_pct !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.body_fat_pct as number }))
  }, [metrics])

  const muscleTrend = useMemo(() => {
    return [...metrics]
      .filter((m) => m.muscle_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.muscle_kg as number) }))
  }, [metrics, toDisplay])

  const waistTrend = useMemo(() => {
    return [...metrics]
      .filter((m) => m.waist_cm !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.waist_cm as number }))
  }, [metrics])

  const chestTrend = useMemo(() => {
    return [...metrics]
      .filter((m) => m.chest_cm !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.chest_cm as number }))
  }, [metrics])

  const armTrend = useMemo(() => {
    return [...metrics]
      .filter((m) => m.arm_cm !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.arm_cm as number }))
  }, [metrics])

  const thighTrend = useMemo(() => {
    return [...metrics]
      .filter((m) => m.thigh_cm !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.thigh_cm as number }))
  }, [metrics])

  const bodyFatKgTrend = useMemo(() => {
    return [...metrics]
      .filter((m) => m.body_fat_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.body_fat_kg as number) }))
  }, [metrics, toDisplay])

  const bodyWaterTrend = useMemo(() => {
    return [...metrics]
      .filter((m) => m.body_water_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.body_water_kg as number) }))
  }, [metrics, toDisplay])

  const inorganicSaltTrend = useMemo(() => {
    return [...metrics]
      .filter((m) => m.inorganic_salt_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.inorganic_salt_kg as number) }))
  }, [metrics, toDisplay])

  const proteinTrend = useMemo(() => {
    return [...metrics]
      .filter((m) => m.protein_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.protein_kg as number) }))
  }, [metrics, toDisplay])

  const skeletalMuscleTrend = useMemo(() => {
    return [...metrics]
      .filter((m) => m.skeletal_muscle_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.skeletal_muscle_kg as number) }))
  }, [metrics, toDisplay])

  const visceralFatTrend = useMemo(() => {
    return [...metrics]
      .filter((m) => m.visceral_fat_grade !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.visceral_fat_grade as number }))
  }, [metrics])

  const bmrTrend = useMemo(() => {
    return [...metrics]
      .filter((m) => m.bmr_kcal !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.bmr_kcal as number }))
  }, [metrics])

  // Muscle fat analysis (Low/Standard/High bar) — ใช้ค่าล่าสุดของแต่ละตัว จับคู่กับช่วงมาตรฐาน
  // ล่าสุดที่เคยกรอกไว้ (ไม่จำเป็นต้องมาจากแถวเดียวกัน เผื่อผู้ใช้กรอกช่วงไว้แค่ครั้งแรก)
  function latestNonNull(field: keyof BodyMetric): number | null {
    for (const m of metrics) {
      const v = m[field]
      if (typeof v === 'number') return v
    }
    return null
  }

  const muscleFatItems = useMemo(() => {
    const defs: { label: string; value: number | null; low: number | null; high: number | null }[] = [
      { label: 'น้ำหนัก', value: latest?.weight_kg ?? null, low: latestNonNull('weight_range_low'), high: latestNonNull('weight_range_high') },
      {
        label: 'กล้ามเนื้อโครงร่าง',
        value: latest?.skeletal_muscle_kg ?? null,
        low: latestNonNull('skeletal_muscle_range_low'),
        high: latestNonNull('skeletal_muscle_range_high'),
      },
      { label: 'มวลไขมัน', value: latest?.body_fat_kg ?? null, low: latestNonNull('fat_mass_range_low'), high: latestNonNull('fat_mass_range_high') },
    ]
    return defs
      .filter((d) => d.value !== null && d.low !== null && d.high !== null && (d.high as number) > (d.low as number))
      .map((d) => ({
        label: d.label,
        value: toDisplay(d.value as number),
        low: toDisplay(d.low as number),
        high: toDisplay(d.high as number),
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics, latest, toDisplay])

  if (loading) {
    return <LoadingState />
  }

  if (loadError) {
    return <ErrorState title="โหลดข้อมูลสุขภาพไม่สำเร็จ" message={loadError} onRetry={load} />
  }

  return (
    <div className="space-y-6 lg:max-w-2xl lg:mx-auto">
      <h1 className="font-display text-2xl tracked uppercase">สุขภาพร่างกาย</h1>

      <div className="flex rounded-full bg-surface p-1 border border-line">
        <button
          type="button"
          onClick={() => setTab('metrics')}
          className={`flex-1 py-2.5 rounded-full text-sm font-display tracked uppercase transition ${
            tab === 'metrics' ? 'bg-steel text-bg' : 'text-muted'
          }`}
        >
          วัดผล
        </button>
        <button
          type="button"
          onClick={() => setTab('photos')}
          className={`flex-1 py-2.5 rounded-full text-sm font-display tracked uppercase transition ${
            tab === 'photos' ? 'bg-rust text-ink' : 'text-muted'
          }`}
        >
          Progress Photo
        </button>
      </div>

      {tab === 'metrics' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="น้ำหนักล่าสุด" value={latest?.weight_kg != null ? toDisplay(latest.weight_kg) : null} unit={unit} />
            <MiniStat label="BMI" value={bmi} unit={bmi !== null ? bmiCategory(bmi) : undefined} decimals={1} />
            <MiniStat label="Body Fat" value={latest?.body_fat_pct} unit="%" />
            <MiniStat label="Muscle Mass" value={latest?.muscle_kg != null ? toDisplay(latest.muscle_kg) : null} unit={unit} />
            <MiniStat label="ต้นแขนล่าสุด" value={latest?.arm_cm} unit="ซม." />
            <MiniStat label="ต้นขาล่าสุด" value={latest?.thigh_cm} unit="ซม." />
            <MiniStat label="มวลไขมัน" value={latest?.body_fat_kg != null ? toDisplay(latest.body_fat_kg) : null} unit={unit} />
            <MiniStat label="น้ำในร่างกาย" value={latest?.body_water_kg != null ? toDisplay(latest.body_water_kg) : null} unit={unit} />
            <MiniStat label="เกลือแร่" value={latest?.inorganic_salt_kg != null ? toDisplay(latest.inorganic_salt_kg) : null} unit={unit} />
            <MiniStat label="โปรตีน" value={latest?.protein_kg != null ? toDisplay(latest.protein_kg) : null} unit={unit} />
            <MiniStat label="กล้ามเนื้อโครงร่าง" value={latest?.skeletal_muscle_kg != null ? toDisplay(latest.skeletal_muscle_kg) : null} unit={unit} />
            <MiniStat label="ไขมันช่องท้อง" value={latest?.visceral_fat_grade} unit="ระดับ" decimals={0} />
            <MiniStat label="BMR" value={latest?.bmr_kcal} unit="kcal" decimals={0} />
          </div>

          <HeightSetting profile={profile} onSaved={(p) => setProfile(p)} />

          {muscleFatItems.length > 0 ? (
            <MuscleFatAnalysisChart items={muscleFatItems} unit={unit} />
          ) : (
            <p className="text-[11px] text-muted bg-surface border border-line shadow-elevated rounded-lg px-4 py-3">
              อยากดูกราฟ Muscle Fat Analysis (น้ำหนัก/กล้ามเนื้อโครงร่าง/มวลไขมัน เทียบช่วงมาตรฐาน) — กรอกช่วงมาตรฐานจากรายงานเครื่องชั่งในฟอร์มด้านล่าง (ช่อง &quot;ช่วงมาตรฐาน&quot;) สักครั้ง แล้วกราฟจะขึ้นให้อัตโนมัติ
            </p>
          )}

          {weightTrend.length > 1 && (
            <MetricTrendChart title="แนวโน้มน้ำหนัก" data={weightTrend} color="#E8A33D" unit={unit} />
          )}
          {bodyFatTrend.length > 1 && (
            <MetricTrendChart title="แนวโน้ม Body Fat" data={bodyFatTrend} color="#C1503A" unit="%" />
          )}
          {muscleTrend.length > 1 && (
            <MetricTrendChart title="แนวโน้มมวลกล้ามเนื้อ" data={muscleTrend} color="#5FA88C" unit={unit} />
          )}
          {waistTrend.length > 1 && (
            <MetricTrendChart title="แนวโน้มรอบเอว" data={waistTrend} color="#6C8CA8" unit="ซม." />
          )}
          {chestTrend.length > 1 && (
            <MetricTrendChart title="แนวโน้มรอบอก" data={chestTrend} color="#A87F5F" unit="ซม." />
          )}
          {armTrend.length > 1 && (
            <MetricTrendChart title="แนวโน้มรอบต้นแขน" data={armTrend} color="#8C6CA8" unit="ซม." />
          )}
          {thighTrend.length > 1 && (
            <MetricTrendChart title="แนวโน้มรอบต้นขา" data={thighTrend} color="#5F8FA8" unit="ซม." />
          )}
          {bodyFatKgTrend.length > 1 && (
            <MetricTrendChart title="แนวโน้มมวลไขมัน" data={bodyFatKgTrend} color="#C1503A" unit={unit} />
          )}
          {bodyWaterTrend.length > 1 && (
            <MetricTrendChart title="แนวโน้มน้ำในร่างกาย" data={bodyWaterTrend} color="#3D8FE8" unit={unit} />
          )}
          {inorganicSaltTrend.length > 1 && (
            <MetricTrendChart title="แนวโน้มเกลือแร่" data={inorganicSaltTrend} color="#A89F5F" unit={unit} />
          )}
          {proteinTrend.length > 1 && (
            <MetricTrendChart title="แนวโน้มโปรตีน" data={proteinTrend} color="#5FA8A0" unit={unit} />
          )}
          {skeletalMuscleTrend.length > 1 && (
            <MetricTrendChart title="แนวโน้มกล้ามเนื้อโครงร่าง" data={skeletalMuscleTrend} color="#7FA85F" unit={unit} />
          )}
          {visceralFatTrend.length > 1 && (
            <MetricTrendChart title="แนวโน้มไขมันช่องท้อง" data={visceralFatTrend} color="#C1503A" unit="ระดับ" />
          )}
          {bmrTrend.length > 1 && (
            <MetricTrendChart title="แนวโน้ม BMR" data={bmrTrend} color="#5FA85F" unit="kcal" />
          )}

          <MetricForm onSaved={(m) => setMetrics((prev) => [m, ...prev.filter((x) => x.id !== m.id)])} />

          <section>
            <h2 className="font-display text-sm tracked uppercase text-muted mb-3">ประวัติการวัดผล</h2>
            {metrics.length === 0 ? (
              <div className="bg-surface border border-line shadow-elevated rounded-lg px-4 py-8 text-center space-y-3">
                <div className="text-3xl">📏</div>
                <p className="text-sm text-muted">ยังไม่มีข้อมูล เริ่มบันทึกครั้งแรกได้เลย</p>
                <a
                  href="#metric-form"
                  className="inline-block text-[11px] font-display tracked uppercase text-bg bg-amber rounded-lg px-4 py-2 active:scale-[0.99] transition"
                >
                  + บันทึกครั้งแรก
                </a>
              </div>
            ) : (
              <ul className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
                {metrics.map((m) => (
                  <li key={m.id} className="tally-row px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-muted">{shortLabel(m.measured_at)}</span>
                      <button
                        onClick={async () => {
                          await supabase.from('body_metrics').delete().eq('id', m.id)
                          setMetrics((prev) => prev.filter((x) => x.id !== m.id))
                        }}
                        className="text-muted hover:text-rust text-xs"
                      >
                        ลบ
                      </button>
                    </div>
                    <p className="text-sm text-ink mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {m.weight_kg !== null && <span>น้ำหนัก {format(m.weight_kg)}</span>}
                      {m.body_fat_pct !== null && <span>Body Fat {m.body_fat_pct}%</span>}
                      {m.muscle_kg !== null && <span>Muscle {format(m.muscle_kg)}</span>}
                      {m.waist_cm !== null && <span>เอว {m.waist_cm} ซม.</span>}
                      {m.chest_cm !== null && <span>อก {m.chest_cm} ซม.</span>}
                      {m.hip_cm !== null && <span>สะโพก {m.hip_cm} ซม.</span>}
                      {m.arm_cm !== null && <span>ต้นแขน {m.arm_cm} ซม.</span>}
                      {m.thigh_cm !== null && <span>ต้นขา {m.thigh_cm} ซม.</span>}
                      {m.body_fat_kg !== null && <span>มวลไขมัน {format(m.body_fat_kg)}</span>}
                      {m.body_water_kg !== null && <span>น้ำในร่างกาย {format(m.body_water_kg)}</span>}
                      {m.inorganic_salt_kg !== null && <span>เกลือแร่ {format(m.inorganic_salt_kg)}</span>}
                      {m.protein_kg !== null && <span>โปรตีน {format(m.protein_kg)}</span>}
                      {m.skeletal_muscle_kg !== null && <span>กล้ามเนื้อโครงร่าง {format(m.skeletal_muscle_kg)}</span>}
                      {m.visceral_fat_grade !== null && <span>ไขมันช่องท้อง ระดับ {m.visceral_fat_grade}</span>}
                      {m.bmr_kcal !== null && <span>BMR {m.bmr_kcal} kcal</span>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <PhotosTab photos={photos} onChanged={load} />
      )}
    </div>
  )
}

function MetricTrendChart({
  title,
  data,
  color,
  unit,
}: {
  title: string
  data: { label: string; value: number }[]
  color: string
  unit: string
}) {
  return (
    <section>
      <h2 className="font-display text-sm tracked uppercase text-muted mb-3">{title}</h2>
      <div className="h-40 bg-surface border border-line shadow-elevated rounded-lg p-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#2E333A" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#9498A0', fontSize: 10 }} axisLine={{ stroke: '#2E333A' }} tickLine={false} />
            <YAxis tick={{ fill: '#9498A0', fontSize: 10 }} axisLine={false} tickLine={false} width={36} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ background: '#1C1F24', border: '1px solid #2E333A', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#9498A0' }}
              itemStyle={{ color: '#F3F0E8' }}
              formatter={(v: number) => [`${v} ${unit}`, title]}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 2, fill: color }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function MuscleFatAnalysisChart({
  items,
  unit,
}: {
  items: { label: string; value: number; low: number; high: number }[]
  unit: string
}) {
  return (
    <section>
      <h2 className="font-display text-sm tracked uppercase text-muted mb-3">Muscle Fat Analysis</h2>
      <div className="bg-surface border border-line shadow-elevated rounded-lg p-4 space-y-5">
        {items.map((it) => (
          <MuscleFatBarRow key={it.label} {...it} unit={unit} />
        ))}
      </div>
    </section>
  )
}

function MuscleFatBarRow({
  label,
  value,
  low,
  high,
  unit,
}: {
  label: string
  value: number
  low: number
  high: number
  unit: string
}) {
  const span = Math.max(high - low, 0.1)
  const min = low - span * 1.4
  const max = high + span * 1.4
  const pct = (v: number) => (Math.min(Math.max(v, min), max) - min) / (max - min) * 100
  const lowPct = pct(low)
  const highPct = pct(high)
  const valuePct = pct(value)
  const zone = value < low ? 'ต่ำ' : value > high ? 'สูง' : 'มาตรฐาน'
  const zoneColor = value < low ? 'text-steel' : value > high ? 'text-rusttext' : 'text-moss'

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs text-ink">{label}</span>
        <span className="text-sm font-mono tabular">
          {value.toFixed(1)} {unit}
          <span className={`text-[10px] ml-1.5 ${zoneColor}`}>{zone}</span>
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-surface2 overflow-hidden">
        <div className="absolute inset-y-0 bg-line" style={{ left: 0, width: `${lowPct}%` }} />
        <div className="absolute inset-y-0 bg-moss/50" style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }} />
        <div className="absolute inset-y-0 bg-line" style={{ left: `${highPct}%`, right: 0 }} />
        <div
          className="absolute top-1/2 w-2.5 h-2.5 rounded-full bg-amber border-2 border-surface shadow"
          style={{ left: `${valuePct}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-muted mt-1">
        <span>ต่ำสุด {low.toFixed(1)}</span>
        <span>สูงสุด {high.toFixed(1)}</span>
      </div>
    </div>
  )
}

function MiniStat({ label, value, unit, decimals = 1 }: { label: string; value: number | null | undefined; unit?: string; decimals?: number }) {
  return (
    <div className="bg-surface border border-line shadow-elevated rounded-lg px-4 py-3.5">
      <p className="text-[11px] tracked uppercase text-muted mb-1">{label}</p>
      <p className="font-mono text-2xl tabular text-amber">
        {value !== null && value !== undefined ? value.toFixed(decimals) : '—'}
        {unit && <span className="text-xs text-muted ml-1">{unit}</span>}
      </p>
    </div>
  )
}

function HeightSetting({ profile, onSaved }: { profile: Profile | null; onSaved: (p: Profile) => void }) {
  const supabase = createClient()
  const [height, setHeight] = useState(profile?.height_cm ? String(profile.height_cm) : '')
  const [editing, setEditing] = useState(!profile?.height_cm)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || !height) return
    setSaving(true)
    const { data } = await supabase
      .from('profiles')
      .upsert({ user_id: user.id, height_cm: Number(height), updated_at: new Date().toISOString() })
      .select()
      .single()
    setSaving(false)
    if (data) {
      onSaved(data as Profile)
      setEditing(false)
    }
  }

  if (!editing) {
    return (
      <p className="text-xs text-muted">
        ส่วนสูง {profile?.height_cm} ซม.{' '}
        <button type="button" onClick={() => setEditing(true)} className="text-amber underline">
          แก้ไข
        </button>
      </p>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="decimal"
        value={height}
        onChange={(e) => setHeight(e.target.value)}
        placeholder="ส่วนสูง (ซม.) สำหรับคำนวณ BMI"
        className="input font-mono"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !height}
        className="shrink-0 px-4 py-3 rounded-lg bg-steel text-bg text-sm font-display tracked uppercase disabled:opacity-50"
      >
        บันทึก
      </button>
    </div>
  )
}

function MetricForm({ onSaved }: { onSaved: (m: BodyMetric) => void }) {
  const supabase = createClient()
  const { unit, toKg } = useWeightUnit()
  const [date, setDate] = useState(todayStr())
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [muscle, setMuscle] = useState('')
  const [waist, setWaist] = useState('')
  const [chest, setChest] = useState('')
  const [hip, setHip] = useState('')
  const [arm, setArm] = useState('')
  const [thigh, setThigh] = useState('')
  const [bodyFatKg, setBodyFatKg] = useState('')
  const [bodyWater, setBodyWater] = useState('')
  const [inorganicSalt, setInorganicSalt] = useState('')
  const [protein, setProtein] = useState('')
  const [skeletalMuscle, setSkeletalMuscle] = useState('')
  const [visceralFat, setVisceralFat] = useState('')
  const [bmr, setBmr] = useState('')
  const [showRanges, setShowRanges] = useState(false)
  const [weightRangeLow, setWeightRangeLow] = useState('')
  const [weightRangeHigh, setWeightRangeHigh] = useState('')
  const [skeletalRangeLow, setSkeletalRangeLow] = useState('')
  const [skeletalRangeHigh, setSkeletalRangeHigh] = useState('')
  const [fatMassRangeLow, setFatMassRangeLow] = useState('')
  const [fatMassRangeHigh, setFatMassRangeHigh] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('กรุณาเข้าสู่ระบบใหม่')
      return
    }
    setSaving(true)
    const payload = {
      user_id: user.id,
      measured_at: date,
      weight_kg: weight ? toKg(Number(weight)) : null,
      body_fat_pct: bodyFat ? Number(bodyFat) : null,
      muscle_kg: muscle ? toKg(Number(muscle)) : null,
      waist_cm: waist ? Number(waist) : null,
      chest_cm: chest ? Number(chest) : null,
      hip_cm: hip ? Number(hip) : null,
      arm_cm: arm ? Number(arm) : null,
      thigh_cm: thigh ? Number(thigh) : null,
      body_fat_kg: bodyFatKg ? toKg(Number(bodyFatKg)) : null,
      body_water_kg: bodyWater ? toKg(Number(bodyWater)) : null,
      inorganic_salt_kg: inorganicSalt ? toKg(Number(inorganicSalt)) : null,
      protein_kg: protein ? toKg(Number(protein)) : null,
      skeletal_muscle_kg: skeletalMuscle ? toKg(Number(skeletalMuscle)) : null,
      visceral_fat_grade: visceralFat ? Number(visceralFat) : null,
      bmr_kcal: bmr ? Number(bmr) : null,
      weight_range_low: weightRangeLow ? toKg(Number(weightRangeLow)) : null,
      weight_range_high: weightRangeHigh ? toKg(Number(weightRangeHigh)) : null,
      skeletal_muscle_range_low: skeletalRangeLow ? toKg(Number(skeletalRangeLow)) : null,
      skeletal_muscle_range_high: skeletalRangeHigh ? toKg(Number(skeletalRangeHigh)) : null,
      fat_mass_range_low: fatMassRangeLow ? toKg(Number(fatMassRangeLow)) : null,
      fat_mass_range_high: fatMassRangeHigh ? toKg(Number(fatMassRangeHigh)) : null,
    }
    const { data, error } = await supabase.from('body_metrics').insert(payload).select().single()
    setSaving(false)
    if (error || !data) {
      setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
      return
    }
    onSaved(data as BodyMetric)
    setWeight('')
    setBodyFat('')
    setMuscle('')
    setWaist('')
    setChest('')
    setHip('')
    setArm('')
    setThigh('')
    setBodyFatKg('')
    setBodyWater('')
    setInorganicSalt('')
    setProtein('')
    setSkeletalMuscle('')
    setVisceralFat('')
    setBmr('')
    setWeightRangeLow('')
    setWeightRangeHigh('')
    setSkeletalRangeLow('')
    setSkeletalRangeHigh('')
    setFatMassRangeLow('')
    setFatMassRangeHigh('')
  }

  return (
    <form id="metric-form" onSubmit={handleSubmit} className="space-y-3 bg-surface border border-line shadow-elevated rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm tracked uppercase text-muted">บันทึกวัดผลใหม่</h2>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-transparent text-muted text-xs font-mono outline-none border-b border-transparent focus:border-line"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <LabeledInput label={`น้ำหนัก (${unit})`} value={weight} onChange={setWeight} />
        <LabeledInput label="Body Fat (%)" value={bodyFat} onChange={setBodyFat} />
        <LabeledInput label={`Muscle (${unit})`} value={muscle} onChange={setMuscle} />
        <LabeledInput label="เอว (ซม.)" value={waist} onChange={setWaist} />
        <LabeledInput label="อก (ซม.)" value={chest} onChange={setChest} />
        <LabeledInput label="สะโพก (ซม.)" value={hip} onChange={setHip} />
        <LabeledInput label="ต้นแขน (ซม.)" value={arm} onChange={setArm} />
        <LabeledInput label="ต้นขา (ซม.)" value={thigh} onChange={setThigh} />
        <LabeledInput label={`มวลไขมัน (${unit})`} value={bodyFatKg} onChange={setBodyFatKg} />
        <LabeledInput label={`น้ำในร่างกาย (${unit})`} value={bodyWater} onChange={setBodyWater} />
        <LabeledInput label={`เกลือแร่ (${unit})`} value={inorganicSalt} onChange={setInorganicSalt} />
        <LabeledInput label={`โปรตีน (${unit})`} value={protein} onChange={setProtein} />
        <LabeledInput label={`กล้ามเนื้อโครงร่าง (${unit})`} value={skeletalMuscle} onChange={setSkeletalMuscle} />
        <LabeledInput label="ไขมันช่องท้อง (ระดับ)" value={visceralFat} onChange={setVisceralFat} />
        <LabeledInput label="BMR (kcal)" value={bmr} onChange={setBmr} />
      </div>

      <div className="border-t border-line pt-3">
        <button
          type="button"
          onClick={() => setShowRanges((v) => !v)}
          className="text-[11px] text-steel underline"
        >
          {showRanges ? 'ซ่อนช่วงมาตรฐาน' : '+ กรอกช่วงมาตรฐาน (สำหรับกราฟ Muscle Fat Analysis)'}
        </button>
        {showRanges && (
          <div className="mt-3 space-y-3">
            <p className="text-[10px] text-muted">
              คัดลอกจากตาราง &quot;Muscle fat analysis&quot; ในรายงานเครื่องชั่ง (Low–High) — กรอกครั้งแรกครั้งเดียวก็พอ ใช้ค่าล่าสุดที่เคยกรอกไว้ต่อได้เรื่อยๆ
            </p>
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label={`น้ำหนัก ต่ำสุด (${unit})`} value={weightRangeLow} onChange={setWeightRangeLow} />
              <LabeledInput label={`น้ำหนัก สูงสุด (${unit})`} value={weightRangeHigh} onChange={setWeightRangeHigh} />
              <LabeledInput label={`กล้ามเนื้อโครงร่าง ต่ำสุด (${unit})`} value={skeletalRangeLow} onChange={setSkeletalRangeLow} />
              <LabeledInput label={`กล้ามเนื้อโครงร่าง สูงสุด (${unit})`} value={skeletalRangeHigh} onChange={setSkeletalRangeHigh} />
              <LabeledInput label={`มวลไขมัน ต่ำสุด (${unit})`} value={fatMassRangeLow} onChange={setFatMassRangeLow} />
              <LabeledInput label={`มวลไขมัน สูงสุด (${unit})`} value={fatMassRangeHigh} onChange={setFatMassRangeHigh} />
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-rusttext">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-lg font-display tracked uppercase py-3 text-sm bg-amber text-bg disabled:opacity-50"
      >
        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </form>
  )
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] tracked uppercase text-muted mb-1">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input font-mono text-center text-sm py-2"
      />
    </div>
  )
}

function PhotosTab({
  photos,
  onChanged,
}: {
  photos: (ProgressPhoto & { url?: string })[]
  onChanged: () => void
}) {
  const supabase = createClient()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [beforeId, setBeforeId] = useState('')
  const [afterId, setAfterId] = useState('')

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('กรุณาเข้าสู่ระบบใหม่')
      setUploading(false)
      return
    }
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${user.id}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('progress-photos').upload(path, file)
    if (uploadError) {
      setError('อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง')
      setUploading(false)
      return
    }
    const { error: insertError } = await supabase.from('progress_photos').insert({
      user_id: user.id,
      taken_at: todayStr(),
      storage_path: path,
      label: label || null,
    })
    setUploading(false)
    if (insertError) {
      setError('บันทึกข้อมูลรูปไม่สำเร็จ')
      return
    }
    setLabel('')
    e.target.value = ''
    onChanged()
  }

  async function handleDelete(photo: ProgressPhoto) {
    await supabase.storage.from('progress-photos').remove([photo.storage_path])
    await supabase.from('progress_photos').delete().eq('id', photo.id)
    onChanged()
  }

  const beforePhoto = photos.find((p) => p.id === beforeId)
  const afterPhoto = photos.find((p) => p.id === afterId)

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-line shadow-elevated rounded-lg p-4 space-y-3">
        <h2 className="font-display text-sm tracked uppercase text-muted">เพิ่มรูป</h2>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="ป้ายกำกับ เช่น หน้าตรง, ด้านข้าง"
          className="input"
        />
        <label className="block">
          <span className="w-full block text-center rounded-lg font-display tracked uppercase py-3 text-sm bg-rust text-ink cursor-pointer">
            {uploading ? 'กำลังอัปโหลด...' : 'เลือกรูปถ่าย'}
          </span>
          <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} className="hidden" />
        </label>
        {error && <p className="text-sm text-rusttext">{error}</p>}
      </div>

      {photos.length >= 2 && (
        <section>
          <h2 className="font-display text-sm tracked uppercase text-muted mb-3">เปรียบเทียบ Before / After</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <select value={beforeId} onChange={(e) => setBeforeId(e.target.value)} className="input text-xs">
              <option value="">Before</option>
              {photos.map((p) => (
                <option key={p.id} value={p.id}>
                  {shortLabel(p.taken_at)} {p.label ? `· ${p.label}` : ''}
                </option>
              ))}
            </select>
            <select value={afterId} onChange={(e) => setAfterId(e.target.value)} className="input text-xs">
              <option value="">After</option>
              {photos.map((p) => (
                <option key={p.id} value={p.id}>
                  {shortLabel(p.taken_at)} {p.label ? `· ${p.label}` : ''}
                </option>
              ))}
            </select>
          </div>
          {beforePhoto?.url && afterPhoto?.url && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="relative w-full aspect-[3/4] rounded-lg border border-line overflow-hidden">
                  <Image src={beforePhoto.url} alt="Before" fill sizes="200px" className="object-cover" />
                </div>
                <p className="text-center text-[11px] text-muted mt-1">{shortLabel(beforePhoto.taken_at)}</p>
              </div>
              <div>
                <div className="relative w-full aspect-[3/4] rounded-lg border border-line overflow-hidden">
                  <Image src={afterPhoto.url} alt="After" fill sizes="200px" className="object-cover" />
                </div>
                <p className="text-center text-[11px] text-muted mt-1">{shortLabel(afterPhoto.taken_at)}</p>
              </div>
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="font-display text-sm tracked uppercase text-muted mb-3">รูปทั้งหมด</h2>
        {photos.length === 0 ? (
          <p className="text-sm text-muted bg-surface border border-line shadow-elevated rounded-lg px-4 py-6 text-center">
            ยังไม่มีรูป
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative group">
                {p.url && (
                  <div className="relative w-full aspect-square rounded-lg border border-line overflow-hidden">
                    <Image src={p.url} alt={p.label ?? ''} fill sizes="150px" className="object-cover" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(p)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-bg/80 text-rusttext text-xs flex items-center justify-center"
                  aria-label="ลบรูป"
                >
                  ×
                </button>
                <p className="text-[10px] text-muted mt-1 truncate">{shortLabel(p.taken_at)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
