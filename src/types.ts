// ── Roles ────────────────────────────────────────────────────────────────
export type RoleKey = 'rm' | 'ps' | 'dealer' | 'ops'
export type LanguageKey = 'en' | 'zh'

export interface Person {
  name: string
  role: RoleKey
  roleLabel: string
  initials: string
  /** 受邀协作者：可参与讨论（发言对全员可见），不占正式审批角色 */
  guest?: boolean
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

/**
 * 讨论中产生的需求字段更新。
 *
 * 直接写入，不逐条确认——把关点在阶段边界那一次「确认客户需求」，
 * 加上随时可以人工编辑。逐字段确认会把需求卡变成一堆待办。
 */
export interface NeedFieldUpdate {
  id: string
  /** NEED_BRIEF_SCHEMA 里的 key */
  key: string
  value: string
  /** 来源标注，覆盖卡上原来的「邮件第 N 行」 */
  source: string
  rationale: string
  time: string
  /** 人工改过（覆盖了 AI 写入的值） */
  edited?: boolean
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
  /** 所属结构变体——报价矩阵是「变体 × 发行商」二维 */
  variantId: string
  variantLabel: string
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
  /** 该变体在可询价发行商里的覆盖度（按标的从产品目录算） */
  issuerCoverage?: string
  /** 相对基准变体的取舍 */
  tradeoff?: string
}

export interface TermsheetRow {
  field: string
  /** 交易登记记录（取代交易员手工 Excel 的那一份） */
  ticket: string
  /** Trade Support 录入的簿记 */
  booking: string
  /** 发行商最终条款书 */
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
      /**
       * 可多选：访谈明确"多个结构可以同时询价，看不同的报价，最后客户选一个"。
       * 收窄发生在客户确认那一步，不在这里。
       */
      selectedIds: string[]
      comparisonNote: string
      modifiedNote: string | null
      /**
       * 客户在需求阶段确认过的要素——结构阶段锁死，所有变体共用。
       * 客户确认的是他理解得了的东西（标的、缓冲、期限、接货），
       * 剩下的交易要素才是产品专家可调的。
       */
      lockedTerms?: TermRow[]
    }
  | {
      type: 'rfqPackage'
      fields: TermRow[]
      issuers: string[]
      checks: CompletenessCheck[]
      /** 同时询价的结构变体（共用 fields 里的锁定要素，只差可调参数） */
      variants?: { id: string; label: string; strike: string; autocall: string; payment: string }[]
    }
  | {
      type: 'quoteMatrix'
      quotes: Quote[]
      bestNote: string
      freshnessNote: string
      /** 矩阵的行：每个变体一行 */
      variants?: { id: string; label: string; terms: string; bestIssuer: string | null; bestCoupon: number | null }[]
    }
  | {
      type: 'clientQuote'
      issuer: string
      terms: TermRow[]
      summary: string
      riskSummary: string
      validityUntil: number | null
      internalNote: string
      /** 给客户的多个选项——客户在这一步收窄到一个 */
      options?: { id: string; label: string; issuer: string; coupon: number; terms: TermRow[]; summary: string; tradeoff: string }[]
    }
  | {
      // 对客邮件：AI 起草、RM 审核后发出。邮件本身就是留痕，不需要再补证据。
      type: 'clientEmail'
      to: string
      subject: string
      body: string
      sentAt: string
    }
  | {
      // 通话录音转写：电话渠道下，客户的话要先变成可引用的文本才能进指令识别。
      type: 'callTranscript'
      recordingId: string
      duration: string
      lines: { speaker: string; text: string; highlight?: boolean }[]
      intent: string
      confidence: string
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
      // 给上手方的下单指令。场外产品不走接口，是指令形式——
      // AI 把已确认要素装配成指令，交易员确认后代客下单。
      type: 'executionTicket'
      fields: TermRow[]
      quoteTime: string
      validityUntil: number | null
      note: string
      /** 执行前的内核检查点（资券冻结等），AI 只读结果不参与 */
      preTradeChecks?: { label: string; status: 'passed' | 'pending' | 'unconfirmed'; detail: string }[]
    }
  | {
      /**
       * 交易登记记录：真实流程里这是交易员手打的那张 Excel。
       * 它在任何系统之外，正是"这块还做不到自动"的原因——
       * 这里由系统直接产出，把两次手工录入消掉一次。
       */
      type: 'tradeRecord'
      fields: TermRow[]
      /**
       * 从上手方成交确认邮件抽取出来的要素 + 逐项与已确认指令的比对结果。
       * 交易员核对的是这个，不是照着邮件重打一遍。
       */
      extracted?: Record<string, string>
      /** 已确认指令里的对应值，用来比对 */
      expected?: Record<string, string>
      /** 确认邮件的原文参数，界面据此渲染左栏 */
      confirmEmail?: {
        issuer: string
        notional: string
        strike: string
        ki: string
        fill: string
        tradeTime: string
        settlement: string
        ticket: string
      }
      /** 对客价（客户确认时锁死） vs 上手成交价 vs 实际价差 */
      spread: {
        mode: string
        clientCoupon: number
        issuerFillCoupon: number
        registeredBp: number
        realisedBp: number
        thresholdBp: number
        breached: boolean
      }
      replacesNote: string
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
      /** 双署名标记，如 "agent 预分析 · 本人确认" */
      via?: string
      /** 发生时所处阶段（RoomFeed 按阶段折叠用，push 时自动打标） */
      stage?: StageKey
    }
  | {
      kind: 'system'
      id: string
      icon: 'check' | 'arrow' | 'alert' | 'flag' | 'send' | 'mail'
      text: string
      meta: string
      tone?: 'neutral' | 'success' | 'warning' | 'critical'
      // If set, only these roles see the event (e.g. hide a handoff event
      // from the joiner whose Context Brief restates it).
      audience?: RoleKey[]
      /** 协作类事件：在交易室的过滤版时间线（RoomFeed）中展示 */
      feed?: boolean
      stage?: StageKey
    }
  | { kind: 'artifact'; id: string; artifactId: string; time: string }
  | {
      // @ 某人后其 agent 的预分析：分层可见（仅提问者与被 @ 者），
      // 未经本人确认不进入公共层；确认发布后标记 superseded。
      kind: 'preAnalysis'
      id: string
      time: string
      asker: RoleKey
      target: RoleKey
      targetName: string
      text: string
      /** 这一版是真模型给的还是脚本 —— 现场要看得出来 */
      source?: 'live' | 'script' | 'fallback'
      superseded?: boolean
      stage?: StageKey
    }
  | { kind: 'processing'; id: string; lines: string[]; doneCount: number }
  | {
      /**
       * Agent 运行轨迹：叙述 + 工具调用 + 结果。
       * 展示的是它走过的路径，不是一个转圈图标。
       */
      kind: 'agentTrace'
      id: string
      title: string
      owner: RoleKey
      steps: import('./ai/agent').AgentStep[]
      done: boolean
      ms?: number
      rounds?: number
      toolCalls?: number
      /** 哪个阶段跑的——进入下一阶段后收进「此前阶段的讨论」 */
      stage?: StageKey
      /**
       * 谁 @ 出来的。有 asker 说明是别人请他的 agent 做的，产物双方可见，
       * 提问者理应看得到过程；自动触发的（没有 asker）是本人的私活，只有本人可见。
       */
      asker?: RoleKey
    }
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
  /** agent 正在想——占位气泡，回话到了就被替换掉 */
  thinking?: boolean
  /** 反向门：从交易室拉入讨论的产物引用 */
  quotedArtifactId?: string
  /** 划词批注带过来的原文片段（比整份产物精确，agent 知道你在说哪一句） */
  quotedText?: string
  /**
   * 正向门：agent 起草的待发布内容，发布后才进入交易室与审计。
   * specialistProposal = 产品专家 agent 的结构方向初稿（需本人修改确认）
   * clientBrief = 对客版本（已按受众脱敏，须 RM 审核后发出）
   */
  draft?: {
    kind: 'roomMessage' | 'deviation' | 'reply' | 'specialistProposal' | 'clientBrief' | 'tradeTerms' | 'clientQuoteEmail'
    text: string
    published: boolean
    preAnalysisId?: string
    /** 对客版本移除的内部字段（脱敏留痕） */
    redacted?: string[]
    /**
     * 结构化来源：正文由它渲染而来。
     * 结构化编辑改这个对象（diff 确定）；自由编辑只改 text（diff 退化成行级）。
     */
    proposal?: import('./config/fcn-pack/proposal').DirectionProposal
  }
}

// ── Pending formal action confirmation ──────────────────────────────────
export interface PendingConfirm {
  key: string
  title: string
  summary: string[]
  consequence: string
  confirmLabel: string
  danger?: boolean
  /**
   * 必须由人勾选背书的那一句。
   * 由发起方给——它才知道此刻要背书的到底是什么（需求是否已收敛、缺哪几项）。
   */
  ack?: string
  /**
   * 需要人在确认时选一条路的动作（目前只有「怎么把报价给客户」）。
   * 渠道决定的不是措辞而是留痕方式：邮件本身就是证据，电话得靠录音转写补上。
   */
  channels?: { key: string; label: string; detail: string }[]
  /**
   * 要发出去的文书全文。
   * 对外发送这类动作，摘要几行说不清「到底发的是哪段话」——把正文原样摆出来，
   * 「审核」才是真发生过的事，而不是卡面上的一句声称。
   */
  preview?: { label: string; body: string }
}

export type ViewKey = 'room' | 'assistant' | 'tasks'

export interface DrawerState {
  type: 'source' | 'history' | 'skills' | 'data' | 'archive' | 'case' | 'inventory' | 'matrix'
  payload?: { title: string; body: string; meta: string }
}
