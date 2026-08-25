// ── Roles ────────────────────────────────────────────────────────────────
export type RoleKey = 'rm' | 'ps' | 'dealer' | 'ops'
export type LanguageKey = 'en' | 'zh'

export interface Person {
  name: string
  role: RoleKey
  roleLabel: string
  initials: string
}

// ── Case truth ───────────────────────────────────────────────────────────
export type StageKey =
  | 'need'
  | 'structure'
  | 'rfq'
  | 'pricing'
  | 'client'
  | 'execution'
  | 'termsheet'
  | 'done'

export interface AlertItem {
  id: string
  severity: 'warning' | 'critical'
  title: string
  detail: string
  owner: string
  actions?: string[]
}

export interface RecentChange {
  id: string
  text: string
  meta: string
}

export interface TermRow {
  label: string
  value: string
}

export interface CaseTruth {
  caseId: string
  caseName: string
  stage: StageKey
  stageException: boolean
  status: string
  statusLabel: string
  statusTone: 'neutral' | 'progress' | 'success' | 'warning' | 'critical'
  currentOwner: Person | null
  waitingOn: string | null
  nextAction: string
  approvedTerms: TermRow[] | null
  alerts: AlertItem[]
  recentChanges: RecentChange[]
}

// ── Audit ────────────────────────────────────────────────────────────────
export interface AuditEvent {
  id: string
  time: string
  actor: string
  actorRole: string
  action: string
  priorState: string
  newState: string
  detail?: string
}

// ── Quotes ───────────────────────────────────────────────────────────────
export interface Quote {
  id: string
  issuer: string
  coupon: number | null // null = 未回复
  strike: string
  ki: string
  tenor: string
  expiresAt: number | null // epoch ms, null = n/a
  comparable: boolean
  differences: string[]
  statusLabel: string
  best?: boolean
}

// ── Artifacts ────────────────────────────────────────────────────────────
export type ArtifactStatus =
  | 'DRAFT'
  | 'PENDING REVIEW'
  | 'PENDING APPROVAL'
  | 'PENDING CONFIRMATION'
  | 'APPROVED'
  | 'ACCEPTED'
  | 'ACTIVE'
  | 'SENT'
  | 'STALE'
  | 'EXPIRED'
  | 'EXECUTED'
  | 'EXCEPTION'
  | 'SUPERSEDED'
  | 'CONFIRMED'
  | 'VALIDATED'

export interface StructureOption {
  optionId: string
  label: string
  tone: string
  productType: string
  tenor: string
  strike: string
  knockIn: string
  autocall: string
  couponTarget: string
  rationale: string
  risks: string[]
}

export interface TermsheetRow {
  field: string
  ticket: string
  termsheet: string
  status: 'match' | 'warning' | 'mismatch'
}

export interface CompletenessCheck {
  label: string
  ok: boolean
}

export type ArtifactData =
  | {
      type: 'needBrief'
      fields: TermRow[]
      missing: string[]
      sourceRef: string
    }
  | {
      type: 'structureProposal'
      options: StructureOption[]
      recommendedId: string
      selectedId: string
      comparisonNote: string
      modifiedNote: string | null
    }
  | {
      type: 'rfqPackage'
      fields: TermRow[]
      issuers: string[]
      checks: CompletenessCheck[]
    }
  | {
      type: 'quoteMatrix'
      quotes: Quote[]
      bestNote: string
      freshnessNote: string
    }
  | {
      type: 'clientQuote'
      issuer: string
      terms: TermRow[]
      summary: string
      riskSummary: string
      validityUntil: number | null
      internalNote: string
    }
  | {
      type: 'instruction'
      intent: string
      summary: string
      terms: TermRow[]
      confidence: string
      sourceRef: string
    }
  | {
      type: 'executionTicket'
      fields: TermRow[]
      quoteTime: string
      validityUntil: number | null
      note: string
    }
  | {
      type: 'termsheetValidation'
      rows: TermsheetRow[]
      overall: string
      recommended: string
    }
  | {
      // 流程偏离卡：自然语言请求 → AI 起草 → 责任角色确认后成为留痕流转。
      // 例外进入流程而不是绕过流程；偏离事件本身是流程改进的数据。
      type: 'deviationProposal'
      request: string
      requestedBy: string
      classification: string
      skips: string
      basis: string
      risks: string[]
      approver: string
    }

