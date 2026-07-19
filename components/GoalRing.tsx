'use client'

interface GoalRingProps {
  pct: number
  size?: number
  strokeWidth?: number
  color?: string
  trackColor?: string
  label?: string
  // ข้อความสำหรับ screen reader เท่านั้น ใช้ตอนที่มี caption แสดงอยู่นอกวงแล้ว (เช่น header ด้านบน)
  // และไม่อยากให้ label ไปแสดงซ้ำข้างในวงอีกที ถ้าไม่ระบุจะ fallback ไปใช้ label แทน
  ariaLabel?: string
}

export default function GoalRing({
  pct,
  size = 64,
  strokeWidth = 7,
  color = '#E8A33D',
  trackColor = '#23272D',
  label,
  ariaLabel,
}: GoalRingProps) {
  const clamped = Math.max(0, Math.min(100, pct))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel ?? label ?? 'ความคืบหน้า'}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-ink leading-none" style={{ fontSize: size * 0.24 }}>
          {Math.round(clamped)}%
        </span>
        {label && <span className="text-[9px] text-muted mt-0.5">{label}</span>}
      </div>
    </div>
  )
}
