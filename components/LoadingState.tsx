export default function LoadingState({ message = 'กำลังโหลด...' }: { message?: string }) {
  return <p className="text-sm text-muted text-center py-10">{message}</p>
}