export interface Artifact {
  id: string
  title: string
  titleZh: string
  status: ArtifactStatus
  version: number
  createdAt: string
  approvedMeta?: string
  /** 非结构化附注：schema 装不下的语感与判断，随产物流转（上下文断点补偿） */
  note?: { author: string; text: string }
  data: ArtifactData
}

// ── Timeline ─────────────────────────────────────────────────────────────
export type TimelineItem =
  | {
      kind: 'human'
      id: string
      author: Person
      time: string
      text: string
      quote?: boolean // relayed client words
    }
  | {
      kind: 'system'
      id: string
      icon: 'check' | 'arrow' | 'alert' | 'flag' | 'send'
      text: string
      meta: string
      tone?: 'neutral' | 'success' | 'warning' | 'critical'
      // If set, only these roles see the event (e.g. hide a handoff event
      // from the joiner whose Context Brief restates it).
      audience?: RoleKey[]
    }
  | { kind: 'artifact'; id: string; artifactId: string; time: string }
  | { kind: 'processing'; id: string; lines: string[]; doneCount: number }
  | {
      // Blocking human action that has no artifact card of its own (e.g. live requote).
      kind: 'action'
      id: string
      title: string
      detail: string
      actionKey: string
      actionLabel: string
      allowed: RoleKey[]
      time: string
      done: boolean
      doneMeta?: string
    }
  | {
      // Join-time structured context for a role entering at a new stage (§5.3).
      kind: 'contextBrief'
      id: string
      joiner: Person
      stageLabel: string
      time: string
      lines: string[]
      evidence: { label: string; artifactId: string }[]
      nextAction: string
    }

// ── Participants (progressive participation) ────────────────────────────
export interface Participant {
  person: Person
  joinedAt: string
  joinStageLabel: string
  active: boolean
}

// ── Handoff notification (case arrives for a role) ──────────────────────
export interface AppNotification {
  id: string
  role: RoleKey
  caseId: string
  title: string
  body: string
  time: string
  read: boolean
}

// ── Other cases (assistant / nav) ────────────────────────────────────────
export interface MiniCase {
  caseId: string
  name: string
  stageLabel: string
  statusLabel: string
  tone: 'neutral' | 'progress' | 'success' | 'warning' | 'critical'
  ownerRole: RoleKey | null
  ownerName: string
  waitingOn: string
  nextAction: string
  reason: string
  deadline: string
  priority: 'high' | 'medium' | 'low'
  attention: 'exception' | 'warning' | 'dot' | null
}

// ── Private workspace (两区模型：私区跟人走，发布才进公区) ────────────────
export interface PrivateMsg {
  id: string
  who: 'me' | 'agent'
  time: string
  text: string
  /** 反向门：从交易室拉入讨论的产物引用 */
  quotedArtifactId?: string
  /** 正向门：agent 起草的待发布内容，发布后才进入交易室与审计 */
  draft?: { kind: 'roomMessage' | 'deviation'; text: string; published: boolean }
}

// ── Pending formal action confirmation ──────────────────────────────────
export interface PendingConfirm {
  key: string
  title: string
  summary: string[]
  consequence: string
  confirmLabel: string
  danger?: boolean
}

export type ViewKey = 'room' | 'assistant' | 'tasks'

export interface DrawerState {
  type: 'source' | 'history' | 'skills' | 'data' | 'archive'
  payload?: { title: string; body: string; meta: string }
}
