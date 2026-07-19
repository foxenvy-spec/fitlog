export default function ErrorState({
  title = 'โหลดข้อมูลไม่สำเร็จ',
  message = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง',
  onRetry,
}: {
  title?: string
  message?: string
  onRetry: () => void
}) {
  return (
    <div className="rounded-lg bg-surface border border-rustdim px-4 py-8 flex flex-col items-center text-center gap-3">
      <span className="text-2xl">⚠️</span>
      <div>
        <p className="font-display text-base tracked uppercase text-ink">{title}</p>
        <p className="text-xs text-muted mt-1">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 text-[11px] font-display tracked uppercase text-bg bg-amber rounded-lg px-4 py-2 active:scale-[0.99] transition"
      >
        ลองอีกครั้ง
      </button>
    </div>
  )
}
