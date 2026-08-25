import { ROLE_SHORT } from '../data'
import type { ArtifactStatus, RoleKey } from '../types'

// ── Status badge ─────────────────────────────────────────────────────────
const STATUS_TONE: Record<string, string> = {
  DRAFT: 'neutral',
  'PENDING REVIEW': 'warning',
  'PENDING APPROVAL': 'warning',
  'PENDING CONFIRMATION': 'warning',
  APPROVED: 'success',
  ACCEPTED: 'success',
  CONFIRMED: 'success',
  VALIDATED: 'success',
  ACTIVE: 'progress',
  SENT: 'progress',
  STALE: 'neutral',
  SUPERSEDED: 'neutral',
  EXPIRED: 'critical',
  EXECUTED: 'success',
  EXCEPTION: 'critical',
}
const STATUS_ZH: Record<string, string> = {
  DRAFT: '草稿',
  'PENDING REVIEW': '待复核',
  'PENDING APPROVAL': '待审批',
  'PENDING CONFIRMATION': '待确认',
  APPROVED: '已确认',
  ACCEPTED: '已接受',
  CONFIRMED: '已确认',
  VALIDATED: '已校验',
  ACTIVE: '生效中',
  SENT: '已发送',
  STALE: '已过时',
  SUPERSEDED: '已被取代',
  EXPIRED: '已过期',
  EXECUTED: '已执行',
  EXCEPTION: '异常',
}

export function StatusBadge({ status }: { status: ArtifactStatus | string }) {
  return (
    <span className={`badge ${STATUS_TONE[status] ?? 'neutral'}`}>
      {STATUS_ZH[status] ?? status} · {status}
    </span>
  )
}

// ── Role-gated action button ─────────────────────────────────────────────
export function ActionBtn({
  label,
  kind = 'secondary',
  allowed,
  role,
  onClick,
  disabledReason,
  aiRecommended,
}: {
  label: string
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger-ghost'
  allowed: RoleKey[]
  role: RoleKey
  onClick: () => void
  disabledReason?: string
  aiRecommended?: boolean
}) {
  const roleOk = allowed.includes(role)
  const disabled = !roleOk || !!disabledReason
  const reason = !roleOk
    ? `仅${allowed.map((r) => ROLE_SHORT[r]).join(' / ')}可执行（当前角色：${ROLE_SHORT[role]}）`
    : disabledReason
  // Inline reason only on the primary action; secondaries keep it in the tooltip
  // so a role-gated card shows the explanation once, not once per button.
  const showInline = disabled && reason && (kind === 'primary' || !!disabledReason)
  return (
    <span className="action-wrap">
      <button className={`btn btn-${kind}`} disabled={disabled} onClick={onClick} title={reason}>
        {aiRecommended ? <span style={{ fontSize: 10, color: 'var(--ai-accent)' }}>AI 建议</span> : null}
        {label}
      </button>
      {showInline ? <span className="action-reason">{reason}</span> : null}
    </span>
  )
}

// ── Countdown ────────────────────────────────────────────────────────────
export function Countdown({ until, now }: { until: number | null; now: number }) {
  if (until === null) return <span className="countdown ok">—</span>
  const left = Math.floor((until - now) / 1000)
  if (left <= 0) return <span className="countdown expired">已过期</span>
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  const cls = left < 60 ? 'expiring' : 'ok'
  return (
    <span className={`countdown ${cls}`}>
      {mm}:{ss}
    </span>
  )
}
