import type { ExerciseProgress } from '@/lib/workoutDisplay'

export default function ExerciseProgressBadge({
  progress,
  format,
}: {
  progress: ExerciseProgress
  format: (kg: number | null | undefined) => string
}) {
  if (progress.kind === 'pr') {
    return <span className="text-[10px] font-mono text-amber shrink-0">PR 🎉 +{format(progress.deltaKg)}</span>
  }
  if (progress.kind === 'bestVolume') {
    return <span className="text-[10px] font-mono text-amber shrink-0">Best Volume 🏆</span>
  }
  if (progress.kind === 'up') {
    return <span className="text-[10px] font-mono text-steel shrink-0">▲ +{format(progress.deltaKg)}</span>
  }
  if (progress.kind === 'down') {
    return <span className="text-[10px] font-mono text-muted shrink-0">▼ -{format(progress.deltaKg)}</span>
  }
  return null
}
