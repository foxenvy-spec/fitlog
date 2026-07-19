'use client'

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import type { Workout, BodyMetric, Goal } from '@/lib/types'

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function timestamp() {
  return new Date().toISOString().slice(0, 10)
}

export default function ExportPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restoreSummary, setRestoreSummary] = useState<string | null>(null)

  async function fetchAll() {
    const [wRes, bRes, gRes] = await Promise.all([
      supabase.from('workouts').select('*').order('performed_at', { ascending: false }),
      supabase.from('body_metrics').select('*').order('measured_at', { ascending: false }),
      supabase.from('goals').select('*').order('created_at', { ascending: false }),
    ])
    return {
      workouts: (wRes.data as Workout[]) ?? [],
      bodyMetrics: (bRes.data as BodyMetric[]) ?? [],
      goals: (gRes.data as Goal[]) ?? [],
    }
  }

  async function handleExportExcel() {
    setBusy('excel')
    setError(null)
    setMessage(null)
    try {
      const { workouts, bodyMetrics, goals } = await fetchAll()
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(workouts), 'Workouts')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bodyMetrics), 'BodyMetrics')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(goals), 'Goals')
      XLSX.writeFile(wb, `fitlog-export-${timestamp()}.xlsx`)
      setMessage('ดาวน์โหลดไฟล์ Excel แล้ว')
    } catch (err) {
      setError(`Export ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleExportCsv() {
    setBusy('csv')
    setError(null)
    setMessage(null)
    try {
      const { workouts } = await fetchAll()
      const ws = XLSX.utils.json_to_sheet(workouts)
      const csv = XLSX.utils.sheet_to_csv(ws)
      downloadBlob('\uFEFF' + csv, `fitlog-workouts-${timestamp()}.csv`, 'text/csv;charset=utf-8')
      setMessage('ดาวน์โหลดไฟล์ CSV แล้ว (เฉพาะรายการออกกำลังกาย)')
    } catch (err) {
      setError(`Export ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleBackup() {
    setBusy('backup')
    setError(null)
    setMessage(null)
    try {
      const data = await fetchAll()
      const payload = { version: 1, exportedAt: new Date().toISOString(), ...data }
      downloadBlob(JSON.stringify(payload, null, 2), `fitlog-backup-${timestamp()}.json`, 'application/json')
      setMessage('ดาวน์โหลดไฟล์ Backup แล้ว เก็บไว้ในที่ปลอดภัย')
    } catch (err) {
      setError(`Backup ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy('restore')
    setError(null)
    setMessage(null)
    setRestoreSummary(null)

    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as {
        workouts?: Partial<Workout>[]
        bodyMetrics?: Partial<BodyMetric>[]
        goals?: Partial<Goal>[]
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError('กรุณาเข้าสู่ระบบใหม่')
        return
      }

      let restoredWorkouts = 0
      let restoredMetrics = 0
      let restoredGoals = 0

      if (parsed.workouts && parsed.workouts.length > 0) {
        const rows = parsed.workouts.map(({ id, created_at, ...rest }) => ({ ...rest, user_id: user.id }))
        const { error: wErr, data } = await supabase.from('workouts').insert(rows).select('id')
        if (wErr) throw new Error(`workouts: ${wErr.message}`)
        restoredWorkouts = data?.length ?? rows.length
      }

      if (parsed.bodyMetrics && parsed.bodyMetrics.length > 0) {
        const rows = parsed.bodyMetrics.map(({ id, created_at, ...rest }) => ({ ...rest, user_id: user.id }))
        const { error: bErr, data } = await supabase.from('body_metrics').insert(rows).select('id')
        if (bErr) throw new Error(`body_metrics: ${bErr.message}`)
        restoredMetrics = data?.length ?? rows.length
      }

      if (parsed.goals && parsed.goals.length > 0) {
        const rows = parsed.goals.map(({ id, created_at, ...rest }) => ({ ...rest, user_id: user.id }))
        const { error: gErr, data } = await supabase.from('goals').insert(rows).select('id')
        if (gErr) throw new Error(`goals: ${gErr.message}`)
        restoredGoals = data?.length ?? rows.length
      }

      setRestoreSummary(
        `กู้คืนสำเร็จ: ออกกำลังกาย ${restoredWorkouts} รายการ · ข้อมูลร่างกาย ${restoredMetrics} รายการ · เป้าหมาย ${restoredGoals} รายการ`
      )
    } catch (err) {
      setError(`Restore ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)} — ตรวจสอบว่าไฟล์เป็น Backup JSON ของ FitLog`)
    } finally {
      setBusy(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl tracked uppercase">Export & Backup</h1>
        <p className="text-sm text-muted mt-1">ดาวน์โหลดข้อมูลของคุณ หรือสำรอง/กู้คืนข้อมูลทั้งหมด</p>
      </div>

      {error && <p className="text-sm text-rusttext">{error}</p>}
      {message && <p className="text-sm text-steel">{message}</p>}
      {restoreSummary && <p className="text-sm text-steel">{restoreSummary}</p>}

      <section className="rounded-lg bg-surface border border-line divide-y divide-line overflow-hidden">
        <SectionRow
          title="Export เป็น Excel"
          desc="ทุกตาราง (ออกกำลังกาย / ข้อมูลร่างกาย / เป้าหมาย) ในไฟล์เดียว หลายชีต"
          buttonLabel="ดาวน์โหลด .xlsx"
          busy={busy === 'excel'}
          onClick={handleExportExcel}
        />
        <SectionRow
          title="Export เป็น CSV"
          desc="เฉพาะรายการออกกำลังกาย เปิดใน Google Sheets ได้เลย"
          buttonLabel="ดาวน์โหลด .csv"
          busy={busy === 'csv'}
          onClick={handleExportCsv}
        />
      </section>

      <section className="rounded-lg bg-surface border border-line divide-y divide-line overflow-hidden">
        <SectionRow
          title="Backup ข้อมูลทั้งหมด"
          desc="ไฟล์ .json สำรองข้อมูลไว้ กู้คืนกลับมาได้ภายหลัง"
          buttonLabel="Backup"
          busy={busy === 'backup'}
          onClick={handleBackup}
        />
        <div className="px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-ink">Restore จากไฟล์ Backup</p>
            <p className="text-[11px] text-muted mt-0.5">
              เพิ่มข้อมูลจากไฟล์เข้ามาต่อท้ายของเดิม (ไม่ลบของเดิม) รองรับเฉพาะ ออกกำลังกาย/ข้อมูลร่างกาย/เป้าหมาย —
              ยังไม่รวมโปรแกรมประจำสัปดาห์
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleRestoreFile}
            className="hidden"
            id="restore-upload"
          />
          <label
            htmlFor="restore-upload"
            className="shrink-0 cursor-pointer text-xs font-display tracked uppercase text-bg bg-amber rounded-lg px-4 py-2"
          >
            {busy === 'restore' ? '...' : 'Restore'}
          </label>
        </div>
      </section>
    </div>
  )
}

function SectionRow({
  title,
  desc,
  buttonLabel,
  busy,
  onClick,
}: {
  title: string
  desc: string
  buttonLabel: string
  busy: boolean
  onClick: () => void
}) {
  return (
    <div className="px-4 py-3.5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-ink">{title}</p>
        <p className="text-[11px] text-muted mt-0.5">{desc}</p>
      </div>
      <button
        onClick={onClick}
        disabled={busy}
        className="shrink-0 text-xs font-display tracked uppercase text-bg bg-steel rounded-lg px-4 py-2 disabled:opacity-50"
      >
        {busy ? '...' : buttonLabel}
      </button>
    </div>
  )
}
