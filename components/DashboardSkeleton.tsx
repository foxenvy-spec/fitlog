import Skeleton from './Skeleton'

export default function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-surface border border-line overflow-hidden">
        {/* greeting + streak */}
        <div className="px-4 pt-4 pb-3.5 flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-32" />
          </div>
          <div className="space-y-2 flex flex-col items-end">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-6 w-10" />
          </div>
        </div>

        <Divider />

        {/* today's workout */}
        <div className="px-4 py-3.5 space-y-3">
          <Skeleton className="h-3 w-28" />
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-7 w-16 rounded-lg" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="w-14 h-14 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>

        <Divider />

        {/* today's stats */}
        <div>
          <div className="px-4 pt-3.5">
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="grid grid-cols-3 divide-x divide-line mt-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="px-3 py-3 flex flex-col items-center gap-1.5">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-6 w-12" />
                <Skeleton className="h-3 w-8" />
              </div>
            ))}
          </div>
        </div>

        <Divider />

        {/* next PR */}
        <div className="px-4 py-3.5 space-y-2.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-28" />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-5 w-16" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        </div>

        <Divider />

        {/* recovery */}
        <div className="px-4 py-3.5 space-y-2.5">
          <Skeleton className="h-3 w-16" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Skeleton className="w-16 h-3" />
              <Skeleton className="flex-1 h-2 rounded-full" />
              <Skeleton className="w-9 h-3" />
            </div>
          ))}
        </div>

        <Divider />

        {/* AI coach */}
        <div className="px-4 py-3.5 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>

        <Divider />

        {/* last workout */}
        <div className="px-4 py-3.5 flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-3 w-14" />
        </div>
      </div>

      {/* heatmap placeholder */}
      <div className="rounded-lg bg-surface border border-line px-4 py-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-7 w-16 rounded-md" />
        </div>
        <div className="space-y-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 7 }).map((_, j) => (
                <Skeleton key={j} className="aspect-square" />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* weekly volume placeholder */}
      <div className="rounded-lg bg-surface border border-line px-4 py-3.5 space-y-3">
        <Skeleton className="h-5 w-40" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-2.5 w-full rounded-full" />
          </div>
        ))}
      </div>

      {/* quick actions */}
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

function Divider() {
  return <div className="border-t border-line" />
}
