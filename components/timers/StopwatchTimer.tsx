'use client'

import { useState } from 'react'
import { useStopwatch, formatStopwatch } from '@/lib/useStopwatch'
import { useWakeLock } from '@/lib/useWakeLock'
import { TimerShell, TimerButton } from './TimerShell'

export default function StopwatchTimer() {
  const { elapsedMs, running, start, pause, reset, getElapsedMs } = useStopwatch()
  const [laps, setLaps] = useState<number[]>([])

  useWakeLock(running)

  function handleReset() {
    reset()
    setLaps([])
  }

  function handleLap() {
    if (!running) return
    setLaps((prev) => [getElapsedMs(), ...prev])
  }

  return (
    <div className="space-y-5">
      <TimerShell
        phaseLabel="Stopwatch"
        timeText={formatStopwatch(elapsedMs)}
        progress={running ? ((elapsedMs % 60000) / 60000) : 0}
        accent="steel"
      />

      <div className="flex gap-3">
        {!running ? (
          <TimerButton variant="primary" onClick={start}>
            {elapsedMs > 0 ? 'เล่นต่อ' : 'เริ่ม'}
          </TimerButton>
        ) : (
          <TimerButton onClick={pause}>หยุดชั่วคราว</TimerButton>
        )}
        <TimerButton variant="ghost" onClick={running ? handleLap : handleReset}>
          {running ? 'จับรอบ (Lap)' : 'รีเซ็ต'}
        </TimerButton>
      </div>

      {laps.length > 0 && (
        <ul className="rounded-lg bg-surface border border-line shadow-elevated overflow-hidden">
          {laps.map((lapMs, i) => {
            const lapNumber = laps.length - i
            const prevLapMs = laps[i + 1] ?? 0
            const splitMs = lapMs - prevLapMs
            return (
              <li key={i} className="tally-row flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-muted font-mono">รอบ {lapNumber}</span>
                <span className="text-xs text-muted font-mono">+{formatStopwatch(splitMs)}</span>
                <span className="text-sm text-ink font-mono tabular">{formatStopwatch(lapMs)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
