'use client'

import { useWeightUnit } from './WeightUnitProvider'

export default function WeightUnitToggle() {
  const { unit, setUnit } = useWeightUnit()

  return (
    <div
      className="shrink-0 inline-flex rounded-full border border-line bg-surface2 p-0.5 text-[10px] tracked uppercase"
      role="group"
      aria-label="หน่วยน้ำหนัก"
    >
      <button
        type="button"
        onClick={() => setUnit('kg')}
        aria-pressed={unit === 'kg'}
        className={`px-2.5 py-1 rounded-full transition ${unit === 'kg' ? 'bg-amber text-bg' : 'text-muted'}`}
      >
        kg
      </button>
      <button
        type="button"
        onClick={() => setUnit('lb')}
        aria-pressed={unit === 'lb'}
        className={`px-2.5 py-1 rounded-full transition ${unit === 'lb' ? 'bg-amber text-bg' : 'text-muted'}`}
      >
        lb
      </button>
    </div>
  )
}
