'use client'

import { useState } from 'react'
import RestTimer from '@/components/timers/RestTimer'
import IntervalTimer from '@/components/timers/IntervalTimer'
import EmomTimer from '@/components/timers/EmomTimer'
import AmrapTimer from '@/components/timers/AmrapTimer'
import StopwatchTimer from '@/components/timers/StopwatchTimer'
import { useVoiceEnabled } from '@/lib/useVoiceEnabled'

type Mode = 'rest' | 'hiit' | 'tabata' | 'emom' | 'amrap' | 'stopwatch'

const MODES: { key: Mode; label: string }[] = [
  { key: 'rest', label: 'Rest' },
  { key: 'hiit', label: 'HIIT' },
  { key: 'tabata', label: 'Tabata' },
  { key: 'emom', label: 'EMOM' },
  { key: 'amrap', label: 'AMRAP' },
  { key: 'stopwatch', label: 'Stopwatch' },
]

export default function TimerPage() {
  const [mode, setMode] = useState<Mode>('rest')
  const { enabled: voiceEnabled, toggle: toggleVoice } = useVoiceEnabled()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl tracked uppercase">ไทม์เมอร์</h1>
        <button
          type="button"
          onClick={toggleVoice}
          className={`text-xs font-display tracked uppercase px-3 py-1.5 rounded-full border transition ${
            voiceEnabled ? 'bg-amber text-bg border-amber' : 'text-muted border-line'
          }`}
        >
          {voiceEnabled ? '🔊 Voice Coach' : '🔇 Voice Coach'}
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 no-scrollbar">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-display tracked uppercase border transition ${
              mode === m.key ? 'bg-amber text-bg border-amber' : 'text-muted border-line'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'rest' && <RestTimer voiceEnabled={voiceEnabled} />}
      {mode === 'hiit' && (
        <IntervalTimer
          title="HIIT"
          defaultWorkSec={40}
          defaultRestSec={20}
          defaultRounds={8}
          defaultPrepSec={10}
          voiceEnabled={voiceEnabled}
        />
      )}
      {mode === 'tabata' && (
        <IntervalTimer
          title="Tabata"
          defaultWorkSec={20}
          defaultRestSec={10}
          defaultRounds={8}
          defaultPrepSec={10}
          voiceEnabled={voiceEnabled}
        />
      )}
      {mode === 'emom' && <EmomTimer voiceEnabled={voiceEnabled} />}
      {mode === 'amrap' && <AmrapTimer voiceEnabled={voiceEnabled} />}
      {mode === 'stopwatch' && <StopwatchTimer />}
    </div>
  )
}
