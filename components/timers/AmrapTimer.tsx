'use client'

import { useEffect, useRef, useState } from 'react'
import { useStopwatch, formatClock } from '@/lib/useStopwatch'
import { beepFinish, beepTick } from '@/lib/beep'
import { useWakeLock } from '@/lib/useWakeLock'
import { speak } from '@/lib/speech'
import { TimerShell, TimerButton, NumberStepper } from './TimerShell'

export default function AmrapTimer({ voiceEnabled }: { voiceEnabled: boolean }) {
  const [totalMin, setTotalMin] = useState(10)
  const [rounds, setRounds] = useState(0)
  const { elapsedMs, running, start, pause, reset } = useStopwatch()
  const finishedRef = useRef(false)
  const tickedRef = useRef(-1)
  const halfwayRef = useRef(false)

  useWakeLock(running)

  const totalMs = totalMin * 60 * 1000
  const remainingMs = Math.max(0, totalMs - elapsedMs)
  const remainingSec = Math.ceil(remainingMs / 1000)
  const isFinished = remainingMs <= 0

  useEffect(() => {
    if (!running) return
    if (isFinished && !finishedRef.current) {
      finishedRef.current = true
      beepFinish()
      if (voiceEnabled) speak("Time's up")
      pause()
      return
    }
    if (!halfwayRef.current && totalMs > 0 && elapsedMs >= totalMs / 2) {
      halfwayRef.current = true
      if (voiceEnabled) speak('Halfway')
    }
    if (remainingSec <= 3 && remainingSec >= 1 && tickedRef.current !== remainingSec) {
      tickedRef.current = remainingSec
      beepTick()
      if (voiceEnabled) speak(String(remainingSec))
    }
  }, [remainingSec, isFinished, running, pause, elapsedMs, totalMs, voiceEnabled])

  function handleReset() {
    finishedRef.current = false
    tickedRef.current = -1
    halfwayRef.current = false
    setRounds(0)
    reset()
  }

  return (
    <div className="space-y-5">
      <TimerShell
        phaseLabel={isFinished ? 'หมดเวลา 🎉' : 'AMRAP — เวลาที่เหลือ'}
        timeText={formatClock(remainingMs)}
        progress={totalMs === 0 ? 0 : elapsedMs / totalMs}
        accent={isFinished ? 'amber' : 'rust'}
      />

      <div className="bg-surface border border-line rounded-lg px-4 py-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] tracked uppercase text-muted mb-1">รอบที่ทำได้</p>
          <p className="font-mono tabular text-3xl text-amber">{rounds}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRounds((r) => Math.max(0, r - 1))}
            className="w-11 h-11 rounded-full bg-surface2 border border-line text-ink text-xl"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setRounds((r) => r + 1)}
            disabled={!running && elapsedMs === 0}
            className="w-11 h-11 rounded-full bg-amber text-bg text-xl disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      <NumberStepper label="เวลาทั้งหมด (นาที)" value={totalMin} onChange={(v) => { setTotalMin(Math.max(1, v)); handleReset() }} step={1} min={1} disabled={running} />

      <div className="flex gap-3">
        {!running ? (
          <TimerButton
            variant="primary"
            onClick={() => {
              finishedRef.current = false
              if (voiceEnabled && elapsedMs === 0) speak('Go')
              start()
            }}
          >
            {elapsedMs > 0 && !isFinished ? 'เล่นต่อ' : 'เริ่ม'}
          </TimerButton>
        ) : (
          <TimerButton onClick={pause}>หยุดชั่วคราว</TimerButton>
        )}
        <TimerButton variant="ghost" onClick={handleReset}>รีเซ็ต</TimerButton>
      </div>
    </div>
  )
}
