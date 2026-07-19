'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStopwatch, formatClock } from '@/lib/useStopwatch'
import { beepFinish, beepGo, beepRest, beepTick } from '@/lib/beep'
import { useWakeLock } from '@/lib/useWakeLock'
import { speak } from '@/lib/speech'
import { TimerShell, TimerButton, NumberStepper } from './TimerShell'

type Segment = { type: 'prep' | 'work' | 'rest'; durSec: number; round: number }

export default function IntervalTimer({
  title,
  defaultWorkSec,
  defaultRestSec,
  defaultRounds,
  defaultPrepSec = 5,
  voiceEnabled,
}: {
  title: string
  defaultWorkSec: number
  defaultRestSec: number
  defaultRounds: number
  defaultPrepSec?: number
  voiceEnabled: boolean
}) {
  const [workSec, setWorkSec] = useState(defaultWorkSec)
  const [restSec, setRestSec] = useState(defaultRestSec)
  const [rounds, setRounds] = useState(defaultRounds)
  const [prepSec, setPrepSec] = useState(defaultPrepSec)

  const { elapsedMs, running, start, pause, reset } = useStopwatch()
  const lastSegIndexRef = useRef(-1)
  const finishedRef = useRef(false)
  const tickedRef = useRef(-1)

  useWakeLock(running)

  const segments = useMemo(() => {
    const segs: Segment[] = []
    if (prepSec > 0) segs.push({ type: 'prep', durSec: prepSec, round: 0 })
    for (let r = 1; r <= rounds; r++) {
      segs.push({ type: 'work', durSec: workSec, round: r })
      if (r < rounds) segs.push({ type: 'rest', durSec: restSec, round: r })
    }
    return segs
  }, [prepSec, workSec, restSec, rounds])

  const cumulativeMs = useMemo(() => {
    let acc = 0
    return segments.map((s) => (acc += s.durSec * 1000))
  }, [segments])

  const totalMs = cumulativeMs.length > 0 ? cumulativeMs[cumulativeMs.length - 1] : 0

  let segIndex = segments.length - 1
  for (let i = 0; i < cumulativeMs.length; i++) {
    if (elapsedMs < cumulativeMs[i]) {
      segIndex = i
      break
    }
  }
  const isFinished = totalMs > 0 && elapsedMs >= totalMs
  const seg = segments[segIndex]
  const segStartMs = segIndex === 0 ? 0 : cumulativeMs[segIndex - 1]
  const segEndMs = cumulativeMs[segIndex] ?? totalMs
  const segRemainingMs = Math.max(0, segEndMs - elapsedMs)
  const segTotalMs = segEndMs - segStartMs

  useEffect(() => {
    if (!running) return
    if (isFinished && !finishedRef.current) {
      finishedRef.current = true
      beepFinish()
      if (voiceEnabled) speak('Workout complete')
      pause()
      return
    }
    if (segIndex !== lastSegIndexRef.current) {
      lastSegIndexRef.current = segIndex
      tickedRef.current = -1
      if (seg?.type === 'work') {
        beepGo()
        if (voiceEnabled) speak('Go')
      } else if (seg?.type === 'rest') {
        beepRest()
        if (voiceEnabled) speak('Rest')
      }
    }
    const remSec = Math.ceil(segRemainingMs / 1000)
    if (remSec <= 3 && remSec >= 1 && tickedRef.current !== remSec && !isFinished) {
      tickedRef.current = remSec
      beepTick()
      if (voiceEnabled) speak(String(remSec))
    }
  }, [segIndex, segRemainingMs, running, isFinished, pause, seg, voiceEnabled])

  function handleReset() {
    finishedRef.current = false
    lastSegIndexRef.current = -1
    tickedRef.current = -1
    reset()
  }

  const phaseLabel = isFinished
    ? 'เสร็จสิ้น 🎉'
    : seg?.type === 'prep'
      ? 'เตรียมตัว'
      : seg?.type === 'work'
        ? 'ทำ!'
        : 'พัก'

  const accent: 'amber' | 'steel' | 'rust' = isFinished
    ? 'amber'
    : seg?.type === 'work'
      ? 'rust'
      : seg?.type === 'rest'
        ? 'steel'
        : 'amber'
  const workRounds = segments.filter((s) => s.type === 'work').length

  return (
    <div className="space-y-5">
      <h2 className="font-display text-sm tracked uppercase text-muted">{title}</h2>

      <TimerShell
        phaseLabel={phaseLabel}
        subLabel={seg && !isFinished ? `รอบ ${seg.round || 1} / ${rounds}` : undefined}
        timeText={isFinished ? '00:00' : formatClock(segRemainingMs)}
        progress={segTotalMs === 0 ? 0 : (segTotalMs - segRemainingMs) / segTotalMs}
        accent={accent}
      />

      <div className="grid grid-cols-2 gap-3">
        <NumberStepper label="ทำ (วินาที)" value={workSec} onChange={(v) => { setWorkSec(Math.max(1, v)); handleReset() }} step={5} min={1} disabled={running} />
        <NumberStepper label="พัก (วินาที)" value={restSec} onChange={(v) => { setRestSec(Math.max(0, v)); handleReset() }} step={5} min={0} disabled={running} />
        <NumberStepper label="จำนวนรอบ" value={rounds} onChange={(v) => { setRounds(Math.max(1, v)); handleReset() }} step={1} min={1} disabled={running} />
        <NumberStepper label="เตรียมตัว (วินาที)" value={prepSec} onChange={(v) => { setPrepSec(Math.max(0, v)); handleReset() }} step={5} min={0} disabled={running} />
      </div>

      <div className="flex gap-3">
        {!running ? (
          <TimerButton variant="primary" onClick={() => { finishedRef.current = false; start() }}>
            {elapsedMs > 0 && !isFinished ? 'เล่นต่อ' : 'เริ่ม'}
          </TimerButton>
        ) : (
          <TimerButton onClick={pause}>หยุดชั่วคราว</TimerButton>
        )}
        <TimerButton variant="ghost" onClick={handleReset}>รีเซ็ต</TimerButton>
      </div>

      <p className="text-xs text-muted text-center">
        ทั้งหมด {workRounds} รอบ · รวม ~{Math.round(totalMs / 1000 / 60 * 10) / 10} นาที
      </p>
    </div>
  )
}
