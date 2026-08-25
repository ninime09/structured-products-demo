import { PEOPLE } from './data'
import { FCN_WORKFLOW } from './config/fcn-pack/workflow'
import { FCN_ISSUERS, TS_VALIDATION_FIELDS } from './config/fcn-pack/schemas'
import { POLICIES } from './config/fcn-pack/policies'
import type {
  AppNotification,
  Artifact,
  AuditEvent,
  CaseTruth,
  DrawerState,
  Participant,
  PendingConfirm,
  Person,
  PrivateMsg,
  Quote,
  LanguageKey,
  RoleKey,
  StructureOption,
  TimelineItem,
  ViewKey,
} from './types'

// ─────────────────────────────────────────────────────────────────────────
// Engine state
// ─────────────────────────────────────────────────────────────────────────
export interface EngineState {
  language: LanguageKey
  role: RoleKey
  view: ViewKey
  activeCaseId: string
  pinnedCaseIds: string[]
  archivedCaseIds: string[]
  truth: CaseTruth
  timeline: TimelineItem[]
  artifacts: Record<string, Artifact>
  audit: AuditEvent[]
  participants: Participant[]
  notifications: AppNotification[]
  detailsCollapsed: boolean
  drawer: DrawerState | null
  confirm: PendingConfirm | null
  focusArtifactId: string | null
  assistantQA: { q: string; a: string[] }[]
  now: number
  clarified: boolean
  kiModified: boolean
  requoteRound: number
  privateOpen: boolean
  privateChats: Record<RoleKey, PrivateMsg[]>
  pendingDraftId: string | null
}

type Listener = () => void

let idSeq = 0
const uid = (p: string) => `${p}-${++idSeq}`

// Fake business clock (HKT), advances deterministically with events.
let clockMin = 14 * 60 + 2
function fmtClock(): string {
  const h = Math.floor(clockMin / 60)
  const m = clockMin % 60
  return `${h}:${String(m).padStart(2, '0')}`
}
function tick(n = 1): string {
  clockMin += n
  return fmtClock()
}
function setClock(hm: string): string {
  const [h, m] = hm.split(':').map(Number)
  clockMin = h * 60 + m
  return fmtClock()
}

// ─────────────────────────────────────────────────────────────────────────
// Initial content for SP-001
// ─────────────────────────────────────────────────────────────────────────
const CLIENT_MSG =
  '收到 Mr. Chan 邮件：计划配置约 USD 1m，看好腾讯后市，期限约 6 个月，目标收益超过 10% p.a.，可以接受中等程度的下行风险。邮件未提及流动性偏好。'

const CLARIFY_MSG = '补充：客户确认可以持有到期，中途没有流动性要求。'

const CLIENT_REPLY = '客户回复：OK，就按 Morgan Stanley 这个条款做，USD 1,000,000，请今天内帮我执行。'

function needBriefArtifact(version: number, clarified: boolean): Artifact {
  return {
    id: 'art-need',
    title: 'Client Need Brief',
    titleZh: '客户需求摘要',
    status: 'DRAFT',
    version,
    createdAt: fmtClock(),
    data: {
      type: 'needBrief',
      fields: [
        { label: 'Underlying', value: 'Tencent / 0700.HK' },
        { label: 'Notional', value: 'USD 1,000,000' },
        { label: 'Investment Horizon', value: '~6M' },
        { label: 'Target Yield', value: '>10% p.a.' },
        { label: 'Risk Tolerance', value: '中等 Moderate' },
        { label: 'Client Classification', value: '个人 PI · 可承受产品风险等级 C4' },
        { label: 'Directional View', value: '看好 Bullish' },
        {
          label: 'Liquidity Preference',
          value: clarified ? '可持有到期 Hold to maturity' : '—',
        },
      ],
      missing: clarified ? [] : ['Liquidity preference / 流动性偏好'],
      sourceRef: clarified ? 'Mr. Chan 邮件 · 14:02 / Alice 补充 · 14:05' : 'Mr. Chan 邮件 · 14:02',
    },
  }
}

const STRUCTURE_OPTIONS = (ki: string): StructureOption[] => [
  {
    optionId: 'opt-a',
    label: '方案 A · 防御型',
    tone: 'Defensive',
    productType: 'FCN',
    tenor: '6M',
    strike: '80%',
    knockIn: '60%',
    autocall: '月度观察 · 自第 3 月起',
    couponTarget: '~8.8% p.a.',
    rationale: 'KI 更低，下行保护更强，但收益率低于客户 10% 目标。',
    risks: ['收益率不达客户目标', '提前赎回概率较高'],
  },
  {
    optionId: 'opt-b',
    label: '方案 B · 均衡型',
    tone: 'Balanced',
    productType: 'FCN',
    tenor: '6M',
    strike: '80%',
    knockIn: ki,
    autocall: '月度观察 · 自第 2 月起',
    couponTarget: ki === '65%' ? '~10.2% p.a.' : '~10.5% p.a.',
    rationale: '在客户中等风险容忍度内平衡收益与下行保护，预计可达 10%+ 目标。',
    risks: ['跌破 KI 后按 Strike 接股', '标的集中于单一个股'],
  },
  {
    optionId: 'opt-c',
    label: '方案 C · 收益+',
    tone: 'Yield+',
    productType: 'FCN',
    tenor: '6M',
    strike: '85%',
    knockIn: '75%',
    autocall: '月度观察 · 自第 2 月起',
    couponTarget: '~11.8% p.a.',
    rationale: '收益显著更高，但 KI 75% 超出客户中等风险容忍度。',
    risks: ['下行缓冲明显不足', '与客户风险偏好不匹配'],
  },
]

function quoteSet(round: number, nowMs: number, approvedKI: string): Quote[] {
  const bump = round * 0.04
  // BNP always quotes off-terms so the non-comparable path is demonstrable
  // regardless of which KI the specialist approved.
  const bnpKI = approvedKI === '65%' ? '70%' : '65%'
  const mk = (
    id: string,
    issuer: string,
    coupon: number | null,
    ki: string,
    secs: number | null,
    comparable: boolean,
    statusLabel: string,
    differences: string[] = [],
    best = false,
  ): Quote => ({
    id: `${id}-r${round}`,
    issuer,
    coupon: coupon === null ? null : +(coupon + bump).toFixed(2),
    strike: '80%',
    ki,
    tenor: '6M',
    expiresAt: secs === null ? null : nowMs + secs * 1000,
    comparable,
    differences,
    statusLabel,
    best,
  })
  return [
    mk('q-ms', 'Morgan Stanley', 10.62, approvedKI, 300, true, 'Best comparable', [], true),
    mk('q-jpm', 'JPM', 10.55, approvedKI, 272, true, 'Comparable'),
    mk('q-gs', 'Goldman Sachs', 10.48, approvedKI, 250, true, 'Comparable'),
    mk('q-bnp', 'BNP', 10.85, bnpKI, 291, false, 'Different terms', [`KI ${bnpKI} ≠ approved ${approvedKI}`]),
    mk('q-ubs', 'UBS', null, '—', null, false, '未回复'),
  ]
}

// ─────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────
function initialState(): EngineState {
  clockMin = 14 * 60 + 2
  const timeline: TimelineItem[] = [
    {
      kind: 'human',
      id: uid('tl'),
      author: PEOPLE.rm,
      time: '14:02',
      text: CLIENT_MSG,
    },
    { kind: 'artifact', id: uid('tl'), artifactId: 'art-need', time: '14:03' },
  ]
  setClock('14:03')
  return {
    language: typeof window !== 'undefined' && window.localStorage.getItem('structured-products-language') === 'en' ? 'en' : 'zh',
    role: 'rm',
    view: 'room',
    activeCaseId: 'SP-001',
    pinnedCaseIds: [],
    archivedCaseIds: [],
    truth: {
      caseId: 'SP-001',
      caseName: 'Tencent FCN',
      stage: 'need',
      stageException: false,
      status: 'CLIENT_NEED_DRAFT',
      statusLabel: '客户需求草稿',
      statusTone: 'neutral',
      currentOwner: PEOPLE.rm,
      waitingOn: null,
      nextAction: 'RM 复核并确认客户需求摘要',
      approvedTerms: null,
      alerts: [
        {
          id: 'al-missing',
          severity: 'warning',
          title: '客户信息缺失',
          detail: '缺少流动性偏好。可先补充说明，或在确认时明确接受缺失项。',
          owner: 'RM',
          actions: ['补充说明'],
        },
      ],
      recentChanges: [],
    },
    timeline,
    artifacts: { 'art-need': needBriefArtifact(1, false) },
    audit: [
      {
        id: uid('au'),
        time: '14:03',
        actor: 'AI Copilot',
        actorRole: 'AI',
        action: '已起草 Client Need Brief v1（提取自 Mr. Chan 邮件 14:02）',
        priorState: '—',
        newState: 'CLIENT_NEED_DRAFT',
      },
    ],
    participants: [{ person: PEOPLE.rm, joinedAt: '14:02', joinStageLabel: '客户需求 Client Need', active: true }],
    notifications: [],
    detailsCollapsed: false,
    drawer: null,
    confirm: null,
    focusArtifactId: 'art-need',
    assistantQA: [],
    now: Date.now(),
    clarified: false,
    kiModified: false,
    requoteRound: 0,
    privateOpen: false,
    privateChats: { rm: [], ps: [], dealer: [], ops: [] },
    pendingDraftId: null,
  }
}

