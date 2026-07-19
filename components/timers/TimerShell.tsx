'use client'

export function TimerShell({
  phaseLabel,
  subLabel,
  timeText,
  progress,
  accent = 'amber',
  children,
  footer,
}: {
  phaseLabel: string
  subLabel?: string
  timeText: string
  progress: number // 0..1
  accent?: 'amber' | 'steel' | 'rust'
  children?: React.ReactNode
  footer?: React.ReactNode
}) {
  const barColor = { amber: 'bg-amber', steel: 'bg-steel', rust: 'bg-rust' }[accent]
  const textColor = { amber: 'text-amber', steel: 'text-steel', rust: 'text-rusttext' }[accent]
  const pct = Math.min(1, Math.max(0, progress))

  return (
    <div className="space-y-5">
      <div className="bg-surface border border-line rounded-xl px-5 py-8 text-center">
        <p className={`font-display tracked uppercase text-sm mb-2 ${textColor}`}>{phaseLabel}</p>
        <p className="font-mono tabular text-6xl text-ink leading-none">{timeText}</p>
        {subLabel && <p className="text-xs text-muted mt-3">{subLabel}</p>}
        <div className="mt-6 h-1.5 rounded-full bg-surface2 overflow-hidden">
          <div
            className={`h-full ${barColor} transition-[width] duration-200 ease-linear`}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      </div>
      {children}
      {footer}
    </div>
  )
}

export function TimerButton({
  onClick,
  children,
  variant = 'default',
  disabled,
}: {
  onClick: () => void
  children: React.ReactNode
  variant?: 'default' | 'primary' | 'ghost'
  disabled?: boolean
}) {
  const cls =
    variant === 'primary'
      ? 'bg-amber text-bg'
      : variant === 'ghost'
        ? 'bg-transparent border border-line text-muted'
        : 'bg-surface2 border border-line text-ink'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 rounded-lg font-display tracked uppercase py-3.5 text-sm transition active:scale-[0.98] disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  )
}

export function NumberStepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  unit,
  disabled,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  unit?: string
  disabled?: boolean
}) {
  function clamp(v: number) {
    let out = v
    if (min !== undefined) out = Math.max(min, out)
    if (max !== undefined) out = Math.min(max, out)
    return out
  }
  return (
    <div className="bg-surface border border-line rounded-lg px-4 py-3">
      <p className="text-[11px] tracked uppercase text-muted mb-1.5">{label}</p>
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(clamp(value - step))}
          className="w-9 h-9 rounded-full bg-surface2 border border-line text-ink text-lg disabled:opacity-40"
        >
          −
        </button>
        <span className="font-mono tabular text-xl text-ink">
          {value}
          {unit && <span className="text-xs text-muted ml-1">{unit}</span>}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(clamp(value + step))}
          className="w-9 h-9 rounded-full bg-surface2 border border-line text-ink text-lg disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  )
}
