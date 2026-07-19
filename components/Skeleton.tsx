export default function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface2 ${className}`} />
}
