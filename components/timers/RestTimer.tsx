'use client'

import { useEffect, useRef, useState } from 'react'
import { useStopwatch, formatClock } from '@/lib/useStopwatch'
import { beepFinish, beepTick } from '@/lib/beep'
import { useWakeLock } from '@/lib/useWakeLock'
import { speak } from '@/lib/speech'
import { TimerShell, TimerButton, NumberStepper } from './TimerShell'

const PRESETS = [30, 60, 90, 120, 180]

export default function RestTimer({ voiceEnabled }: { voiceEnabled: boolean }) {
  const [durationSec, setDurationSec] = useState(90)
  const { elapsedMs, running, start, pause, reset } = useStopwatch()
  const finishedRef = useRef(false)
  const tickedRef = useRef<number>(-1)

  useWakeLock(running)

  const totalMs = durationSec * 1000
  const remainingMs = Math.max(0, totalMs - elapsedMs)
  const remainingSec = Math.ceil(remainingMs / 1000)

  useEffect(() => {
    if (!running) return
    if (remainingMs <= 0 && !finishedRef.current) {
      finishedRef.current = true
      beepFinish()
      if (voiceEnabled) speak('Rest over, let’s go')
      pause()
      return
    }
    if (remainingSec <= 3 && remainingSec >= 1 && tickedRef.current !== remainingSec) {
      tickedRef.current = remainingSec
      beepTick()
      if (voiceEnabled) speak(String(remainingSec))
    }
  }, [remainingMs, remainingSec, running, pause, voiceEnabled])

  function handleReset() {
    finishedRef.current = false
    tickedRef.current = -1
    reset()
  }

  function pickPreset(sec: number) {
    setDurationSec(sec)
    handleReset()
  }

  const done = !running && finishedRef.current

  return (
    <div className="space-y-5">
      <TimerShell
        phaseLabel={done ? 'พักครบแล้ว' : 'พักระหว่างเซ็ต'}
        timeText={formatClock(remainingMs)}
        progress={totalMs === 0 ? 0 : elapsedMs / totalMs}
        accent={done ? 'amber' : 'steel'}
      />

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => pickPreset(p)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-display tracked uppercase border transition ${
              durationSec === p ? 'bg-steel text-bg border-steel' : 'text-muted border-line'
            }`}
          >
            {p}s
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberStepper label="ปรับเวลา (วินาที)" value={durationSec} onChange={(v) => { setDurationSec(Math.max(5, v)); handleReset() }} step={15} min={5} disabled={running} />
      </div>

      <div className="flex gap-3">
        {!running ? (
          <TimerButton variant="primary" onClick={() => { finishedRef.current = false; start() }}>
            {elapsedMs > 0 ? 'เล่นต่อ' : 'เริ่มพัก'}
          </TimerButton>
        ) : (
          <TimerButton onClick={pause}>หยุดชั่วคราว</TimerButton>
        )}
        <TimerButton variant="ghost" onClick={handleReset}>รีเซ็ต</TimerButton>
      </div>
    </div>
  )
}
