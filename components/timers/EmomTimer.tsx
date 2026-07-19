'use client'

import { useEffect, useRef, useState } from 'react'
import { useStopwatch, formatClock } from '@/lib/useStopwatch'
import { beepFinish, beepGo, beepTick } from '@/lib/beep'
import { useWakeLock } from '@/lib/useWakeLock'
import { speak } from '@/lib/speech'
import { TimerShell, TimerButton, NumberStepper } from './TimerShell'

export default function EmomTimer({ voiceEnabled }: { voiceEnabled: boolean }) {
  const [intervalSec, setIntervalSec] = useState(60)
  const [totalRounds, setTotalRounds] = useState(10)
  const { elapsedMs, running, start, pause, reset } = useStopwatch()
  const lastRoundRef = useRef(-1)
  const finishedRef = useRef(false)
  const tickedRef = useRef(-1)

  useWakeLock(running)

  const totalMs = intervalSec * 1000 * totalRounds
  const isFinished = totalMs > 0 && elapsedMs >= totalMs
  const clampedMs = Math.min(elapsedMs, totalMs)
  const currentRound = Math.min(totalRounds, Math.floor(clampedMs / (intervalSec * 1000)) + 1)
  const msIntoRound = clampedMs % (intervalSec * 1000)
  const remainingInRoundMs = isFinished ? 0 : intervalSec * 1000 - msIntoRound

  useEffect(() => {
    if (!running) return
    if (isFinished && !finishedRef.current) {
      finishedRef.current = true
      beepFinish()
      if (voiceEnabled) speak('Workout complete')
      pause()
      return
    }
    if (currentRound !== lastRoundRef.current) {
      lastRoundRef.current = currentRound
      tickedRef.current = -1
      beepGo()
      if (voiceEnabled) speak(`Round ${currentRound}`)
    }
    const remSec = Math.ceil(remainingInRoundMs / 1000)
    if (remSec <= 3 && remSec >= 1 && tickedRef.current !== remSec) {
      tickedRef.current = remSec
      beepTick()
      if (voiceEnabled) speak(String(remSec))
    }
  }, [currentRound, remainingInRoundMs, running, isFinished, pause, voiceEnabled])

  function handleReset() {
    finishedRef.current = false
    lastRoundRef.current = -1
    tickedRef.current = -1
    reset()
  }

  return (
    <div className="space-y-5">
      <TimerShell
        phaseLabel={isFinished ? 'เสร็จสิ้น 🎉' : 'EMOM'}
        subLabel={!isFinished ? `รอบ ${currentRound} / ${totalRounds}` : undefined}
        timeText={isFinished ? '00:00' : formatClock(remainingInRoundMs)}
        progress={intervalSec === 0 ? 0 : msIntoRound / (intervalSec * 1000)}
        accent={isFinished ? 'amber' : 'rust'}
      />

      <div className="grid grid-cols-2 gap-3">
        <NumberStepper label="ทุกๆ (วินาที)" value={intervalSec} onChange={(v) => { setIntervalSec(Math.max(10, v)); handleReset() }} step={5} min={10} disabled={running} />
        <NumberStepper label="จำนวนรอบ" value={totalRounds} onChange={(v) => { setTotalRounds(Math.max(1, v)); handleReset() }} step={1} min={1} disabled={running} />
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
        รวม {totalRounds} รอบ · ~{Math.round((intervalSec * totalRounds) / 60 * 10) / 10} นาที
      </p>
    </div>
  )
}
