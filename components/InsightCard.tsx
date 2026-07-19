import type { Insight } from '@/lib/dashboardStats'

const KIND_STYLE: Record<Insight['kind'], { border: string; accent: string }> = {
  positive: { border: 'border-l-amber', accent: 'text-amber' },
  warning: { border: 'border-l-rust', accent: 'text-rusttext' },
}

export default function InsightCard({ insight }: { insight: Insight }) {
  const style = KIND_STYLE[insight.kind]
  return (
    <div className={`rounded-lg bg-surface border border-line border-l-[3px] ${style.border} px-4 py-3 flex items-start gap-3`}>
      <span className="text-lg leading-none shrink-0 mt-0.5">{insight.icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] tracked uppercase text-muted">Insight</p>
        <p className={`font-display text-sm tracked uppercase mt-0.5 ${style.accent}`}>{insight.title}</p>
        <p className="text-xs text-muted mt-0.5">{insight.detail}</p>
      </div>
    </div>
  )
}
