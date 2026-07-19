'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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

  if (loading) {
    return <LoadingState />
  }

  if (loadError) {
    return <ErrorState title="โหลดข้อมูลสุขภาพไม่สำเร็จ" message={loadError} onRetry={load} />
  }

  return (
    <div className="space-y-6">
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
          </div>

          <HeightSetting profile={profile} onSaved={(p) => setProfile(p)} />

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

          <MetricForm onSaved={(m) => setMetrics((prev) => [m, ...prev.filter((x) => x.id !== m.id)])} />

          <section>
            <h2 className="font-display text-sm tracked uppercase text-muted mb-3">ประวัติการวัดผล</h2>
            {metrics.length === 0 ? (
              <p className="text-sm text-muted bg-surface border border-line rounded-lg px-4 py-6 text-center">
                ยังไม่มีข้อมูล เริ่มบันทึกครั้งแรกได้เลย
              </p>
            ) : (
              <ul className="rounded-lg bg-surface border border-line overflow-hidden">
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
      <div className="h-40 bg-surface border border-line rounded-lg p-3">
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

function MiniStat({ label, value, unit, decimals = 1 }: { label: string; value: number | null | undefined; unit?: string; decimals?: number }) {
  return (
    <div className="bg-surface border border-line rounded-lg px-4 py-3.5">
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
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 bg-surface border border-line rounded-lg p-4">
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
      <div className="bg-surface border border-line rounded-lg p-4 space-y-3">
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
                <img src={beforePhoto.url} alt="Before" className="w-full rounded-lg border border-line object-cover aspect-[3/4]" />
                <p className="text-center text-[11px] text-muted mt-1">{shortLabel(beforePhoto.taken_at)}</p>
              </div>
              <div>
                <img src={afterPhoto.url} alt="After" className="w-full rounded-lg border border-line object-cover aspect-[3/4]" />
                <p className="text-center text-[11px] text-muted mt-1">{shortLabel(afterPhoto.taken_at)}</p>
              </div>
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="font-display text-sm tracked uppercase text-muted mb-3">รูปทั้งหมด</h2>
        {photos.length === 0 ? (
          <p className="text-sm text-muted bg-surface border border-line rounded-lg px-4 py-6 text-center">
            ยังไม่มีรูป
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative group">
                {p.url && (
                  <img src={p.url} alt={p.label ?? ''} className="w-full aspect-square object-cover rounded-lg border border-line" />
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
