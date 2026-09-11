import type { OrderStatus } from '@/lib/types'

const STATUS_META: Record<OrderStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#c4c4c4' },
  consent_sent: { label: 'Consent sent', color: '#fdab3d' },
  consent_completed: { label: 'Consent completed', color: '#00c875' },
  collecting: { label: 'Collecting', color: '#579bfc' },
  analysis: { label: 'Analysis', color: '#a25ddc' },
  in_review: { label: 'In review', color: '#fdab3d' },
  report_ready: { label: 'Report ready', color: '#00c875' },
  delivered: { label: 'Delivered', color: '#037f4c' },
  cancelled: { label: 'Cancelled', color: '#e2445c' },
}

export function StatusPill({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status] ?? { label: status, color: '#c4c4c4' }
  return (
    <span className="pill" style={{ backgroundColor: meta.color }}>
      {meta.label}
    </span>
  )
}