class Store {
  state: EngineState = initialState()
  private listeners = new Set<Listener>()
  private epoch = 0
  private timers: ReturnType<typeof setTimeout>[] = []

  constructor() {
    setInterval(() => {
      // Advance the clock silently; only re-render when a countdown is on screen.
      this.state = { ...this.state, now: Date.now() }
      if (this.hasLiveCountdown()) this.listeners.forEach((l) => l())
    }, 1000)
  }

  private hasLiveCountdown(): boolean {
    const active = new Set(['ACTIVE', 'PENDING REVIEW', 'PENDING CONFIRMATION', 'DRAFT', 'SENT'])
    return Object.values(this.state.artifacts).some((a) => {
      if (!active.has(a.status)) return false
      if (a.data.type === 'quoteMatrix') return a.data.quotes.some((q) => q.expiresAt !== null)
      if (a.data.type === 'clientQuote') return a.data.validityUntil !== null
      if (a.data.type === 'executionTicket') return a.data.validityUntil !== null
      return false
    })
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getState = () => this.state

  private set(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
  }
  private patchTruth(patch: Partial<CaseTruth>) {
    this.set({ truth: { ...this.state.truth, ...patch } })
  }
  private push(item: TimelineItem) {
    this.set({ timeline: [...this.state.timeline, item] })
  }
  private putArtifact(a: Artifact) {
    this.set({ artifacts: { ...this.state.artifacts, [a.id]: a } })
  }
  private updateArtifact(id: string, patch: Partial<Artifact>) {
    const a = this.state.artifacts[id]
    if (!a) return
    this.putArtifact({ ...a, ...patch })
  }
  private addAudit(e: Omit<AuditEvent, 'id'>) {
    this.set({ audit: [...this.state.audit, { ...e, id: uid('au') }] })
  }
  private addChange(text: string, meta: string) {
    const rc = [{ id: uid('rc'), text, meta }, ...this.state.truth.recentChanges].slice(0, 5)
    this.patchTruth({ recentChanges: rc })
  }

  /**
   * 正式流转引擎：五步骨架只写这一遍，具体流转由 FCN_WORKFLOW 表驱动。
   * 表之外的状态变化（AI 起草、时效标记等）不走这里。
   */
  private formalTransition(key: string, opts: { time: string; detail?: string; truth?: Partial<CaseTruth> }) {
    const rule = FCN_WORKFLOW[key]
    if (!rule) return
    if (!rule.allowedRoles.includes(this.state.role)) {
      console.warn(`[workflow] ${key} blocked: role ${this.state.role} not in`, rule.allowedRoles)
      return
    }
    const actor = PEOPLE[this.state.role]
    this.addAudit({
      time: opts.time,
      actor: actor.name,
      actorRole: actor.roleLabel,
      action: rule.auditAction,
      priorState: this.state.truth.status,
      newState: rule.to,
      detail: opts.detail,
    })
    this.patchTruth({
      status: rule.to,
      statusLabel: rule.toLabel,
      statusTone: rule.toTone,
      ...(rule.stage ? { stage: rule.stage } : {}),
      ...(rule.owner !== undefined ? { currentOwner: rule.owner ? PEOPLE[rule.owner] : null } : {}),
      ...opts.truth,
    })
  }
  private later(ms: number, fn: () => void) {
    const ep = this.epoch
    const t = setTimeout(() => {
      if (ep === this.epoch) fn()
    }, ms)
    this.timers.push(t)
  }

  /** AI processing indicator: lines appear as done one-by-one, then `then()` runs. */
  private runProcessing(lines: string[], stepMs: number, then: () => void) {
    const id = uid('proc')
    this.push({ kind: 'processing', id, lines, doneCount: 0 })
    lines.forEach((_, i) => {
      this.later(stepMs * (i + 1), () => {
        this.set({
          timeline: this.state.timeline.map((t) =>
            t.kind === 'processing' && t.id === id ? { ...t, doneCount: i + 1 } : t,
          ),
        })
      })
    })
    this.later(stepMs * lines.length + 350, () => {
      this.set({ timeline: this.state.timeline.filter((t) => !(t.kind === 'processing' && t.id === id)) })
      then()
    })
  }

  /** Current approved KI, single source of truth for downstream narrative. */
  private approvedKI(): string {
    return this.state.truth.approvedTerms?.find((t) => t.label === 'KI')?.value ?? (this.state.kiModified ? '65%' : '70%')
  }

  /** Register a role as active participant; returns false if already present. */
  private addParticipant(person: Person, joinedAt: string, joinStageLabel: string): boolean {
    if (this.state.participants.some((p) => p.person.role === person.role)) return false
    this.set({ participants: [...this.state.participants, { person, joinedAt, joinStageLabel, active: true }] })
    return true
  }

  /** Join-time Context Brief (§5.3) — pushed only on a role's first activation. */
  private pushContextBrief(
    person: Person,
    stageLabel: string,
    lines: string[],
    evidence: { label: string; artifactId: string }[],
    nextAction: string,
  ) {
    const time = fmtClock()
    if (!this.addParticipant(person, time, stageLabel)) return
    this.push({ kind: 'contextBrief', id: uid('tl'), joiner: person, stageLabel, time, lines, evidence, nextAction })
    // The case "arrives" for this role: notify instead of exposing it early.
    this.set({
      notifications: [
        ...this.state.notifications,
        {
          id: uid('ntf'),
          role: person.role,
          caseId: this.state.truth.caseId,
          title: `${this.state.truth.caseId} · ${this.state.truth.caseName} 已交接给你`,
          body: nextAction,
          time,
          read: false,
        },
      ],
    })
  }

  markNotificationRead(id: string) {
    this.set({ notifications: this.state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })
  }

  private latestMatrix(): Artifact | null {
    const ids = Object.keys(this.state.artifacts)
      .filter((k) => k.startsWith('art-matrix'))
      .sort()
    return ids.length ? this.state.artifacts[ids[ids.length - 1]] : null
  }

  private pushArtifactItem(artifact: Artifact, focus = true) {
    this.putArtifact(artifact)
    this.push({ kind: 'artifact', id: uid('tl'), artifactId: artifact.id, time: artifact.createdAt })
    if (focus) this.set({ focusArtifactId: artifact.id })
  }

  private systemEvent(
    icon: 'check' | 'arrow' | 'alert' | 'flag' | 'send',
    text: string,
    meta: string,
    tone: 'neutral' | 'success' | 'warning' | 'critical' = 'neutral',
    audience?: RoleKey[],
  ) {
    this.push({ kind: 'system', id: uid('tl'), icon, text, meta, tone, audience })
  }

  // ── UI actions ─────────────────────────────────────────────────────────
  setRole(role: RoleKey) {
    const joined = this.state.participants.some((p) => p.person.role === role)
    if (this.state.view === 'room' && this.state.activeCaseId === 'SP-001' && !joined) {
      // No access to this room yet — land on the role's own work entry.
      this.set({ role, view: 'assistant', drawer: null })
      return
    }
    this.set({ role })
  }
  setLanguage(language: LanguageKey) {
    if (typeof window !== 'undefined') window.localStorage.setItem('structured-products-language', language)
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    this.set({ language })
  }
  toggleDetails() {
    this.set({ detailsCollapsed: !this.state.detailsCollapsed })
  }
  setView(view: ViewKey) {
    this.set({ view, drawer: null })
  }
  openCase(caseId: string) {
    this.set({ activeCaseId: caseId, view: 'room', drawer: null })
  }
  toggleCasePinned(caseId: string) {
    if (this.state.archivedCaseIds.includes(caseId)) return
    const pinnedCaseIds = this.state.pinnedCaseIds.includes(caseId)
      ? this.state.pinnedCaseIds.filter((id) => id !== caseId)
      : [...this.state.pinnedCaseIds, caseId]
    this.set({ pinnedCaseIds })
  }
  archiveCase(caseId: string) {
    if (this.state.archivedCaseIds.includes(caseId)) return
    this.set({
      archivedCaseIds: [...this.state.archivedCaseIds, caseId],
      pinnedCaseIds: this.state.pinnedCaseIds.filter((id) => id !== caseId),
      view: this.state.activeCaseId === caseId ? 'assistant' : this.state.view,
      drawer: null,
    })
  }
  restoreCase(caseId: string) {
    if (caseId === 'SP-001' && this.state.truth.status === 'COMPLETED') return
    this.set({ archivedCaseIds: this.state.archivedCaseIds.filter((id) => id !== caseId) })
  }
  openDrawer(d: DrawerState) {
    this.set({ drawer: d })
  }
  closeDrawer() {
    this.set({ drawer: null })
  }
  clearFocus() {
    this.set({ focusArtifactId: null })
  }
  askAssistant(q: string, a: string[]) {
    this.set({ assistantQA: [...this.state.assistantQA, { q, a }] })
  }
  postTradeRoomMessage(text: string) {
    const body = text.trim()
    if (!body) return
    const author = PEOPLE[this.state.role]
    this.push({
      kind: 'human',
      id: uid('tl'),
      author,
      time: tick(),
      text: body,
    })
    // 自然语言流程偏离：结构审批阶段，识别"跳过/直连询价"类请求 → AI 起草偏离卡。
    if (
      this.state.truth.status === 'STRUCTURE_REVIEW' &&
      !this.state.artifacts['art-dev'] &&
      /跳过|直接询价|直连询价|不用比较|省略比较|skip/i.test(body)
    ) {
      this.runProcessing(
        ['AI 正在评估流程偏离请求...', '正在核对强制检查项（适当性 · 职责分离不可豁免）...'],
        800,
        () => {
          const ct = tick(1)
          this.pushArtifactItem({
            id: 'art-dev',
            title: 'Process Deviation Proposal',
            titleZh: '流程偏离卡',
            status: 'PENDING APPROVAL',
            version: 1,
            createdAt: ct,
            data: {
              type: 'deviationProposal',
              request: body,
              requestedBy: `${author.name} · ${author.roleLabel}`,
              classification: '路径非标 · 可受理（不豁免任何强制检查）',
              skips: '结构三方案对比（结构 → 询价 直连）',
              basis: '客户邮件已含完整条款：FCN · 6M · Strike 80% · KI 70%',
              risks: ['未经方案比较，票息可能非最优', '适当性检查与职责分离仍强制执行', '偏离事件计入流程改进统计'],
              approver: 'David · 产品专家',
            },
          })
          this.systemEvent('flag', 'AI 起草了流程偏离卡：跳过结构对比，需产品专家确认', `AI · ${ct}`, 'warning')
          this.addAudit({
            time: ct,
            actor: 'AI Copilot',
            actorRole: 'AI',
            action: '已起草 Process Deviation Proposal（等待产品专家确认）',
            priorState: 'STRUCTURE_REVIEW',
            newState: 'STRUCTURE_REVIEW',
          })
        },
      )
    }
  }
  // ── 私有工作区（两区模型）────────────────────────────────────────────
  togglePrivate(open?: boolean) {
    this.set({ privateOpen: open ?? !this.state.privateOpen })
  }

  private pushPrivate(role: RoleKey, msg: PrivateMsg) {
    this.set({ privateChats: { ...this.state.privateChats, [role]: [...this.state.privateChats[role], msg] } })
  }

  /** 反向门：把交易室产物拉入私区讨论（只读引用，留来源，不留讨论痕） */
  pullIntoPrivate(artifactId: string) {
    const a = this.state.artifacts[artifactId]
    if (!a) return
    const role = this.state.role
    this.set({ privateOpen: true })
    let text = `已读取「${a.titleZh}」v${a.version}。想让我分析什么？`
    if (a.data.type === 'quoteMatrix') {
      text = `已读取报价矩阵 v${a.version}：Morgan Stanley 10.62% 为最优可比；BNP 票息 10.85% 更高，但 KI 65% ≠ 批准结构的 70%，条款不可比，不能直接用于客户报价。要我解释原因，或起草给客户的说明吗？`
    } else if (a.data.type === 'termsheetValidation') {
      text = `已读取条款书核对 v${a.version}：Settlement 执行单 T+2 ≠ 条款书 T+3，其余 5 项一致。客户指令与执行记录都写 T+2，差异大概率是发行商文档笔误——建议请求更正版，无需客户重新确认。`
    }
    this.pushPrivate(role, { id: uid('pm'), who: 'agent', time: tick(), text, quotedArtifactId: artifactId })
  }

  sendPrivate(text: string) {
    const body = text.trim()
    if (!body) return
    const role = this.state.role
    this.pushPrivate(role, { id: uid('pm'), who: 'me', time: tick(), text: body })
    this.later(700, () => this.agentReply(role, body))
  }

  /** 演示用规则式 agent 回复：真实实现由运行时层（模型网关+上下文装配）承接 */
  private agentReply(role: RoleKey, q: string) {
    const t = tick()
    if (this.state.truth.status === 'STRUCTURE_REVIEW' && /跳过|直接询价|直连询价|不用比较|省略比较/.test(q)) {
      this.pushPrivate(role, {
        id: uid('pm'), who: 'agent', time: t,
        text: '可以走流程偏离：客户邮件已含完整条款（FCN · 6M · Strike 80% · KI 70%）。注意两点——适当性与职责分离检查不会被豁免；偏离会作为独立事件留痕并计入流程改进统计。我起草了一条发往交易室的偏离请求，你确认后发布：',
        draft: { kind: 'deviation', text: '客户条款已完整（FCN · 6M · Strike 80% · KI 70%），建议跳过三方案对比，直接询价。', published: false },
      })
      return
    }
    if (/话术|怎么跟客户|客户沟通|说明|解释给客户/.test(q)) {
      this.pushPrivate(role, {
        id: uid('pm'), who: 'agent', time: t,
        text: '这是给客户的说明草稿（口径已按"先讲下行保护再谈票息"的附注调整），发布前你可以再改：',
        draft: { kind: 'roomMessage', text: '和客户沟通口径：只要腾讯期间不跌破期初价的 70%，到期收回全部本金及票息；若曾跌破且到期低于 80%，将按 80% 接入股票。建议先确认客户理解下行情形，再报票息水平。', published: false },
      })
      return
    }
    if (/BNP|不可比/.test(q)) {
      this.pushPrivate(role, {
        id: uid('pm'), who: 'agent', time: t,
        text: 'BNP 的 10.85% 看起来更高，但它把 KI 改成了 65%——下行保护比批准结构差了 5 个点，相当于用更高风险换票息。按流程它已被隔离在不可比区，如果想采纳，需要退回产品专家改结构重新审批，不能直接报给客户。',
      })
      return
    }
    this.pushPrivate(role, {
      id: uid('pm'), who: 'agent', time: t,
      text: `当前 SP-001 处于「${this.state.truth.statusLabel}」，下一步：${this.state.truth.nextAction}。你可以让我分析产物（在交易室里点"拉入私区讨论"）、起草客户话术，或在结构审批阶段提出流程偏离。`,
    })
  }

  /** 正向门：发布草稿到交易室——显式确认，仅发布内容进入共享上下文与审计 */
  publishDraft(msgId: string) {
    this.set({ pendingDraftId: msgId })
    this.requestConfirm({
      key: 'publishPrivateDraft',
      title: '发布到交易室 Publish to Trade Room',
      summary: ['仅发布内容进入共享上下文并留痕', '你与 agent 的讨论过程保留在私有工作区，不发布、不落审计'],
      consequence: '发布是跨越私有/共享边界的显式动作，将以你的名义计入交易室时间线与审计日志。',
      confirmLabel: '发布',
    })
  }

  private doPublishDraft() {
    const role = this.state.role
    const msgs = this.state.privateChats[role]
    const m = msgs.find((x) => x.id === this.state.pendingDraftId)
    if (!m?.draft || m.draft.published) return
    this.postTradeRoomMessage(m.draft.text)
    this.addAudit({
      time: fmtClock(),
      actor: PEOPLE[role].name,
      actorRole: PEOPLE[role].roleLabel,
      action: '发布私区草稿到交易室（仅发布内容进入共享上下文）',
      priorState: this.state.truth.status,
      newState: this.state.truth.status,
    })
    this.set({
      pendingDraftId: null,
      privateChats: {
        ...this.state.privateChats,
        [role]: msgs.map((x) => (x.id === m.id ? { ...x, draft: { ...x.draft!, published: true } } : x)),
      },
    })
  }

  reset() {
    this.epoch++
    this.timers.forEach(clearTimeout)
    this.timers = []
    idSeq = 0
    const keepRole = this.state.role
    const keepView = this.state.view
    const keepDetails = this.state.detailsCollapsed
    const keepLanguage = this.state.language
    this.state = { ...initialState(), language: keepLanguage, role: keepRole, view: keepView, detailsCollapsed: keepDetails }
    this.listeners.forEach((l) => l())
  }

  // ── Formal action confirmation flow ────────────────────────────────────
  requestConfirm(c: PendingConfirm) {
    this.set({ confirm: c })
  }
  cancelConfirm() {
    this.set({ confirm: null })
  }
  executeConfirmed() {
    const key = this.state.confirm?.key
    this.set({ confirm: null })
    if (!key) return
    const map: Record<string, () => void> = {
      confirmNeed: () => this.doConfirmNeed(),
      approveStructure: () => this.doApproveStructure(),
      approveDeviation: () => this.doApproveDeviation(),
      publishPrivateDraft: () => this.doPublishDraft(),
      acceptPricing: () => this.doAcceptPricing(),
      returnRFQ: () => this.doLoopToStructure('returnRFQ', 'Dealer 复核 RFQ 后退回：KI 65% 建议复核发行商可行性'),
      modifyFromPricing: () => this.doLoopToStructure('modifyFromPricing', '报价矩阵显示当前结构经济性不足，退回产品专家修改'),
      requestRequote: () => this.doRequestRequote(),
      prepareClientQuote: () => this.doPrepareClientQuote(),
      sendClientQuote: () => this.doSendClientQuote(),
      confirmInstruction: () => this.doConfirmInstruction(),
      rejectInstruction: () => this.doRejectInstruction(),
      requestLiveRequote: () => this.doRequestLiveRequote(),
      executeTrade: () => this.doExecuteTrade(),
      approveTermsheet: () => this.doApproveTermsheet(),
      raiseException: () => this.doRaiseException(),
      resolveException: () => this.doResolveException(),
    }
    map[key]?.()
  }

  // ── Informal actions ───────────────────────────────────────────────────
  addClarification() {
    if (this.state.clarified) return
    const t = setClock('14:05')
    this.push({ kind: 'human', id: uid('tl'), author: PEOPLE.rm, time: t, text: CLARIFY_MSG })
    this.set({ clarified: true })
    this.runProcessing(['正在更新客户需求摘要...'], 700, () => {
      setClock('14:06')
      const a = needBriefArtifact(2, true)
      this.putArtifact(a)
      this.patchTruth({ alerts: this.state.truth.alerts.filter((x) => x.id !== 'al-missing') })
      this.addAudit({
        time: '14:06',
        actor: 'AI Copilot',
        actorRole: 'AI',
        action: '已更新 Client Need Brief v2：补充流动性偏好',
        priorState: 'CLIENT_NEED_DRAFT',
        newState: 'CLIENT_NEED_DRAFT',
      })
    })
  }

  selectOption(optionId: string) {
    const a = this.state.artifacts['art-structure']
    if (!a || a.data.type !== 'structureProposal' || a.status === 'APPROVED') return
    this.updateArtifact('art-structure', { data: { ...a.data, selectedId: optionId } })
  }

  modifyKI() {
    const a = this.state.artifacts['art-structure']
    if (!a || a.data.type !== 'structureProposal' || this.state.kiModified) return
    const t = setClock('14:12')
    this.updateArtifact('art-structure', {
      version: a.version + 1,
      data: {
        ...a.data,
        options: STRUCTURE_OPTIONS('65%'),
        selectedId: 'opt-b',
        modifiedNote: 'David 将方案 B 的 KI 由 70% 调整为 65%：更贴合客户中等下行容忍度，coupon 目标略降至 ~10.2%。',
      },
    })
    this.set({ kiModified: true })
    // Working-process detail: only the specialist's own view shows it.
    this.systemEvent('arrow', '结构参数已修改：KI 70% → 65%', `David · 产品专家 · ${t}`, 'neutral', ['ps'])
    this.addAudit({
      time: t,
      actor: 'David',
      actorRole: '产品专家',
      action: '修改 Structure Proposal v2：方案 B KI 70% → 65%',
      priorState: 'STRUCTURE_REVIEW',
      newState: 'STRUCTURE_REVIEW',
    })
  }

  // ── Step 1: Confirm client need (RM) ───────────────────────────────────
  private doConfirmNeed() {
    const t = setClock('14:08')
    this.updateArtifact('art-need', {
      status: 'APPROVED',
      approvedMeta: `Alice · RM · ${t} 确认`,
      note: { author: 'Alice · RM', text: '客户对保本的敏感度高于收益目标；与客户沟通时先讲下行保护，再谈票息。' },
    })
    // David's Context Brief restates this — don't show him the event twice.
    this.systemEvent('check', '客户需求已确认', `Assigned to David · 产品专家 · ${t}`, 'success', ['rm', 'dealer'])
    this.formalTransition('confirmNeed', {
      time: t,
      truth: {
        waitingOn: null,
        nextAction: '等待 AI 生成结构方案',
        alerts: this.state.truth.alerts.filter((x) => x.id !== 'al-missing'),
      },
    })
    this.addChange('客户需求 Approved', `Alice · RM · ${t}`)
    this.pushContextBrief(
      PEOPLE.ps,
      'Structuring · 结构设计',
      [
        `Alice 已于 ${t} 确认客户需求：0700.HK · USD 1,000,000 · ~6M · 目标收益 >10% · 中等风险。`,
        '附注（Alice）：客户对保本的敏感度高于收益目标；沟通时先讲下行保护。',
      ],
      [{ label: 'Client Need Brief · 客户需求摘要', artifactId: 'art-need' }],
      '复核已确认客户需求，比较并审批结构方案',
    )
    this.later(600, () => {
      this.runProcessing(['正在生成候选结构...', '正在比较参数与风险点...'], 900, () => {
        const ct = setClock('14:09')
        this.pushArtifactItem({
          id: 'art-structure',
          title: 'Structure Proposal',
          titleZh: '结构方案',
          status: 'PENDING APPROVAL',
          version: 1,
          createdAt: ct,
          data: {
            type: 'structureProposal',
            options: STRUCTURE_OPTIONS('70%'),
            recommendedId: 'opt-b',
            selectedId: 'opt-b',
            comparisonNote: 'AI 生成了 3 个候选结构供产品专家比较。方案 B 在收益目标与风险容忍度之间较平衡；最终判断由产品专家作出。',
            modifiedNote: null,
          },
        })
        this.patchTruth({
          status: 'STRUCTURE_REVIEW',
          statusLabel: '结构待审批',
          statusTone: 'warning',
          nextAction: '产品专家选择 / 修改并审批结构',
        })
        this.addAudit({
          time: ct,
          actor: 'AI Copilot',
          actorRole: 'AI',
          action: '已生成 Structure Proposal v1（3 个候选）',
          priorState: 'CLIENT_NEED_APPROVED',
          newState: 'STRUCTURE_REVIEW',
        })
      })
    })
  }

  // ── Step 2: Approve structure (PS) ─────────────────────────────────────
  private doApproveStructure() {
    const a = this.state.artifacts['art-structure']
    if (!a || a.data.type !== 'structureProposal') return
    const data = a.data
    const opt = data.options.find((o) => o.optionId === data.selectedId) ?? data.options[1]
    const t = setClock('14:15')
    this.updateArtifact('art-structure', {
      status: 'APPROVED',
      approvedMeta: `David · 产品专家 · ${t} 审批`,
    })
    // Ken's Context Brief restates the approval — keep the event for RM / PS.
    this.systemEvent('check', `结构已审批：${opt.label} · KI ${opt.knockIn} · Strike ${opt.strike}`, `David · 产品专家 · ${t}`, 'success', ['rm', 'ps'])
    this.formalTransition('approveStructure', {
      time: t,
      detail: this.state.kiModified ? `${opt.label} · KI 70% → 65%` : opt.label,
      truth: {
      waitingOn: null,
      nextAction: '等待 AI 生成 RFQ包',
      approvedTerms: [
        { label: 'Underlying', value: '0700.HK' },
        { label: 'Product', value: `FCN · ${opt.tenor}` },
        { label: 'Notional', value: 'USD 1,000,000' },
        { label: 'Strike', value: opt.strike },
        { label: 'KI', value: opt.knockIn },
        { label: 'Autocall', value: opt.autocall },
      ],
      },
    })
    if (this.state.kiModified) this.addChange('KI 70% → 65%', `Approved by David · ${t}`)
    this.addChange('结构 Approved', `David · 产品专家 · ${t}`)
    this.queueRFQGeneration(
      { tenor: opt.tenor, strike: opt.strike, knockIn: opt.knockIn, autocall: opt.autocall },
      `David 已于 ${t} 审批结构：Tencent FCN · ${opt.tenor} · Strike ${opt.strike} · KI ${opt.knockIn}，RFQ Package 已生成并通过完整性检查。`,
    )
  }

  /** 结构确认（正常审批或偏离批准）后，AI 生成 RFQ 包并交接 Dealer。 */
  private queueRFQGeneration(
    terms: { tenor: string; strike: string; knockIn: string; autocall: string },
    briefLine: string,
  ) {
    this.later(600, () => {
      this.runProcessing(['正在起草 RFQ 包...', '正在做完整性检查...'], 900, () => {
        const ct = setClock('14:16')
        this.pushArtifactItem({
          id: 'art-rfq',
          title: 'RFQ Package',
          titleZh: 'RFQ包',
          status: 'PENDING REVIEW',
          version: this.state.requoteRound + 1,
          createdAt: ct,
          data: {
            type: 'rfqPackage',
            fields: [
              { label: 'Product Type', value: 'Fixed Coupon Note (FCN)' },
              { label: 'Underlying', value: 'Tencent / 0700.HK' },
              { label: 'Notional', value: 'USD 1,000,000' },
              { label: 'Tenor', value: terms.tenor },
              { label: 'Strike', value: terms.strike },
              { label: 'Knock-In', value: terms.knockIn },
              { label: 'Autocall', value: terms.autocall },
              { label: 'Coupon Type', value: 'Fixed · 月付' },
              { label: 'Settlement', value: 'T+2 · 现金/实物' },
            ],
            issuers: FCN_ISSUERS,
            checks: [
              { label: '关键条款完整（strike / KI / tenor / coupon type）', ok: true },
              { label: '与 Approved Structure 一致', ok: true },
              { label: '发行商清单已按标的覆盖度生成', ok: true },
            ],
          },
        })
        this.patchTruth({
          status: 'RFQ_READY',
          statusLabel: 'RFQ 待复核',
          statusTone: 'warning',
          nextAction: 'Dealer 复核 RFQ包并接受询价请求',
        })
        this.addAudit({
          time: ct,
          actor: 'AI Copilot',
          actorRole: 'AI',
          action: '已起草 RFQ Package（完整性检查通过）',
          priorState: 'STRUCTURE_APPROVED',
          newState: 'RFQ_READY',
        })
        this.pushContextBrief(
          PEOPLE.dealer,
          'RFQ Ready',
          [briefLine],
          [
            { label: 'Approved Structure · 已审批结构', artifactId: 'art-structure' },
            { label: 'RFQ Package · RFQ包', artifactId: 'art-rfq' },
          ],
          '复核 RFQ 并接受定价请求',
        )
      })
    })
  }

  // ── 流程偏离：自然语言请求 → AI 起草偏离卡 → 产品专家确认 ─────────────
  private doApproveDeviation() {
    const dev = this.state.artifacts['art-dev']
    if (!dev || dev.data.type !== 'deviationProposal' || dev.status !== 'PENDING APPROVAL') return
    const t = tick(1)
    this.updateArtifact('art-dev', { status: 'APPROVED', approvedMeta: `David · 产品专家 · ${t} 批准偏离` })
    const a = this.state.artifacts['art-structure']
    if (a) this.updateArtifact('art-structure', { status: 'SUPERSEDED' })
    this.systemEvent('flag', '流程偏离已批准：跳过结构对比，按客户条款直接询价', `David · 产品专家 · ${t}`, 'warning')
    this.formalTransition('approveDeviation', {
      time: t,
      detail: '跳过结构对比 · 依据客户完整条款（偏离事件计入流程改进统计）',
      truth: {
        waitingOn: null,
        nextAction: '等待 AI 生成 RFQ包',
        approvedTerms: [
          { label: 'Underlying', value: '0700.HK' },
          { label: 'Product', value: 'FCN · 6M' },
          { label: 'Notional', value: 'USD 1,000,000' },
          { label: 'Strike', value: '80%' },
          { label: 'KI', value: '70%' },
          { label: 'Autocall', value: '月度观察 · 自第 2 月起' },
        ],
      },
    })
    this.addChange('流程偏离批准 · 直连询价', `David · ${t}`)
    this.queueRFQGeneration(
      { tenor: '6M', strike: '80%', knockIn: '70%', autocall: '月度观察 · 自第 2 月起' },
      `David 已于 ${t} 批准流程偏离：跳过结构对比，按客户完整条款（FCN · 6M · Strike 80% · KI 70%）直接询价。偏离已单独留痕。`,
    )
  }

  /** 驳回偏离请求：回到标准流程，不改变案例状态。 */
  rejectDeviation() {
    const dev = this.state.artifacts['art-dev']
    if (!dev || dev.status !== 'PENDING APPROVAL') return
    const t = tick(1)
    this.updateArtifact('art-dev', { status: 'STALE', approvedMeta: `David · 产品专家 · ${t} 驳回，按标准流程继续` })
    this.systemEvent('arrow', '流程偏离被驳回：继续标准结构对比流程', `David · 产品专家 · ${t}`)
    this.addAudit({
      time: t,
      actor: 'David',
      actorRole: '产品专家',
      action: 'Reject Process Deviation',
      priorState: this.state.truth.status,
      newState: this.state.truth.status,
    })
  }

  // ── Loop 11.1 / 11.3: back to structure ────────────────────────────────
  private doLoopToStructure(key: 'returnRFQ' | 'modifyFromPricing', reason: string) {
    const t = tick(1)
    this.updateArtifact('art-rfq', { status: 'SUPERSEDED' })
    const qm = this.latestMatrix()
    if (qm) this.updateArtifact(qm.id, { status: 'STALE' })
    this.systemEvent('arrow', '已退回产品专家修改结构', `${reason} · ${t}`, 'warning')
    const a = this.state.artifacts['art-structure']
    if (a) this.updateArtifact('art-structure', { status: 'PENDING APPROVAL', version: a.version + 1, approvedMeta: undefined })
    this.formalTransition(key, {
      time: t,
      detail: reason,
      truth: {
        waitingOn: null,
        nextAction: '产品专家修改结构并重新审批',
        alerts: [
          {
            id: 'al-loop',
            severity: 'warning',
            title: '结构需要修改',
            detail: reason,
            owner: '产品专家',
            actions: ['修改结构', '重新审批'],
          },
          ...this.state.truth.alerts.filter((x) => x.id !== 'al-loop'),
        ],
      },
    })
    this.addChange('RFQ 退回 → 修改结构', t)
  }

  // ── Step 3: Accept pricing request (Dealer) ────────────────────────────
  private doAcceptPricing() {
    const t = setClock('14:18')
    this.updateArtifact('art-rfq', { status: 'ACCEPTED', approvedMeta: `Ken · Dealer · ${t} 接受询价请求` })
    this.systemEvent('send', '询价已通过标准询价接口发出 → JPM · UBS · MS · GS · BNP（结构化请求）', `Ken · Dealer · ${t}`)
    this.formalTransition('acceptPricing', {
      time: t,
      truth: {
        waitingOn: 'JPM · UBS · MS · GS · BNP',
        nextAction: '等待外部发行商返回报价',
        alerts: this.state.truth.alerts.filter((x) => x.id !== 'al-loop'),
      },
    })
    this.addChange('询价已发出（5 家发行商）', t)
    this.later(1500, () => {
      this.systemEvent('arrow', '收到报价：JPM 10.55% · GS 10.48%', `${tick(1)}`)
      this.patchTruth({ waitingOn: 'UBS · MS · BNP' })
    })
    this.later(3000, () => {
      this.systemEvent('arrow', '收到报价：Morgan Stanley 10.62% · BNP 10.85%（条款不同）', `${tick(1)}`)
      this.patchTruth({ waitingOn: 'UBS' })
    })
    this.later(4300, () => {
      this.runProcessing(['正在标准化 4 条报价...', '正在比较条款可比性...', '正在检查报价时效...'], 800, () => {
        this.buildQuoteMatrix()
      })
    })
  }

  private buildQuoteMatrix() {
    const ct = setClock(this.state.requoteRound > 0 ? fmtClock() : '14:22')
    const round = this.state.requoteRound
    const ki = this.approvedKI()
    const quotes = quoteSet(round, Date.now(), ki)
    const bnp = quotes.find((q) => q.issuer === 'BNP')
    const artifact: Artifact = {
      id: `art-matrix-r${round}`,
      title: 'Quote Matrix',
      titleZh: '报价矩阵',
      status: 'ACTIVE',
      version: round + 1,
      createdAt: ct,
      data: {
        type: 'quoteMatrix',
        quotes,
        bestNote: 'Morgan Stanley 为最优可比报价：可比报价中 coupon 最高，条款与 Approved Structure 一致。',
        freshnessNote: `报价由标准询价接口返回并自动标准化。UBS 未回复。BNP 条款不可比（KI ${bnp?.ki}），即使 coupon 更高也已单独分区。`,
      },
    }
    this.pushArtifactItem(artifact)
    this.patchTruth({
      waitingOn: null,
      nextAction: 'Dealer 复核报价矩阵：准备客户报价 / 请求重报 / 修改结构',
      alerts: [
        {
          id: 'al-bnp',
          severity: 'warning',
          title: 'BNP 报价条款不可比',
          detail: `BNP 使用 KI ${bnp?.ki}，而 Approved RFQ 为 KI ${ki}。虽然 coupon ${bnp?.coupon?.toFixed(2)}% 更高，不能直接用于客户报价。`,
          owner: 'Dealer / 产品专家',
          actions: ['排除该报价', '修改结构', '请求重报'],
        },
        ...this.state.truth.alerts.filter((x) => x.id !== 'al-bnp' && x.id !== 'al-expired'),
      ],
    })
    this.addAudit({
      time: ct,
      actor: 'AI Copilot',
      actorRole: 'AI',
      action: `已生成 Quote Matrix v${artifact.version}（4 条报价，1 条不可比，UBS 未回复）`,
      priorState: 'PRICING_IN_PROGRESS',
      newState: 'PRICING_IN_PROGRESS',
    })
  }

  // ── Loop 11.2: requote ─────────────────────────────────────────────────
  private doRequestRequote() {
    const t = tick(1)
    this.set({ requoteRound: this.state.requoteRound + 1 })
    const qm = this.latestMatrix()
    if (qm) this.updateArtifact(qm.id, { status: 'STALE' })
    this.systemEvent('send', '已请求重报 → JPM · UBS · MS · GS · BNP', `Ken · Dealer · ${t}`)
    this.formalTransition('requestRequote', {
      time: t,
      truth: {
        waitingOn: 'JPM · UBS · MS · GS · BNP',
        nextAction: '等待外部发行商返回新报价',
      },
    })
    this.later(2200, () => {
      this.systemEvent('arrow', '收到新一轮报价（4 家，UBS 仍未回复）', tick(2))
      this.patchTruth({ status: 'PRICING_IN_PROGRESS', statusLabel: '定价进行中', statusTone: 'progress', waitingOn: null })
      this.runProcessing(['正在标准化新报价...', '正在刷新时效检查...'], 750, () => this.buildQuoteMatrix())
    })
  }

  // ── Step 4: Prepare client quote ───────────────────────────────────────
  private doPrepareClientQuote() {
    const t = setClock('14:25')
    this.formalTransition('prepareClientQuote', {
      time: t,
      truth: {
        waitingOn: null,
        nextAction: 'RM 复核客户报价卡并与客户沟通',
        alerts: this.state.truth.alerts.filter((alert) => alert.id !== 'al-bnp'),
      },
    })
    const matrix = this.latestMatrix()
    const ms = matrix?.data.type === 'quoteMatrix' ? matrix.data.quotes.find((q) => q.best) : null
    const bnpQ = matrix?.data.type === 'quoteMatrix' ? matrix.data.quotes.find((q) => q.issuer === 'BNP') : null
    const coupon = ms?.coupon ?? 10.62
    const ki = this.approvedKI()
    this.runProcessing(['正在生成面向客户的报价表述...', '正在整理风险披露要点...'], 850, () => {
      const ct = setClock('14:26')
      this.pushArtifactItem({
        id: 'art-cq',
        title: 'Client Quote Card',
        titleZh: '客户报价卡',
        status: 'PENDING REVIEW',
        version: 1,
        createdAt: ct,
        data: {
          type: 'clientQuote',
          issuer: 'Morgan Stanley',
          terms: [
            { label: 'Product', value: 'FCN · Tencent (0700.HK) · 6M' },
            { label: 'Notional', value: 'USD 1,000,000' },
            { label: 'Coupon', value: `${coupon.toFixed(2)}% p.a. · 月付` },
            { label: 'Strike', value: '80%' },
            { label: 'Knock-In', value: ki },
            { label: 'Autocall', value: '月度观察 · 自第 2 月起' },
          ],
          summary:
            `以腾讯为标的的 6 个月固定派息票据：年化收益 ${coupon.toFixed(2)}%，按月支付。只要腾讯期间不跌破期初价的 ${ki}，到期收回全部本金及票息。`,
          riskSummary:
            `若腾讯曾跌破 ${ki}（KI）且到期低于 80%（Strike），将按 80% 的价格接入腾讯股票，可能产生本金损失。本产品不保本。`,
          validityUntil: ms?.expiresAt ?? Date.now() + 300 * 1000,
          internalNote: `MS 为最优可比报价；BNP（${bnpQ?.coupon?.toFixed(2) ?? '10.85'}% / KI ${bnpQ?.ki ?? '—'}）条款不可比，未采用。客户票息为扣除分销价差后的对客水平（价差登记与复核口径待与交易台确认）。`,
        },
      })
      const m = this.latestMatrix()
      if (m) this.updateArtifact(m.id, { status: 'STALE' })
      this.addChange('客户报价卡已生成（MS）', ct)
      this.addAudit({
        time: ct,
        actor: 'AI Copilot',
        actorRole: 'AI',
        action: '已起草 Client Quote Card（基于 MS 最优可比报价）',
        priorState: 'CLIENT_QUOTE_READY',
        newState: 'CLIENT_QUOTE_READY',
      })
    })
  }

  // ── Step 5: Send to client & client reply ──────────────────────────────
  private doSendClientQuote() {
    const t = setClock('14:27')
    this.updateArtifact('art-cq', { status: 'SENT', approvedMeta: `Alice · RM · ${t} 已与客户沟通` })
    this.systemEvent('send', '客户报价已发送给客户', `Alice · RM · ${t}`)
    this.formalTransition('sendClientQuote', {
      time: t,
      truth: {
        currentOwner: PEOPLE.rm,
        waitingOn: '客户 Mr. Chan',
        nextAction: '等待客户回复；AI 将识别潜在客户指令',
      },
    })
    this.addChange('报价已发客户', t)
    this.later(2600, () => {
      const rt = setClock('14:36')
      this.push({ kind: 'human', id: uid('tl'), author: PEOPLE.rm, time: rt, text: CLIENT_REPLY, quote: true })
      this.patchTruth({ status: 'CLIENT_RESPONSE_RECEIVED', statusLabel: '收到客户回复', statusTone: 'warning', waitingOn: null })
      this.runProcessing(['AI 识别到一条可能的客户指令...', '正在结构化指令内容...'], 850, () => {
        const ct = setClock('14:37')
        this.pushArtifactItem({
          id: 'art-inst',
          title: 'Client Instruction Card',
          titleZh: '客户指令卡',
          status: 'PENDING CONFIRMATION',
          version: 1,
          createdAt: ct,
          data: {
            type: 'instruction',
            intent: '执行确认 · Proceed to execute',
            summary: 'AI 识别到一条可能的客户指令：按 Morgan Stanley 报价条款执行 USD 1,000,000，今日内完成。请 RM 复核确认。',
            terms: [
              { label: 'Issuer', value: 'Morgan Stanley' },
              { label: 'Product', value: 'FCN · 0700.HK · 6M' },
              { label: 'Notional', value: 'USD 1,000,000' },
              { label: 'Strike / KI', value: `80% / ${this.approvedKI()}` },
              { label: 'Timing', value: '今日内执行' },
              { label: 'Confirmation Record', value: '电话录音 rec-20260525-1436 已归档 · 邮件存档' },
            ],
            confidence: 'High · 92%',
            sourceRef: 'Alice 转述客户消息 · 14:36 · 电话录音已归档',
          },
        })
        this.patchTruth({
          status: 'CLIENT_INSTRUCTION_PENDING_CONFIRMATION',
          statusLabel: '客户指令待确认',
          statusTone: 'warning',
          nextAction: 'RM 复核并确认正式客户指令',
        })
        this.addAudit({
          time: ct,
          actor: 'AI Copilot',
          actorRole: 'AI',
          action: '已识别潜在客户指令（Pending Confirmation，置信度 92%）',
          priorState: 'CLIENT_RESPONSE_RECEIVED',
          newState: 'CLIENT_INSTRUCTION_PENDING_CONFIRMATION',
        })
      })
    })
  }

  private doRejectInstruction() {
    const t = tick(1)
    this.updateArtifact('art-inst', { status: 'STALE', approvedMeta: `Alice · RM · ${t} 驳回 AI 识别结果` })
    this.systemEvent('arrow', 'RM 驳回了 AI 识别的指令，继续等待客户明确指令', `Alice · RM · ${t}`, 'warning')
    this.formalTransition('rejectInstruction', {
      time: t,
      truth: {
        waitingOn: '客户 Mr. Chan',
        nextAction: '等待客户明确指令后重新识别',
      },
    })
    // Client replies again shortly so demo can proceed.
    this.later(2400, () => {
      const rt = tick(2)
      this.push({
        kind: 'human',
        id: uid('tl'),
        author: PEOPLE.rm,
        time: rt,
        text: '客户再次确认：就按 MS 条款执行 USD 1m，请尽快。',
        quote: true,
      })
      this.runProcessing(['AI 重新识别客户指令...'], 800, () => {
        const ct = tick(1)
        this.updateArtifact('art-inst', { status: 'PENDING CONFIRMATION', version: 2, approvedMeta: undefined, createdAt: ct })
        this.push({ kind: 'artifact', id: uid('tl'), artifactId: 'art-inst', time: ct })
        this.set({ focusArtifactId: 'art-inst' })
        this.patchTruth({
          status: 'CLIENT_INSTRUCTION_PENDING_CONFIRMATION',
          statusLabel: '客户指令待确认',
          statusTone: 'warning',
          waitingOn: null,
          nextAction: 'RM 复核并确认正式客户指令',
        })
      })
    })
  }

  // ── Step 6: Confirm instruction → freshness fail → live requote ───────
  private doConfirmInstruction() {
    const t = setClock('14:38')
    this.updateArtifact('art-inst', { status: 'CONFIRMED', approvedMeta: `Alice · RM · ${t} 确认为正式客户指令` })
    this.systemEvent('check', '客户指令已确认', `Alice · RM · ${t} · 交给 Ken · Dealer 执行`, 'success')
    this.formalTransition('confirmInstruction', {
      time: t,
      truth: {
        waitingOn: null,
        nextAction: '执行前检查报价时效',
      },
    })
    this.addChange('客户指令 Confirmed', `Alice · RM · ${t}`)
    // Force the MS quote & client quote validity to expired for the scripted freshness failure.
    const cq = this.state.artifacts['art-cq']
    if (cq?.data.type === 'clientQuote') {
      this.updateArtifact('art-cq', { data: { ...cq.data, validityUntil: Date.now() - 1000 } })
    }
    this.later(700, () => {
      this.runProcessing(['正在检查 MS 报价时效...'], 900, () => {
        const ft = fmtClock()
        this.updateArtifact('art-cq', { status: 'EXPIRED' })
        this.systemEvent('alert', 'MS 报价已超过有效期（05:00），需要实时重报', `AI 时效检查 · ${ft}`, 'warning')
        this.push({
          kind: 'action',
          id: 'act-live-requote',
          title: '执行前检查未通过：报价已过期',
          detail: '客户确认时 MS 报价已超过有效期。执行前必须向 Morgan Stanley 请求实时最终价格，不能按过期价格成交。',
          actionKey: 'requestLiveRequote',
          actionLabel: '请求实时重报',
          allowed: FCN_WORKFLOW.requestLiveRequote.allowedRoles,
          time: ft,
          done: false,
        })
        this.addAudit({
          time: ft,
          actor: 'AI Copilot',
          actorRole: 'AI',
          action: '已标记报价过期：MS 报价超出 validity 窗口',
          priorState: 'CLIENT_INSTRUCTION_CONFIRMED',
          newState: 'LIVE_REQUOTE_REQUIRED',
        })
        this.patchTruth({
          status: 'LIVE_REQUOTE_REQUIRED',
          statusLabel: '需要实时重报',
          statusTone: 'warning',
          nextAction: 'Dealer 向 MS 请求最终价格',
          alerts: [
            {
              id: 'al-expired',
              severity: 'critical',
              title: '报价已过期',
              detail: '客户确认时 MS 报价已超过有效期。执行前必须获取最终价格，不能按过期价格成交。',
              owner: 'Dealer',
              actions: ['请求实时报价'],
            },
            ...this.state.truth.alerts.filter((x) => x.id !== 'al-expired' && x.id !== 'al-bnp'),
          ],
        })
      })
    })
  }

  private doRequestLiveRequote() {
    const t = setClock('14:39')
    this.set({
      timeline: this.state.timeline.map((i) =>
        i.kind === 'action' && i.id === 'act-live-requote' ? { ...i, done: true, doneMeta: `Ken · Dealer · ${t} 已请求` } : i,
      ),
    })
    this.systemEvent('send', '已向 Morgan Stanley 请求实时最终价格', `Ken · Dealer · ${t}`)
    this.formalTransition('requestLiveRequote', {
      time: t,
      truth: { waitingOn: 'Morgan Stanley', nextAction: '等待 MS 返回最终价格' },
    })
    this.later(2000, () => {
      const rt = setClock('14:41')
      this.systemEvent('arrow', 'MS 返回最终价格：Coupon 10.15% · 有效期 10 分钟', rt, 'success')
      this.runProcessing(['正在更新执行单草稿...'], 750, () => {
        const ct = fmtClock()
        this.pushArtifactItem({
          id: 'art-ticket',
          title: 'Execution Ticket',
          titleZh: '执行单',
          status: 'DRAFT',
          version: 1,
          createdAt: ct,
          data: {
            type: 'executionTicket',
            fields: [
              { label: 'Issuer', value: 'Morgan Stanley' },
              { label: 'Underlying', value: 'Tencent / 0700.HK' },
              { label: 'Notional', value: 'USD 1,000,000' },
              { label: 'Tenor', value: '6M' },
              { label: 'Strike', value: '80%' },
              { label: 'Knock-In', value: this.approvedKI() },
              { label: 'Coupon (Final)', value: '10.15% p.a.' },
              { label: 'Settlement', value: 'T+2' },
            ],
            quoteTime: `${rt} HKT`,
            validityUntil: Date.now() + 600 * 1000,
            note: '最终价格 10.15% 低于此前 10.62% 报价（市场移动）。已对齐已确认客户指令条款。',
          },
        })
        this.patchTruth({
          status: 'EXECUTION_READY',
          statusLabel: '待执行',
          statusTone: 'warning',
          waitingOn: null,
          nextAction: 'Dealer 复核执行单并确认执行',
          alerts: this.state.truth.alerts.filter((x) => x.id !== 'al-expired'),
        })
        this.addChange('MS 最终价 10.15%', rt)
        this.addAudit({
          time: ct,
          actor: 'AI Copilot',
          actorRole: 'AI',
          action: '已起草 Execution Ticket（最终价 10.15%）',
          priorState: 'LIVE_REQUOTE_REQUIRED',
          newState: 'EXECUTION_READY',
        })
      })
    })
  }

  // ── Step 7: Execute ────────────────────────────────────────────────────
  private doExecuteTrade() {
    const t = setClock('14:43')
    this.updateArtifact('art-ticket', { status: 'EXECUTED', approvedMeta: `Ken · Dealer · ${t} 确认并执行` })
    this.systemEvent('check', '交易已执行：MS · FCN 0700.HK · USD 1M · Coupon 10.15%', `Ken · Dealer · ${t}`, 'success')
    this.formalTransition('executeTrade', {
      time: t,
      truth: {
        waitingOn: 'Morgan Stanley（条款书）',
        nextAction: '等待发行商条款书并校验',
      },
    })
    this.pushContextBrief(
      PEOPLE.ops,
      'Post-trade validation · 条款书核对',
      [`Ken 已于 ${t} 执行交易：MS · Tencent FCN · USD 1,000,000 · Coupon 10.15%。收到最终条款书后需要与执行单逐字段核对。`],
      [{ label: 'Execution Ticket · 执行单', artifactId: 'art-ticket' }],
      '核对最终条款书，处理差异并完成归档前确认',
    )
    this.addChange('已执行 @ 10.15%', `Ken · Dealer · ${t}`)
    this.later(2200, () => {
      const rt = setClock('14:52')
      this.systemEvent('arrow', '已收到 Morgan Stanley Final Termsheet', rt)
      this.runProcessing(['正在逐字段比对执行单 vs 条款书...', '正在标记差异...'], 900, () => {
        const ct = setClock('14:53')
        this.pushArtifactItem({
          id: 'art-tv',
          title: 'Termsheet Validation',
          titleZh: '条款书验证',
          status: 'PENDING APPROVAL',
          version: 1,
          createdAt: ct,
          data: {
            type: 'termsheetValidation',
            // 比对字段清单来自 fcn-pack schema（TS_VALIDATION_FIELDS），值为本单叙事数据
            rows: (() => {
              const v: Record<string, { ticket: string; termsheet: string; status: 'match' | 'warning' | 'mismatch' }> = {
                'Notional': { ticket: 'USD 1,000,000', termsheet: 'USD 1,000,000', status: 'match' },
                'Underlying': { ticket: '0700.HK', termsheet: '0700.HK', status: 'match' },
                'Strike': { ticket: '80%', termsheet: '80%', status: 'match' },
                'Knock-In': { ticket: this.approvedKI(), termsheet: this.approvedKI(), status: 'match' },
                'Coupon': { ticket: '10.15%', termsheet: '10.15%', status: 'match' },
                'Settlement': { ticket: 'T+2', termsheet: 'T+3', status: 'warning' },
              }
              return TS_VALIDATION_FIELDS.map((field) => ({ field, ...v[field] }))
            })(),
            overall: '1 项差异待人工判断',
            recommended: 'AI 标记：Settlement T+2 ≠ T+3。建议与 MS 核实后再审批，或提出异常。',
          },
        })
        this.patchTruth({
          status: 'TERMSHEET_REVIEW',
          statusLabel: '条款书待审批',
          statusTone: 'warning',
          waitingOn: null,
          nextAction: '簿记 / 核对审批条款书或提出异常',
          alerts: [
            {
              id: 'al-ts',
              severity: 'warning',
              title: 'Termsheet 差异',
              detail: 'Settlement：执行单 T+2，条款书 T+3。需与 MS 核实以确认哪一方正确。',
              owner: '簿记 / 核对',
              actions: ['提出异常', '核实后审批'],
            },
            ...this.state.truth.alerts,
          ],
        })
        this.addAudit({
          time: ct,
          actor: 'AI Copilot',
          actorRole: 'AI',
          action: '已校验 Termsheet：5 项一致，1 项差异（Settlement）',
          priorState: 'EXECUTED',
          newState: 'TERMSHEET_REVIEW',
        })
      })
    })
  }

  // ── Step 8: Termsheet approval / exception ─────────────────────────────
  private doRaiseException() {
    const t = setClock('14:55')
    this.updateArtifact('art-tv', { status: 'EXCEPTION' })
    this.systemEvent('flag', '已提出异常：Settlement 差异（T+2 vs T+3）', `Mia · 簿记 / 核对 · ${t}`, 'critical')
    this.formalTransition('raiseException', {
      time: t,
      truth: {
      stageException: true,
      nextAction: '与 MS 核实结算日；核实后可返回条款书审批',
      alerts: [
        {
          id: 'al-exc',
          severity: 'critical',
          title: 'Exception：Settlement 差异',
          detail: '解决路径：联系 MS 确认正确结算日 → 核实结果回填 → 簿记 / 核对重新审批条款书。',
          owner: '簿记 / 核对',
          actions: ['已与 MS 核实'],
        },
        ...this.state.truth.alerts.filter((x) => x.id !== 'al-ts'),
      ],
      },
    })
    this.addChange('Exception raised', `Mia · ${t}`)
  }

  private doResolveException() {
    const t = setClock('14:58')
    const tv = this.state.artifacts['art-tv']
    if (tv?.data.type === 'termsheetValidation') {
      this.updateArtifact('art-tv', {
        status: 'PENDING APPROVAL',
        version: tv.version + 1,
        data: {
          ...tv.data,
          rows: tv.data.rows.map((r) => (r.field === 'Settlement' ? { ...r, termsheet: 'T+2（MS 已更正）', status: 'match' as const } : r)),
          overall: '全部一致',
          recommended: 'MS 确认条款书笔误，已重发更正版（T+2）。可以审批。',
        },
      })
    }
    this.systemEvent('check', '已与 MS 核实：T+2 正确，条款书已更正重发', `Mia · 簿记 / 核对 · ${t}`, 'success')
    this.formalTransition('resolveException', {
      time: t,
      truth: {
        stageException: false,
        nextAction: '簿记 / 核对审批更正后的条款书',
        alerts: this.state.truth.alerts.filter((x) => x.id !== 'al-exc'),
      },
    })
  }

  private doApproveTermsheet() {
    const t = setClock('15:00')
    this.updateArtifact('art-tv', { status: 'APPROVED', approvedMeta: `Mia · 簿记 / 核对 · ${t} 审批` })
    this.systemEvent('check', `Termsheet 已审批（${POLICIES.segregation.passZh}）`, `Mia · 簿记 / 核对 · ${t}`, 'success')
    this.formalTransition('approveTermsheet', {
      time: t,
      truth: {
        stageException: false,
        waitingOn: null,
        nextAction: '无 · Case 已完成',
        alerts: [],
      },
    })
    const t2 = tick(1)
    this.systemEvent('check', '归档材料齐备：客户指令（邮件+录音）· 执行单 · 发行商 Final Termsheet · 核对记录', `AI 归档完整性检查 · ${t2}`, 'success')
    const t3 = tick(1)
    this.systemEvent('send', '交易确认书已生成并发送客户 Mr. Chan · Case 完成', `Alice · RM · ${t3}`, 'success')
    this.addAudit({
      time: t3,
      actor: 'Alice',
      actorRole: 'RM · 客户经理',
      action: '交易确认书已发送客户（AI 起草 · RM 确认发送）',
      priorState: 'COMPLETED',
      newState: 'COMPLETED',
    })
    this.set({
      archivedCaseIds: this.state.archivedCaseIds.includes('SP-001')
        ? this.state.archivedCaseIds
        : [...this.state.archivedCaseIds, 'SP-001'],
      pinnedCaseIds: this.state.pinnedCaseIds.filter((id) => id !== 'SP-001'),
    })
    this.addChange('Case Completed', t)
  }
}

export const store = new Store()

// Dev-only probe for driving/inspecting the demo from the console.
if (import.meta.env.DEV) {
  ;(window as unknown as { __sp: Store }).__sp = store
}
