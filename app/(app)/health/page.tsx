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
import type { BodyMetric, Goal, Profile, ProgressPhoto } from '@/lib/types'
import { useWeightUnit } from '@/components/WeightUnitProvider'
import GoalRing from '@/components/GoalRing'
import InsightCard from '@/components/InsightCard'
import type { Insight } from '@/lib/dashboardStats'
import { zoneOf, classifyMetric, summarizeHealthScore, computeHealthTrendInsights, type Direction } from '@/lib/healthInsights'

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
import ImportBodyReportPhoto, { ExtractedBodyReport } from '@/components/ImportBodyReportPhoto'

type TrendDef = {
  key: string
  label: string
  color: string
  unit: string
  data: { label: string; value: number }[]
  iconKey?: 'weight' | 'fat' | 'muscle' | 'water' | 'bmi' | 'salt' | 'protein' | 'fire' | 'ruler' | 'heart'
  range?: { low: number; high: number; min: number; max: number; note?: string }
  direction?: Direction
  decimals?: number
}

export default function HealthPage() {
  const supabase = createClient()
  const { unit, toDisplay, format } = useWeightUnit()
  const [metrics, setMetrics] = useState<BodyMetric[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [photos, setPhotos] = useState<(ProgressPhoto & { url?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<'overview' | 'trends' | 'log' | 'photos'>('overview')
  const [trendGroup, setTrendGroup] = useState<'comp' | 'measure'>('comp')
  const [trendMetric, setTrendMetric] = useState<number | 'all'>('all')
  const [trendPeriodDays, setTrendPeriodDays] = useState<7 | 30 | 90>(90)
  const [goals, setGoals] = useState<Goal[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const [metricsRes, profileRes, photosRes, goalsRes] = await Promise.all([
      supabase.from('body_metrics').select('*').order('measured_at', { ascending: false }).limit(60),
      supabase.from('profiles').select('*').maybeSingle(),
      supabase.from('progress_photos').select('*').order('taken_at', { ascending: false }),
      supabase.from('goals').select('*').in('goal_type', ['weight', 'body_fat']).eq('status', 'active'),
    ])

    const firstError = metricsRes.error ?? profileRes.error ?? photosRes.error
    if (firstError) {
      setLoadError(firstError.message)
      setLoading(false)
      return
    }

    setMetrics((metricsRes.data as BodyMetric[]) ?? [])
    setProfile((profileRes.data as Profile) ?? (user ? { user_id: user.id, height_cm: null, updated_at: '' } : null))
    setGoals((goalsRes.data as Goal[]) ?? [])

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

  const saveHeight = useCallback(
    async (heightCm: number) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        console.error('saveHeight: ไม่พบ user ที่ล็อกอินอยู่')
        throw new Error('กรุณาเข้าสู่ระบบใหม่')
      }
      const { data, error } = await supabase
        .from('profiles')
        .upsert({ user_id: user.id, height_cm: heightCm, updated_at: new Date().toISOString() })
        .select()
        .single()
      if (error) {
        console.error('saveHeight: บันทึกส่วนสูงไม่สำเร็จ', error)
        throw error
      }
      if (data) setProfile(data as Profile)
    },
    [supabase]
  )

  const latest = metrics[0] ?? null
  const bmi = bmiOf(latest?.weight_kg ?? null, profile?.height_cm ?? null)

  // เฉพาะข้อมูลในช่วงเวลาที่เลือกดู (7/30/90 วัน) ใช้กับกราฟแนวโน้มเท่านั้น — แท็บภาพรวมยังใช้ค่าล่าสุดจาก metrics ทั้งหมด
  const periodMetrics = useMemo(() => {
    const since = new Date()
    since.setDate(since.getDate() - trendPeriodDays)
    const offset = since.getTimezoneOffset()
    const sinceStr = new Date(since.getTime() - offset * 60000).toISOString().slice(0, 10)
    return metrics.filter((m) => m.measured_at >= sinceStr)
  }, [metrics, trendPeriodDays])

  const weightTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.weight_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.weight_kg as number) }))
  }, [periodMetrics, toDisplay])

  const bodyFatTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.body_fat_pct !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.body_fat_pct as number }))
  }, [periodMetrics])

  const muscleTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.muscle_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.muscle_kg as number) }))
  }, [periodMetrics, toDisplay])

  const waistTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.waist_cm !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.waist_cm as number }))
  }, [periodMetrics])

  const chestTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.chest_cm !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.chest_cm as number }))
  }, [periodMetrics])

  const armTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.arm_cm !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.arm_cm as number }))
  }, [periodMetrics])

  const thighTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.thigh_cm !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.thigh_cm as number }))
  }, [periodMetrics])

  const bodyFatKgTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.body_fat_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.body_fat_kg as number) }))
  }, [periodMetrics, toDisplay])

  const bodyWaterTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.body_water_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.body_water_kg as number) }))
  }, [periodMetrics, toDisplay])

  const inorganicSaltTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.inorganic_salt_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.inorganic_salt_kg as number) }))
  }, [periodMetrics, toDisplay])

  const proteinTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.protein_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.protein_kg as number) }))
  }, [periodMetrics, toDisplay])

  const skeletalMuscleTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.skeletal_muscle_kg !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: toDisplay(m.skeletal_muscle_kg as number) }))
  }, [periodMetrics, toDisplay])

  const visceralFatTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.visceral_fat_grade !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.visceral_fat_grade as number }))
  }, [periodMetrics])

  const bmrTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.bmr_kcal !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.bmr_kcal as number }))
  }, [periodMetrics])

  const bodyAgeTrend = useMemo(() => {
    return [...periodMetrics]
      .filter((m) => m.body_age_years !== null)
      .reverse()
      .map((m) => ({ label: shortLabel(m.measured_at), value: m.body_age_years as number }))
  }, [periodMetrics])

  const bmiTrend = useMemo(() => {
    if (!profile?.height_cm) return []
    return [...periodMetrics]
      .filter((m) => m.weight_kg !== null)
      .reverse()
      .map((m) => {
        const b = bmiOf(m.weight_kg, profile.height_cm)
        return b !== null ? { label: shortLabel(m.measured_at), value: Math.round(b * 10) / 10 } : null
      })
      .filter((v): v is { label: string; value: number } => v !== null)
  }, [periodMetrics, profile?.height_cm])

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
      { label: 'Weight', value: latest?.weight_kg ?? null, low: latestNonNull('weight_range_low'), high: latestNonNull('weight_range_high') },
      {
        label: 'Skeletal Muscle',
        value: latest?.skeletal_muscle_kg ?? null,
        low: latestNonNull('skeletal_muscle_range_low'),
        high: latestNonNull('skeletal_muscle_range_high'),
      },
      { label: 'Fat Mass', value: latest?.body_fat_kg ?? null, low: latestNonNull('fat_mass_range_low'), high: latestNonNull('fat_mass_range_high') },
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

  // ช่วงมาตรฐานของน้ำหนัก/กล้ามเนื้อโครงร่าง/มวลไขมัน มาจากค่าที่ผู้ใช้กรอกเองจากรายงานเครื่องชั่ง (ดู muscleFatItems ด้านบน)
  // ส่วน Body Fat%/BMI/ไขมันช่องท้อง ใช้เกณฑ์อ้างอิงทั่วไปที่ใช้กันแพร่หลาย (เช่นเดียวกับ ObesityAnalysisChart)
  const weightRangeLow = latestNonNull('weight_range_low')
  const weightRangeHigh = latestNonNull('weight_range_high')
  const skeletalRangeLow = latestNonNull('skeletal_muscle_range_low')
  const skeletalRangeHigh = latestNonNull('skeletal_muscle_range_high')
  const fatMassRangeLow = latestNonNull('fat_mass_range_low')
  const fatMassRangeHigh = latestNonNull('fat_mass_range_high')
  const muscleRangeLow = latestNonNull('muscle_range_low')
  const muscleRangeHigh = latestNonNull('muscle_range_high')
  const bodyAgeRangeLow = latestNonNull('body_age_range_low')
  const bodyAgeRangeHigh = latestNonNull('body_age_range_high')

  const compTrends: TrendDef[] = useMemo(
    () => [
      {
        key: 'weight',
        label: 'น้ำหนัก',
        color: '#E8A33D',
        unit,
        data: weightTrend,
        iconKey: 'weight',
        direction: 'neutral',
        range:
          weightRangeLow !== null && weightRangeHigh !== null
            ? { low: toDisplay(weightRangeLow), high: toDisplay(weightRangeHigh), min: toDisplay(weightRangeLow) * 0.85, max: toDisplay(weightRangeHigh) * 1.15 }
            : undefined,
      },
      {
        key: 'bodyFat',
        label: 'ไขมันในร่างกาย',
        color: '#C1503A',
        unit: '%',
        data: bodyFatTrend,
        iconKey: 'fat',
        direction: 'lowerBetter',
        range: { low: 18, high: 28, min: 8, max: 48, note: 'เกณฑ์อ้างอิงทั่วไป' },
      },
      {
        key: 'muscleMass',
        label: 'มวลกล้ามเนื้อ',
        color: '#5FA88C',
        unit,
        data: muscleTrend,
        iconKey: 'muscle',
        direction: 'higherBetter',
        range:
          muscleRangeLow !== null && muscleRangeHigh !== null
            ? { low: toDisplay(muscleRangeLow), high: toDisplay(muscleRangeHigh), min: toDisplay(muscleRangeLow) * 0.85, max: toDisplay(muscleRangeHigh) * 1.15 }
            : undefined,
      },
      {
        key: 'bodyFatKg',
        label: 'มวลไขมัน',
        color: '#C1503A',
        unit,
        data: bodyFatKgTrend,
        iconKey: 'fat',
        direction: 'lowerBetter',
        range:
          fatMassRangeLow !== null && fatMassRangeHigh !== null
            ? { low: toDisplay(fatMassRangeLow), high: toDisplay(fatMassRangeHigh), min: toDisplay(fatMassRangeLow) * 0.6, max: toDisplay(fatMassRangeHigh) * 1.4 }
            : undefined,
      },
      { key: 'bodyWater', label: 'น้ำในร่างกาย', color: '#3D8FE8', unit, data: bodyWaterTrend, iconKey: 'water' },
      { key: 'salt', label: 'เกลือแร่', color: '#A89F5F', unit, data: inorganicSaltTrend, iconKey: 'salt' },
      { key: 'protein', label: 'โปรตีน', color: '#5FA8A0', unit, data: proteinTrend, iconKey: 'protein' },
      {
        key: 'skeletalMuscle',
        label: 'กล้ามเนื้อโครงร่าง',
        color: '#7FA85F',
        unit,
        data: skeletalMuscleTrend,
        iconKey: 'muscle',
        direction: 'higherBetter',
        range:
          skeletalRangeLow !== null && skeletalRangeHigh !== null
            ? { low: toDisplay(skeletalRangeLow), high: toDisplay(skeletalRangeHigh), min: toDisplay(skeletalRangeLow) * 0.85, max: toDisplay(skeletalRangeHigh) * 1.15 }
            : undefined,
      },
      {
        key: 'visceralFat',
        label: 'ไขมันช่องท้อง',
        color: '#C1503A',
        unit: 'ระดับ',
        data: visceralFatTrend,
        iconKey: 'fat',
        direction: 'lowerBetter',
        decimals: 0,
        range: { low: 1, high: 9, min: 1, max: 20, note: 'เกณฑ์อ้างอิงทั่วไป' },
      },
      {
        key: 'bmi',
        label: 'BMI',
        color: '#6C8CA8',
        unit: 'kg/m²',
        data: bmiTrend,
        iconKey: 'bmi',
        direction: 'neutral',
        range: { low: 18.5, high: 25, min: 10, max: 40, note: 'เกณฑ์อ้างอิงทั่วไป' },
      },
      {
        key: 'bmr',
        label: 'BMR',
        color: '#5FA85F',
        unit: 'kcal',
        data: bmrTrend,
        iconKey: 'fire',
        decimals: 0,
        range: { low: 1400, high: 2000, min: 1000, max: 2500, note: 'ช่วงอ้างอิงทั่วไป ไม่ใช่ค่าคำนวณเฉพาะบุคคล' },
      },
      {
        key: 'bodyAge',
        label: 'อายุร่างกาย',
        color: '#CF715F',
        unit: 'ปี',
        data: bodyAgeTrend,
        iconKey: 'heart',
        direction: 'lowerBetter',
        decimals: 0,
        range:
          bodyAgeRangeLow !== null && bodyAgeRangeHigh !== null
            ? { low: bodyAgeRangeLow, high: bodyAgeRangeHigh, min: bodyAgeRangeLow * 0.6, max: bodyAgeRangeHigh * 1.3 }
            : undefined,
      },
    ],
    [
      unit,
      toDisplay,
      weightTrend,
      bodyFatTrend,
      muscleTrend,
      bodyFatKgTrend,
      bodyWaterTrend,
      inorganicSaltTrend,
      proteinTrend,
      skeletalMuscleTrend,
      visceralFatTrend,
      bmiTrend,
      bmrTrend,
      bodyAgeTrend,
      weightRangeLow,
      weightRangeHigh,
      skeletalRangeLow,
      skeletalRangeHigh,
      fatMassRangeLow,
      fatMassRangeHigh,
      muscleRangeLow,
      muscleRangeHigh,
      bodyAgeRangeLow,
      bodyAgeRangeHigh,
    ]
  )

  const measureTrends: TrendDef[] = useMemo(
    () => [
      { key: 'waist', label: 'รอบเอว', color: '#6C8CA8', unit: 'ซม.', data: waistTrend, iconKey: 'ruler' },
      { key: 'chest', label: 'รอบอก', color: '#A87F5F', unit: 'ซม.', data: chestTrend, iconKey: 'ruler' },
      { key: 'arm', label: 'รอบต้นแขน', color: '#8C6CA8', unit: 'ซม.', data: armTrend, iconKey: 'ruler' },
      { key: 'thigh', label: 'รอบต้นขา', color: '#5F8FA8', unit: 'ซม.', data: thighTrend, iconKey: 'ruler' },
    ],
    [waistTrend, chestTrend, armTrend, thighTrend]
  )

  // สรุปภาพรวม (วงแหวน + ดีมาก/มาตรฐาน/ควรปรับปรุง) — ใช้ค่าล่าสุดจริง (ไม่ขึ้นกับช่วง 7/30/90 วันที่เลือกดูกราฟ)
  const healthScoreItems = useMemo(() => {
    const items: { label: string; status: 'good' | 'standard' | 'needsWork' }[] = []
    if (latest?.weight_kg != null && weightRangeLow !== null && weightRangeHigh !== null) {
      items.push({ label: 'น้ำหนัก', status: classifyMetric(zoneOf(latest.weight_kg, weightRangeLow, weightRangeHigh), 'neutral') })
    }
    if (latest?.body_fat_pct != null) {
      items.push({ label: 'ไขมันในร่างกาย', status: classifyMetric(zoneOf(latest.body_fat_pct, 18, 28), 'lowerBetter') })
    }
    if (latest?.skeletal_muscle_kg != null && skeletalRangeLow !== null && skeletalRangeHigh !== null) {
      items.push({
        label: 'กล้ามเนื้อโครงร่าง',
        status: classifyMetric(zoneOf(latest.skeletal_muscle_kg, skeletalRangeLow, skeletalRangeHigh), 'higherBetter'),
      })
    }
    if (latest?.body_fat_kg != null && fatMassRangeLow !== null && fatMassRangeHigh !== null) {
      items.push({ label: 'มวลไขมัน', status: classifyMetric(zoneOf(latest.body_fat_kg, fatMassRangeLow, fatMassRangeHigh), 'lowerBetter') })
    }
    if (bmi !== null) {
      items.push({ label: 'BMI', status: classifyMetric(zoneOf(bmi, 18.5, 25), 'neutral') })
    }
    if (latest?.visceral_fat_grade != null) {
      items.push({ label: 'ไขมันช่องท้อง', status: classifyMetric(zoneOf(latest.visceral_fat_grade, 1, 9), 'lowerBetter') })
    }
    if (latest?.muscle_kg != null && muscleRangeLow !== null && muscleRangeHigh !== null) {
      items.push({ label: 'มวลกล้ามเนื้อ', status: classifyMetric(zoneOf(latest.muscle_kg, muscleRangeLow, muscleRangeHigh), 'higherBetter') })
    }
    if (latest?.body_age_years != null && bodyAgeRangeLow !== null && bodyAgeRangeHigh !== null) {
      items.push({ label: 'อายุร่างกาย', status: classifyMetric(zoneOf(latest.body_age_years, bodyAgeRangeLow, bodyAgeRangeHigh), 'lowerBetter') })
    }
    return items
  }, [
    latest,
    bmi,
    weightRangeLow,
    weightRangeHigh,
    skeletalRangeLow,
    skeletalRangeHigh,
    fatMassRangeLow,
    fatMassRangeHigh,
    muscleRangeLow,
    muscleRangeHigh,
    bodyAgeRangeLow,
    bodyAgeRangeHigh,
  ])

  const healthScore = useMemo(() => summarizeHealthScore(healthScoreItems), [healthScoreItems])

  // Insight ที่คำนวณจากการเปลี่ยนแปลงจริงในช่วงเวลาที่เลือกดู (ไม่ใช่คำแนะนำทั่วไปที่ไม่มีข้อมูลรองรับ)
  const healthInsights: Insight[] = useMemo(() => {
    const firstLast = (data: { value: number }[]) => (data.length > 1 ? { first: data[0].value, last: data[data.length - 1].value } : undefined)
    return computeHealthTrendInsights({
      weight: firstLast(weightTrend),
      bodyFatPct: firstLast(bodyFatTrend),
      skeletalMuscle: firstLast(skeletalMuscleTrend),
      bodyFatKg: firstLast(bodyFatKgTrend),
      muscleMass: firstLast(muscleTrend),
      bodyAge: firstLast(bodyAgeTrend),
    })
  }, [weightTrend, bodyFatTrend, skeletalMuscleTrend, bodyFatKgTrend, muscleTrend, bodyAgeTrend])

  function goalCurrentValue(goal: Goal): number | null {
    if (goal.goal_type === 'weight') return latest?.weight_kg ?? null
    if (goal.goal_type === 'body_fat') return latest?.body_fat_pct ?? null
    return null
  }

  function goalProgressPct(goal: Goal): number | null {
    const current = goalCurrentValue(goal)
    if (current === null || goal.target_value === null) return null
    const start = goal.starting_value ?? current
    if (goal.target_value === start) return current >= goal.target_value ? 100 : 0
    return Math.min(100, Math.max(0, ((current - start) / (goal.target_value - start)) * 100))
  }

  const activeTrendList = trendGroup === 'comp' ? compTrends : measureTrends
  const availableTrendIdx = activeTrendList.findIndex((t) => t.data.length > 1)
  const selectedTrend =
    trendMetric !== 'all'
      ? (activeTrendList[trendMetric]?.data.length ?? 0) > 1
        ? activeTrendList[trendMetric]
        : activeTrendList[availableTrendIdx]
      : undefined
  const allTrendsWithData = activeTrendList.filter((t) => t.data.length > 1)

  if (loading) {
    return <LoadingState />
  }

  if (loadError) {
    return <ErrorState title="โหลดข้อมูลสุขภาพไม่สำเร็จ" message={loadError} onRetry={load} />
  }

  async function handleShare() {
    const shareText = `สุขภาพร่างกายของฉัน — น้ำหนัก ${latest?.weight_kg != null ? toDisplay(latest.weight_kg).toFixed(1) : '—'} ${unit}, BMI ${bmi !== null ? bmi.toFixed(1) : '—'}`
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'สุขภาพร่างกาย', text: shareText })
      } catch {
        // ผู้ใช้กดยกเลิก share sheet — ไม่ต้องทำอะไรต่อ
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(shareText)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracked uppercase">สุขภาพร่างกาย</h1>
          <p className="text-xs text-muted mt-0.5">ติดตามและวิเคราะห์แนวโน้มสุขภาพของคุณ</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-1.5 text-[11px] font-display tracked uppercase text-muted border border-line rounded-full px-3 py-2 active:scale-[0.99] transition"
          >
            <ShareIcon />
            แชร์รายงาน
          </button>
          {latest?.measured_at && (
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-muted border border-line rounded-full px-3 py-2 whitespace-nowrap">
              <CalendarIcon />
              {shortLabel(latest.measured_at)}
            </span>
          )}
        </div>
      </div>

      <div className="flex rounded-full bg-surface p-1 border border-line">
        {(
          [
            { key: 'overview', label: 'ภาพรวม' },
            { key: 'trends', label: 'แนวโน้ม' },
            { key: 'log', label: 'บันทึกข้อมูล' },
            { key: 'photos', label: 'Photo' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 rounded-full text-[11px] sm:text-sm font-display tracked uppercase transition ${
              tab === t.key ? (t.key === 'photos' ? 'bg-rust text-ink' : 'bg-steel text-bg') : 'text-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            <MiniStat label="น้ำหนักล่าสุด" value={latest?.weight_kg != null ? toDisplay(latest.weight_kg) : null} unit={unit} />
            <HeightSetting key={profile?.height_cm ?? 'unset'} profile={profile} onSaved={(p) => setProfile(p)} />
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
            <MiniStat label="อายุร่างกาย" value={latest?.body_age_years} unit="ปี" decimals={0} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4 items-start">
            {(bmi !== null || latest?.body_fat_pct != null) && (
              <ObesityAnalysisChart bmi={bmi} bodyFatPct={latest?.body_fat_pct ?? null} />
            )}

            {muscleFatItems.length > 0 ? (
              <MuscleFatAnalysisChart items={muscleFatItems} unit={unit} />
            ) : (
              <p className="text-[11px] text-muted bg-surface border border-line shadow-elevated rounded-lg px-4 py-3">
                อยากดูกราฟ Muscle Fat Analysis (น้ำหนัก/กล้ามเนื้อโครงร่าง/มวลไขมัน เทียบช่วงมาตรฐาน) — กรอกช่วงมาตรฐานจากรายงานเครื่องชั่งในฟอร์มด้านล่าง (ช่อง &quot;ช่วงมาตรฐาน&quot;) สักครั้ง แล้วกราฟจะขึ้นให้อัตโนมัติ
              </p>
            )}
          </div>
        </div>
      )}

      {tab === 'trends' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setTrendGroup('comp')
                  setTrendMetric('all')
                }}
                className={`px-3 py-2 rounded-full text-[11px] font-display tracked uppercase transition ${
                  trendGroup === 'comp' ? 'bg-amber text-bg' : 'bg-surface border border-line text-muted'
                }`}
              >
                น้ำหนัก/ไขมัน/กล้ามเนื้อ
              </button>
              <button
                type="button"
                onClick={() => {
                  setTrendGroup('measure')
                  setTrendMetric('all')
                }}
                className={`px-3 py-2 rounded-full text-[11px] font-display tracked uppercase transition ${
                  trendGroup === 'measure' ? 'bg-amber text-bg' : 'bg-surface border border-line text-muted'
                }`}
              >
                สัดส่วนร่างกาย
              </button>
            </div>
            <div className="flex rounded-full bg-surface p-1 border border-line shrink-0">
              {([7, 30, 90] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setTrendPeriodDays(d)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-display tracked uppercase transition ${
                    trendPeriodDays === d ? 'bg-steel text-bg' : 'text-muted'
                  }`}
                >
                  {d} วัน
                </button>
              ))}
            </div>
          </div>

          {trendGroup === 'comp' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <TopStatCard
                label="น้ำหนัก"
                value={latest?.weight_kg != null ? toDisplay(latest.weight_kg) : null}
                unit={unit}
                low={weightRangeLow != null ? toDisplay(weightRangeLow) : null}
                high={weightRangeHigh != null ? toDisplay(weightRangeHigh) : null}
                iconKey="weight"
              />
              <TopStatCard label="ไขมันในร่างกาย" value={latest?.body_fat_pct ?? null} unit="%" low={18} high={28} iconKey="fat" />
              <TopStatCard
                label="กล้ามเนื้อโครงร่าง"
                value={latest?.skeletal_muscle_kg != null ? toDisplay(latest.skeletal_muscle_kg) : null}
                unit={unit}
                low={skeletalRangeLow != null ? toDisplay(skeletalRangeLow) : null}
                high={skeletalRangeHigh != null ? toDisplay(skeletalRangeHigh) : null}
                iconKey="muscle"
              />
              <TopStatCard
                label="มวลไขมัน"
                value={latest?.body_fat_kg != null ? toDisplay(latest.body_fat_kg) : null}
                unit={unit}
                low={fatMassRangeLow != null ? toDisplay(fatMassRangeLow) : null}
                high={fatMassRangeHigh != null ? toDisplay(fatMassRangeHigh) : null}
                iconKey="fat"
              />
              <TopStatCard label="BMI" value={bmi} unit="kg/m²" low={18.5} high={25} iconKey="bmi" />
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-display text-sm tracked uppercase text-muted flex items-center gap-1.5">
                  แนวโน้มรายตัวชี้วัด
                  <span className="text-muted">
                    <InfoIcon />
                  </span>
                </h2>
                <select
                  value={trendMetric === 'all' ? 'all' : activeTrendList.findIndex((t) => t === selectedTrend)}
                  onChange={(e) => setTrendMetric(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="input text-xs py-1.5 w-auto max-w-[55%] sm:max-w-[220px]"
                >
                  <option value="all">แสดงทั้งหมด</option>
                  {activeTrendList.map((t, i) => (
                    <option key={t.key} value={i} disabled={t.data.length < 2}>
                      แนวโน้ม{t.label}
                      {t.data.length < 2 ? ' (ยังไม่มีข้อมูลพอ)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {trendMetric === 'all' ? (
                allTrendsWithData.length > 0 ? (
                  <div className="space-y-4">
                    {allTrendsWithData.map((t) => (
                      <MetricRowCard key={t.key} trend={t} periodLabel={`${trendPeriodDays} วัน`} />
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted bg-surface border border-line shadow-elevated rounded-lg px-4 py-3">
                    ยังไม่มีข้อมูลพอสำหรับดูแนวโน้มในหมวดนี้ — บันทึกข้อมูลอย่างน้อย 2 ครั้งก่อน แล้วกราฟจะขึ้นให้อัตโนมัติ
                  </p>
                )
              ) : selectedTrend && selectedTrend.data.length > 1 ? (
                <MetricRowCard trend={selectedTrend} periodLabel={`${trendPeriodDays} วัน`} />
              ) : (
                <p className="text-[11px] text-muted bg-surface border border-line shadow-elevated rounded-lg px-4 py-3">
                  ยังไม่มีข้อมูลพอสำหรับดูแนวโน้มในหมวดนี้ — บันทึกข้อมูลอย่างน้อย 2 ครั้งก่อน แล้วกราฟจะขึ้นให้อัตโนมัติ
                </p>
              )}
            </div>

            <div className="space-y-4">
              <HealthScoreCard score={healthScore} />

              <div className="space-y-2">
                <h2 className="font-display text-sm tracked uppercase text-muted">Insight &amp; คำแนะนำ</h2>
                {healthInsights.length > 0 ? (
                  <div className="space-y-2">
                    {healthInsights.map((insight) => (
                      <InsightCard key={insight.id} insight={insight} />
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted bg-surface border border-line shadow-elevated rounded-lg px-4 py-3">
                    ยังไม่มีการเปลี่ยนแปลงที่ชัดเจนพอในช่วง {trendPeriodDays} วันนี้
                  </p>
                )}
              </div>

              <GoalsCard goals={goals} unit={unit} goalCurrentValue={goalCurrentValue} goalProgressPct={goalProgressPct} />
            </div>
          </div>
        </div>
      )}

      {tab === 'log' && (
        <div className="space-y-6">
          <MetricForm
            onSaved={(m) => setMetrics((prev) => [m, ...prev.filter((x) => x.id !== m.id)])}
            onHeightExtracted={saveHeight}
          />

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
      )}

      {tab === 'photos' && <PhotosTab photos={photos} onChanged={load} />}
    </div>
  )
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.3 10.7 15.7 6.3M8.3 13.3 15.7 17.7" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

function ScaleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="10" width="18" height="10" rx="2" />
      <circle cx="12" cy="15" r="2" />
      <path d="M8 10 L12 4 L16 10" />
    </svg>
  )
}

function MuscleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 20c0-5 1-8 2-10 1-2 3-3 5-3 3 0 5 2 5 5 0 2-1 3-3 3-1 0-2-1-2-2" />
      <path d="M8 20c0-3 .5-5 1.5-7" />
    </svg>
  )
}

function DropletsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="8" cy="9" r="2" />
      <circle cx="16" cy="9" r="1.5" />
      <circle cx="12" cy="16" r="2.5" />
    </svg>
  )
}

const ZONE_LABEL_TH: Record<'Low' | 'Standard' | 'High', string> = { Low: 'ต่ำ', Standard: 'มาตรฐาน', High: 'สูง' }

function ZoneBadge({ zone }: { zone: 'Low' | 'Standard' | 'High' }) {
  const cls =
    zone === 'Low' ? 'bg-steeldim text-steel' : zone === 'High' ? 'bg-rustdim text-rusttext' : 'bg-mossdim text-moss'
  return (
    <span className={`text-[10px] font-display tracked uppercase px-2 py-1 rounded-full whitespace-nowrap ${cls}`}>
      {ZONE_LABEL_TH[zone]}
    </span>
  )
}

function FireIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 2c1 3-3 4-3 7a3 3 0 0 0 6 0c1.5 1.5 2 3.5 2 5a5 5 0 0 1-10 0c0-4 3-5 3-9 0-1 .5-2.2 2-3z" />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20c1-4 3.8-6 6.5-6s5.5 2 6.5 6" />
    </svg>
  )
}

function RulerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="8" width="18" height="8" rx="1.5" />
      <path d="M7 8v3M11 8v3M15 8v3" />
    </svg>
  )
}

function LeafIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 19c8 1 13-4 14-14-9 0-14 5-14 14z" />
      <path d="M5 19c2-4 5-7 9-9" />
    </svg>
  )
}

function DiamondIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3 20 12 12 21 4 12z" />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 20.5s-7.5-4.6-9.8-9.3C.8 7.7 2.6 4.5 6 4c2-.3 3.7.7 6 3 2.3-2.3 4-3.3 6-3 3.4.5 5.2 3.7 3.8 7.2-2.3 4.7-9.8 9.3-9.8 9.3z" />
    </svg>
  )
}

const TREND_ICONS: Record<string, () => JSX.Element> = {
  weight: ScaleIcon,
  fat: DropletsIcon,
  muscle: MuscleIcon,
  water: DropletsIcon,
  bmi: PersonIcon,
  salt: DiamondIcon,
  protein: LeafIcon,
  fire: FireIcon,
  ruler: RulerIcon,
  heart: HeartIcon,
}

// การ์ดสรุปตัวเลขล่าสุดด้านบน (พร้อม badge Low/Standard/High) — ใช้ค่า "ล่าสุดจริง" ไม่ขึ้นกับช่วงเวลาที่เลือกดูกราฟ
function TopStatCard({
  label,
  value,
  unit,
  decimals = 1,
  low,
  high,
  iconKey,
}: {
  label: string
  value: number | null | undefined
  unit: string
  decimals?: number
  low?: number | null
  high?: number | null
  iconKey: string
}) {
  const Icon = TREND_ICONS[iconKey] ?? ScaleIcon
  const zone = value != null && low != null && high != null ? zoneOf(value, low, high) : null
  return (
    <div className="bg-surface border border-line shadow-elevated rounded-lg px-4 py-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center bg-steel/15 text-steel">
          <Icon />
        </span>
        <span className="text-[11px] tracked uppercase text-muted truncate">{label}</span>
      </div>
      <p className="font-mono text-xl tabular text-ink">
        {value != null ? value.toFixed(decimals) : '—'}
        <span className="text-xs text-muted ml-1">{unit}</span>
      </p>
      {zone && (
        <div className="mt-1.5">
          <ZoneBadge zone={zone} />
        </div>
      )}
    </div>
  )
}

// การ์ดแนวโน้มรายตัวชี้วัดแบบกะทัดรัด — ไอคอน+ชื่อ+ค่าปัจจุบัน (คอลัมน์ซ้าย), กราฟเส้น (คอลัมน์กลาง),
// แถบ Low/Standard/High (คอลัมน์ขวา) เรียงเป็นแถวเดียวกัน บนจอเล็กจะวางซ้อนกันแนวตั้งแทน
function MetricRowCard({ trend, periodLabel }: { trend: TrendDef; periodLabel: string }) {
  const data = trend.data
  const dec = trend.decimals ?? 1
  const latestVal = data.length > 0 ? data[data.length - 1].value : null
  const firstVal = data.length > 1 ? data[0].value : null
  const delta = latestVal !== null && firstVal !== null ? latestVal - firstVal : null
  const zone = trend.range && latestVal !== null ? zoneOf(latestVal, trend.range.low, trend.range.high) : null
  const Icon = TREND_ICONS[trend.iconKey ?? 'ruler'] ?? ScaleIcon
  const deltaGood = delta !== null && (trend.direction === 'higherBetter' ? delta >= 0 : delta <= 0)

  return (
    <section className="bg-surface border border-line shadow-elevated rounded-lg p-4">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,150px)_1fr_minmax(0,170px)] gap-3 sm:gap-4 sm:items-center">
        {/* คอลัมน์ซ้าย: ไอคอน + ชื่อตัวชี้วัด (อยู่ข้างหน้า) + ค่าปัจจุบัน + badge */}
        <div className="flex items-start justify-between gap-2 sm:block">
          <div className="flex items-start gap-2 min-w-0">
            <span
              className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center"
              style={{ background: `${trend.color}26`, color: trend.color }}
            >
              <Icon />
            </span>
            <div className="min-w-0">
              <span className="block font-display text-xs tracked uppercase text-ink truncate">{trend.label}</span>
              <span className="font-mono text-lg tabular text-ink whitespace-nowrap">
                {latestVal !== null ? latestVal.toFixed(dec) : '—'}
                <span className="text-xs text-muted ml-1">{trend.unit}</span>
              </span>
              {zone && (
                <div className="mt-1">
                  <ZoneBadge zone={zone} />
                </div>
              )}
            </div>
          </div>
          {delta !== null && (
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
                deltaGood ? 'bg-mossdim text-moss' : 'bg-rustdim text-rusttext'
              }`}
            >
              {delta > 0 ? '+' : ''}
              {delta.toFixed(dec)} {trend.unit}
            </span>
          )}
        </div>

        {/* คอลัมน์กลาง: กราฟเส้น */}
        {data.length > 1 ? (
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#2E333A" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#9498A0', fontSize: 9 }} axisLine={{ stroke: '#2E333A' }} tickLine={false} />
                <YAxis tick={{ fill: '#9498A0', fontSize: 9 }} axisLine={false} tickLine={false} width={26} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: '#1C1F24', border: '1px solid #2E333A', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#9498A0' }}
                  itemStyle={{ color: '#F3F0E8' }}
                  formatter={(v: number) => [`${v} ${trend.unit}`, trend.label]}
                />
                <Line type="monotone" dataKey="value" stroke={trend.color} strokeWidth={2} dot={{ r: 2, fill: trend.color }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-[11px] text-muted py-6 text-center">ยังไม่มีข้อมูลพอในช่วง{periodLabel} — บันทึกอย่างน้อย 2 ครั้ง</p>
        )}

        {/* คอลัมน์ขวา: แถบ Low/Standard/High */}
        {trend.range ? (
          <div>
            <div className="flex text-[9px] mb-1 text-center">
              <span className="flex-1 text-steel">Low</span>
              <span className="flex-1 text-moss">Standard</span>
              <span className="flex-1 text-rusttext">High</span>
            </div>
            <div className="flex h-1.5 rounded-full overflow-hidden">
              <div className="flex-1 bg-steel/70" />
              <div className="flex-1 bg-moss/70" />
              <div className="flex-1 bg-rust/70" />
            </div>
            <div className="flex justify-between text-[9px] text-muted mt-1">
              <span>{trend.range.low.toFixed(dec)}</span>
              <span className="text-ink">
                {((trend.range.low + trend.range.high) / 2).toFixed(dec)}
              </span>
              <span>{trend.range.high.toFixed(dec)}</span>
            </div>
            <p className="text-[9px] text-muted mt-1">
              ช่วงมาตรฐาน: {trend.range.low.toFixed(dec)} - {trend.range.high.toFixed(dec)} {trend.unit}
            </p>
            {trend.range.note && <p className="text-[9px] text-muted mt-0.5 italic">{trend.range.note}</p>}
          </div>
        ) : (
          <div className="hidden sm:block" />
        )}
      </div>
    </section>
  )
}

// วงแหวนสรุป + สัดส่วน ดีมาก/มาตรฐาน/ควรปรับปรุง จากตัวชี้วัดล่าสุดที่มีช่วงอ้างอิงให้เทียบ
function HealthScoreCard({ score }: { score: { good: number; standard: number; needsWork: number; total: number; score: number } }) {
  const pct = score.total > 0 ? (score.score / score.total) * 100 : 0
  return (
    <div className="bg-surface border border-line shadow-elevated rounded-lg p-4">
      <h2 className="font-display text-sm tracked uppercase text-muted mb-3">สรุปภาพรวม</h2>
      {score.total === 0 ? (
        <p className="text-[11px] text-muted">กรอกช่วงมาตรฐานในฟอร์มบันทึกข้อมูล เพื่อดูสรุปภาพรวมตรงนี้</p>
      ) : (
        <div className="flex items-center gap-4">
          <GoalRing pct={pct} size={88} strokeWidth={8} color="#E8A33D" ariaLabel="สรุปเกณฑ์สุขภาพ" />
          <div className="text-xs space-y-1.5">
            <p className="font-mono text-ink text-sm mb-1">
              {score.score} / {score.total} <span className="text-muted text-[11px]">อยู่ในเกณฑ์ดี</span>
            </p>
            <p className="flex items-center gap-1.5 text-muted">
              <span className="w-2 h-2 rounded-full bg-moss inline-block" /> ดีมาก <span className="ml-auto text-ink">{score.good}</span>
            </p>
            <p className="flex items-center gap-1.5 text-muted">
              <span className="w-2 h-2 rounded-full bg-steel inline-block" /> มาตรฐาน <span className="ml-auto text-ink">{score.standard}</span>
            </p>
            <p className="flex items-center gap-1.5 text-muted">
              <span className="w-2 h-2 rounded-full bg-rust inline-block" /> ควรปรับปรุง <span className="ml-auto text-ink">{score.needsWork}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// การ์ดเป้าหมาย (จากตาราง goals) — รองรับเฉพาะ goal_type น้ำหนัก/Body Fat เพราะเป็นค่าที่หน้านี้มีให้เทียบ
function GoalsCard({
  goals,
  unit,
  goalCurrentValue,
  goalProgressPct,
}: {
  goals: Goal[]
  unit: string
  goalCurrentValue: (g: Goal) => number | null
  goalProgressPct: (g: Goal) => number | null
}) {
  return (
    <div className="bg-surface border border-line shadow-elevated rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-sm tracked uppercase text-muted">เป้าหมายของคุณ</h2>
        <a href="/calendar" className="text-[10px] text-amber underline">
          แก้ไขเป้าหมาย
        </a>
      </div>
      {goals.length === 0 ? (
        <p className="text-[11px] text-muted">ยังไม่ได้ตั้งเป้าหมาย ไปตั้งเป้าหมายน้ำหนักหรือ Body Fat ได้ที่หน้าปฏิทิน</p>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => {
            const current = goalCurrentValue(g)
            const pct = goalProgressPct(g)
            const label = g.goal_type === 'weight' ? `น้ำหนัก (${unit})` : 'Body Fat (%)'
            return (
              <div key={g.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-ink">{label}</span>
                  <span className="font-mono text-muted">
                    {current !== null ? current.toFixed(1) : '—'} / {g.target_value?.toFixed(1) ?? '—'}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface2 overflow-hidden">
                  <div className="h-full bg-amber rounded-full" style={{ width: `${pct ?? 0}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
      <a
        href="/calendar"
        className="mt-3 block text-center text-[11px] font-display tracked uppercase text-bg bg-amber rounded-lg py-2"
      >
        ดูเป้าหมายทั้งหมด
      </a>
    </div>
  )
}

const MUSCLE_FAT_META: Record<string, { Icon: () => JSX.Element; bg: string; fg: string }> = {
  Weight: { Icon: ScaleIcon, bg: 'bg-moss/15', fg: 'text-moss' },
  'Skeletal Muscle': { Icon: MuscleIcon, bg: 'bg-violet/15', fg: 'text-violet' },
  'Fat Mass': { Icon: DropletsIcon, bg: 'bg-amber/15', fg: 'text-amber' },
}

function ObesityAnalysisChart({ bmi, bodyFatPct }: { bmi: number | null; bodyFatPct: number | null }) {
  return (
    <section>
      <h2 className="flex items-center gap-2 font-display text-sm tracked uppercase text-ink mb-3">
        <ScaleIcon />
        Obesity Analysis
        <span className="text-muted">
          <InfoIcon />
        </span>
      </h2>
      <div className="bg-surface border border-line shadow-elevated rounded-lg p-4 space-y-5">
        {bmi !== null && <ZoneBarRow label="BMI (kg/m²)" value={bmi} min={10} low={18.5} high={25} max={40} decimals={1} />}
        {bmi !== null && bodyFatPct !== null && <div className="border-t border-line" />}
        {bodyFatPct !== null && (
          <ZoneBarRow label="Body fat rate (%)" value={bodyFatPct} min={8} low={18} high={28} max={48} decimals={1} unit="%" />
        )}
      </div>
    </section>
  )
}

function ZoneBarRow({
  label,
  value,
  min,
  low,
  high,
  max,
  decimals = 1,
  unit = '',
}: {
  label: string
  value: number
  min: number
  low: number
  high: number
  max: number
  decimals?: number
  unit?: string
}) {
  const pct = (v: number) => ((Math.min(Math.max(v, min), max) - min) / (max - min)) * 100
  const lowPct = pct(low)
  const highPct = pct(high)
  const valuePct = pct(value)
  const zone = value < low ? 'Low' : value > high ? 'High' : 'Standard'

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-sm text-ink font-medium">
          {label}
          <span className="text-muted">
            <InfoIcon />
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-lg tabular text-ink">
            {value.toFixed(decimals)}
            {unit && <span className="text-xs text-muted ml-0.5">{unit}</span>}
          </span>
          <ZoneBadge zone={zone} />
          <span className="text-muted">
            <ChevronRightIcon />
          </span>
        </span>
      </div>
      <div className="flex text-[10px] mb-1.5">
        <span style={{ width: `${lowPct}%` }} className="truncate text-steel">
          Low
        </span>
        <span style={{ width: `${highPct - lowPct}%` }} className="text-center truncate text-moss">
          Standard
        </span>
        <span style={{ width: `${100 - highPct}%` }} className="text-right truncate text-rusttext">
          High
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-surface2 overflow-hidden">
        <div className="absolute inset-y-0 bg-steel/70" style={{ left: 0, width: `${lowPct}%` }} />
        <div className="absolute inset-y-0 bg-moss/70" style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }} />
        <div className="absolute inset-y-0 bg-rust/70" style={{ left: `${highPct}%`, right: 0 }} />
        <div
          className="absolute top-1/2 w-3 h-3 rounded-full bg-bg border-[3px] border-ink"
          style={{ left: `${valuePct}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted mt-1.5">
        <span>{min.toFixed(decimals)}</span>
        <span>{low.toFixed(decimals)}</span>
        <span>{high.toFixed(decimals)}</span>
        <span>{max.toFixed(decimals)}</span>
      </div>
    </div>
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
      <h2 className="flex items-center gap-2 font-display text-sm tracked uppercase text-ink mb-3">
        <MuscleIcon />
        Muscle &amp; Fat Analysis
        <span className="text-muted">
          <InfoIcon />
        </span>
      </h2>
      <div className="bg-surface border border-line shadow-elevated rounded-lg divide-y divide-line">
        {items.map((it) => (
          <div key={it.label} className="p-4">
            <MuscleFatBarRow {...it} unit={unit} />
          </div>
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
  const zone = value < low ? 'Low' : value > high ? 'High' : 'Standard'
  const meta = MUSCLE_FAT_META[label] ?? { Icon: ScaleIcon, bg: 'bg-steel/15', fg: 'text-steel' }
  const Icon = meta.Icon

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-3">
          <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${meta.bg} ${meta.fg}`}>
            <Icon />
          </span>
          <span className="flex items-center gap-1.5 text-sm text-ink font-medium">
            {label}
            <span className="text-muted">
              <InfoIcon />
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-lg tabular text-ink">
            {value.toFixed(1)}
            <span className="text-xs text-muted ml-0.5">{unit}</span>
          </span>
          <ZoneBadge zone={zone} />
          <span className="text-muted">
            <ChevronRightIcon />
          </span>
        </span>
      </div>
      <p className="text-[11px] text-steel mb-1.5 ml-12">Low {low.toFixed(1)}</p>
      <div className="relative h-2.5 rounded-full bg-surface2 overflow-hidden">
        <div className="absolute inset-y-0 bg-steel/70" style={{ left: 0, width: `${lowPct}%` }} />
        <div className="absolute inset-y-0 bg-moss/70" style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }} />
        <div className="absolute inset-y-0 bg-rust/70" style={{ left: `${highPct}%`, right: 0 }} />
        <div
          className="absolute top-1/2 w-3 h-3 rounded-full bg-bg border-[3px] border-ink"
          style={{ left: `${valuePct}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted mt-1.5">
        <span>{low.toFixed(1)}</span>
        <span className="italic">(ideal range)</span>
        <span>{high.toFixed(1)}</span>
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
      <div className="bg-surface border border-line shadow-elevated rounded-lg px-4 py-3.5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] tracked uppercase text-muted">ส่วนสูง</p>
          <button type="button" onClick={() => setEditing(true)} className="text-[10px] text-amber underline">
            แก้ไข
          </button>
        </div>
        <p className="font-mono text-2xl tabular text-amber">
          {profile?.height_cm}
          <span className="text-xs text-muted ml-1">ซม.</span>
        </p>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-line shadow-elevated rounded-lg px-4 py-3.5">
      <p className="text-[11px] tracked uppercase text-muted mb-1.5">ส่วนสูง (ซม.)</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          placeholder="สำหรับคำนวณ BMI"
          className="input font-mono text-sm py-2"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !height}
          className="shrink-0 px-3 py-2 rounded-lg bg-steel text-bg text-xs font-display tracked uppercase disabled:opacity-50"
        >
          บันทึก
        </button>
      </div>
    </div>
  )
}

function MetricForm({
  onSaved,
  onHeightExtracted,
}: {
  onSaved: (m: BodyMetric) => void
  onHeightExtracted?: (heightCm: number) => Promise<void>
}) {
  const supabase = createClient()
  const { unit, toKg, toDisplay } = useWeightUnit()
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
  const [muscleRangeLow, setMuscleRangeLow] = useState('')
  const [muscleRangeHigh, setMuscleRangeHigh] = useState('')
  const [bodyAge, setBodyAge] = useState('')
  const [bodyAgeRangeLow, setBodyAgeRangeLow] = useState('')
  const [bodyAgeRangeHigh, setBodyAgeRangeHigh] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [heightNote, setHeightNote] = useState<string | null>(null)

  function fmtKg(v: number | null): string {
    return v !== null ? String(Math.round(toDisplay(v) * 10) / 10) : ''
  }

  async function handleExtracted(data: ExtractedBodyReport) {
    // เปิด DevTools console ดูค่านี้ได้ ถ้าอยากเช็คว่าอ่านรูปได้ค่าอะไรบ้าง
    console.log('extracted body report', data)
    if (data.measured_at) setDate(data.measured_at)
    if (data.height_cm !== null) {
      setHeightNote(null)
      try {
        await onHeightExtracted?.(data.height_cm)
        setHeightNote(`บันทึกส่วนสูง ${data.height_cm} ซม. ให้อัตโนมัติแล้ว`)
      } catch (err) {
        console.error('บันทึกส่วนสูงอัตโนมัติไม่สำเร็จ', err)
        setHeightNote('อ่านส่วนสูงได้ แต่บันทึกลงโปรไฟล์ไม่สำเร็จ ลองกรอกเองด้านบน หรือดู console')
      }
    } else {
      setHeightNote('รูปนี้อ่านส่วนสูงไม่ได้ — กรอกเองที่ช่อง "ส่วนสูง" ด้านบนสุดของหน้าแทน')
    }
    if (data.weight_kg !== null) setWeight(fmtKg(data.weight_kg))
    if (data.body_fat_pct !== null) setBodyFat(String(data.body_fat_pct))
    if (data.muscle_kg !== null) setMuscle(fmtKg(data.muscle_kg))
    if (data.body_fat_kg !== null) setBodyFatKg(fmtKg(data.body_fat_kg))
    if (data.body_water_kg !== null) setBodyWater(fmtKg(data.body_water_kg))
    if (data.inorganic_salt_kg !== null) setInorganicSalt(fmtKg(data.inorganic_salt_kg))
    if (data.protein_kg !== null) setProtein(fmtKg(data.protein_kg))
    if (data.skeletal_muscle_kg !== null) setSkeletalMuscle(fmtKg(data.skeletal_muscle_kg))
    if (data.visceral_fat_grade !== null) setVisceralFat(String(data.visceral_fat_grade))
    if (data.bmr_kcal !== null) setBmr(String(data.bmr_kcal))
    if (data.body_age_years !== null) setBodyAge(String(data.body_age_years))
    const hasRanges =
      data.weight_range_low !== null ||
      data.weight_range_high !== null ||
      data.skeletal_muscle_range_low !== null ||
      data.skeletal_muscle_range_high !== null ||
      data.fat_mass_range_low !== null ||
      data.fat_mass_range_high !== null ||
      data.muscle_range_low !== null ||
      data.muscle_range_high !== null ||
      data.body_age_range_low !== null ||
      data.body_age_range_high !== null
    if (hasRanges) {
      setShowRanges(true)
      if (data.weight_range_low !== null) setWeightRangeLow(fmtKg(data.weight_range_low))
      if (data.weight_range_high !== null) setWeightRangeHigh(fmtKg(data.weight_range_high))
      if (data.skeletal_muscle_range_low !== null) setSkeletalRangeLow(fmtKg(data.skeletal_muscle_range_low))
      if (data.skeletal_muscle_range_high !== null) setSkeletalRangeHigh(fmtKg(data.skeletal_muscle_range_high))
      if (data.fat_mass_range_low !== null) setFatMassRangeLow(fmtKg(data.fat_mass_range_low))
      if (data.fat_mass_range_high !== null) setFatMassRangeHigh(fmtKg(data.fat_mass_range_high))
      if (data.muscle_range_low !== null) setMuscleRangeLow(fmtKg(data.muscle_range_low))
      if (data.muscle_range_high !== null) setMuscleRangeHigh(fmtKg(data.muscle_range_high))
      if (data.body_age_range_low !== null) setBodyAgeRangeLow(String(data.body_age_range_low))
      if (data.body_age_range_high !== null) setBodyAgeRangeHigh(String(data.body_age_range_high))
    }
  }

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
      muscle_range_low: muscleRangeLow ? toKg(Number(muscleRangeLow)) : null,
      muscle_range_high: muscleRangeHigh ? toKg(Number(muscleRangeHigh)) : null,
      body_age_years: bodyAge ? Number(bodyAge) : null,
      body_age_range_low: bodyAgeRangeLow ? Number(bodyAgeRangeLow) : null,
      body_age_range_high: bodyAgeRangeHigh ? Number(bodyAgeRangeHigh) : null,
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
    setMuscleRangeLow('')
    setMuscleRangeHigh('')
    setBodyAge('')
    setBodyAgeRangeLow('')
    setBodyAgeRangeHigh('')
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

      <ImportBodyReportPhoto onExtracted={handleExtracted} />
      {heightNote && <p className="text-[11px] text-muted -mt-1">{heightNote}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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
        <LabeledInput label="อายุร่างกาย (ปี)" value={bodyAge} onChange={setBodyAge} />
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <LabeledInput label={`น้ำหนัก ต่ำสุด (${unit})`} value={weightRangeLow} onChange={setWeightRangeLow} />
              <LabeledInput label={`น้ำหนัก สูงสุด (${unit})`} value={weightRangeHigh} onChange={setWeightRangeHigh} />
              <LabeledInput label={`กล้ามเนื้อโครงร่าง ต่ำสุด (${unit})`} value={skeletalRangeLow} onChange={setSkeletalRangeLow} />
              <LabeledInput label={`กล้ามเนื้อโครงร่าง สูงสุด (${unit})`} value={skeletalRangeHigh} onChange={setSkeletalRangeHigh} />
              <LabeledInput label={`มวลไขมัน ต่ำสุด (${unit})`} value={fatMassRangeLow} onChange={setFatMassRangeLow} />
              <LabeledInput label={`มวลไขมัน สูงสุด (${unit})`} value={fatMassRangeHigh} onChange={setFatMassRangeHigh} />
              <LabeledInput label={`มวลกล้ามเนื้อ ต่ำสุด (${unit})`} value={muscleRangeLow} onChange={setMuscleRangeLow} />
              <LabeledInput label={`มวลกล้ามเนื้อ สูงสุด (${unit})`} value={muscleRangeHigh} onChange={setMuscleRangeHigh} />
              <LabeledInput label="อายุร่างกาย ต่ำสุด (ปี)" value={bodyAgeRangeLow} onChange={setBodyAgeRangeLow} />
              <LabeledInput label="อายุร่างกาย สูงสุด (ปี)" value={bodyAgeRangeHigh} onChange={setBodyAgeRangeHigh} />
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
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
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
