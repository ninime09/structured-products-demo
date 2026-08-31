import { INVITABLE, PEOPLE } from './data'
import { FCN_WORKFLOW } from './config/fcn-pack/workflow'
import { NEED_BRIEF_SCHEMA, TS_VALIDATION_FIELDS } from './config/fcn-pack/schemas'
import { exposureIfKnockedIn, exposureRatio, pct } from './config/mock-data/clients'
import type { ClientRecord } from './config/mock-data/clients'
import { issuerCoverage } from './config/mock-data/catalog'
import type { UnderlyingSpec } from './config/mock-data/catalog'
import { MARKET_SNAPSHOT, couponRange, indicativeCoupon } from './config/mock-data/market'
import { readDataPlane } from './config/mock-data/planes'
import { applySpecialistRevision, diffProposal, renderProposal, validateProposal } from './config/fcn-pack/proposal'
import { generateProposal } from './ai/proposal-agent'
import { extractNeedUpdates } from './ai/need-agent'
import { generateStructure } from './ai/structure-agent'
import { decideReply, rewriteClientEmail } from './ai/reply-agent'
import { buildNeedFields } from './config/fcn-pack/need-view'
import type { ContextSource } from './ai/context'
import { getAiMode } from './ai/gateway'
import type { ReplyAction } from './ai/reply-agent'
import { removeVariant, renderStructureDraft, toStructureOptions } from './config/fcn-pack/structure-draft'
import type { StructureDraft } from './config/fcn-pack/structure-draft'
import type { DirectionProposal } from './config/fcn-pack/proposal'
import { POLICIES } from './config/fcn-pack/policies'
import { SPREAD_MODES, SPREAD_POLICY, clientCoupon, realisedBp, spreadBreached } from './config/fcn-pack/spread-policy'
import type {
  AppNotification,
  Artifact,
  AuditEvent,
  CaseTruth,
  DrawerState,
  NeedFieldUpdate,
  Participant,
  PendingConfirm,
  Person,
  PrivateMsg,
  Quote,
  LanguageKey,
  RoleKey,
  TermRow,
  TermsheetRow,
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
  /** 需求已在共创中收敛（标的与流动性都定下来了） */
  needSettled: boolean
  /**
   * 讨论里长出来的需求字段。
   * agent 只能提议（proposed），落到卡上必须人点确认——需求字段驱动后面
   * 所有产物，不能让模型自己写进去。
   */
  needFieldUpdates: NeedFieldUpdate[]
  /** 交易要素初稿（结构化）——渲染、改稿、发布产物都以它为准 */
  structureDraft: StructureDraft
  structureSource: 'live' | 'script' | 'fallback'
  /** 产品专家已修改 agent 初稿（记录的是他改了什么，不是"他点了同意"） */
  specialistDraftRevised: boolean
  /** 产品专家已确认并发布方向建议到交易室 */
  specialistProposalPublished: boolean
  /** RM 已就方向建议提出不同看法（双向协商的第二个回合） */
  rmPushedBack: boolean
  /** 产品专家已修改 agent 的交易要素初稿 */
  tradeTermsRevised: boolean
  requoteRound: number
  /** 报价用哪条渠道给客户：邮件（本身即留痕）或电话（要补录音转写） */
  clientChannel: 'email' | 'phone' | null
  /** 本轮同时询价的结构变体 */
  pricedVariants: PricedVariant[]
  /** 当前基线方向建议（脚本版或模型生成版）——改稿的 diff 基准 */
  baseProposal: DirectionProposal
  /** 初稿是谁给的：真模型 / 脚本 / 想真调但回退了 */
  proposalSource: 'live' | 'script' | 'fallback'
  privateOpen: boolean
  privateChats: Record<RoleKey, PrivateMsg[]>
  pendingDraftId: string | null
  dragging: { kind: 'artifact' | 'draft'; id: string } | null
  invited: { person: Person; joinedAt: string }[]
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
// 客户给的是收益范围 / 风险承受 / 期限 / 方向，不指定具体标的与结构——
// 标的与结构要靠 RM + 产品专家与客户来回讨论才收敛（访谈 2026-08-24）。
const CLIENT_MSG =
  '收到 Mr. Chan 邮件：计划配置约 USD 1m，期限 6 个月左右，希望年化收益 10% 以上，能接受中等程度的下行风险。看好中国互联网科技板块，但没有指定具体标的，让我们给产品建议。'

// RM 在交易室 @ 产品专家：这才是需求共创的自然入口（两人同办公室，问一句就是了）。
const CONSULT_MSG = '@David 客户只给了方向和收益区间，没定标的也没说结构。你看这个诉求能怎么做？'

// ── 以下内容全部由数据面算出，不再写死 ───────────────────────────────
// 技能 structure-comparator 按 manifest 授权读取；删掉它的 reads 声明，
// 对应那段推导就会消失。
const SKILL = 'structure-comparator'
const NOTIONAL_HKD = 7_800_000 // USD 1m 折港币，用于集中度测算

const client = readDataPlane(SKILL, 'crm.client_profile') as ClientRecord
const holdings = readDataPlane(SKILL, 'crm.holdings') as ClientRecord['holdings']
const catalog = readDataPlane(SKILL, 'catalog.products') as { underlyings: UnderlyingSpec[] }
// 指示性定价同样受 manifest 授权：未声明 market.snapshot 这里就会抛错
readDataPlane(SKILL, 'market.snapshot')

const TENCENT_NOW = pct(exposureRatio('0700.HK'))
const KI_EXPOSURE = pct(exposureIfKnockedIn('0700.HK', NOTIONAL_HKD))
const CAP = pct(holdings.singleNameCap)
const POOL = catalog.underlyings.filter((u) => u.themes.includes('china-internet')).map((u) => u.code)
const POOL_LABEL = POOL.join(' / ')

const rng = (u: string[], ki: number) => couponRange({ underlyings: u, ki })
const cov = (u: string[]) => `${issuerCoverage(u).length} 家可报（${issuerCoverage(u).join(' · ')}）`

const histLine = (t: ClientRecord['history'][number]) =>
  `· ${t.date} ${t.product} / ${t.underlying} / KI ${t.ki} —— ${t.outcome}`

// 产品专家 agent 的初稿：现在是**结构化对象**，正文由 renderProposal 渲染。
// 接模型后模型产出的就是这个对象（schema 约束），不是散文——
// 这样审计能记确定的 diff，约束也丢不掉。
const BASE_PROPOSAL: DirectionProposal = {
  version: 1,
  clientStated: 'USD 1m · 约 6M · 目标 10%+ · 中等风险且不接受全损 · 看好中国互联网科技',
  inferred: `标的范围 = 港股互联网科技（${POOL_LABEL}）`,
  evidenceHoldings: [
    `腾讯 0700.HK 现持仓 HKD ${(holdings.positions[0].marketValue / 1e6).toFixed(1)}m，占组合 ${TENCENT_NOW}`,
    `若本笔 USD 1m（≈HKD 7.8m）全额敲入接股，腾讯敞口将到 ${KI_EXPOSURE}，逼近本行单一标的上限 ${CAP}`,
    '→ 单一标的可行但已接近上限；最差表现型可能接到阿里而非腾讯，反而缓解集中度',
  ],
  evidenceProfile: [
    ...client.history.map(histLine).map((l) => l.replace(/^· /, '')),
    ...client.declined.map((d) => `${d.date} 拒绝 ${d.what}（${d.reason}）`),
    '→ 能接受接货，但缓冲薄的方案他会拒',
  ],
  directions: [
    { id: 'dir-single', label: '腾讯单一标的 FCN', underlyings: ['0700.HK'], ki: 70, meetsTarget: true, note: '集中度逼近上限' },
    { id: 'dir-worst', label: '腾讯 + 阿里最差表现型', underlyings: ['0700.HK', '9988.HK'], ki: 65, meetsTarget: true, note: '票息明显更高，但任一标的敲入都算敲入，敲入概率高于单一标的' },
    { id: 'dir-index', label: '恒生科技指数挂钩票据', underlyings: ['HSTECH'], ki: 75, meetsTarget: false, note: '波动率低，达不到 10% 目标' },
  ],
  constraints: {
    concentrationCap: holdings.singleNameCap * 100,
    currentExposure: exposureRatio('0700.HK') * 100,
    exposureIfKnockedIn: exposureIfKnockedIn('0700.HK', NOTIONAL_HKD) * 100,
    targetYield: 10,
    riskTolerance: '中等 · 不接受全损',
  },
  pricingAsOf: MARKET_SNAPSHOT.asOf,
}


// v3：按 Alice 的意见把 70% 一档加回来——缓冲厚薄是客户的风险偏好，不该替他定
const V3_PROPOSAL: DirectionProposal = {
  ...applySpecialistRevision(BASE_PROPOSAL),
  version: 3,
  directions: [
    { id: 'dir-single', label: '腾讯单一标的 FCN', underlyings: ['0700.HK'], ki: 65, meetsTarget: true, note: '缓冲厚，优先推荐' },
    { id: 'dir-single-70', label: '腾讯单一标的 FCN（薄缓冲）', underlyings: ['0700.HK'], ki: 70, meetsTarget: true, note: '票息更高，但客户 2025-09 就是在这一档敲入的——对客说明里要讲清楚' },
    { id: 'dir-worst', label: '腾讯 + 阿里最差表现型', underlyings: ['0700.HK', '9988.HK'], ki: 65, meetsTarget: true, note: '票息最高但敲入概率也最高，与客户中等风险承受不符，列末位' },
  ],
  revisionNote: '按 Alice 的意见保留 70% 一档：缓冲厚薄是客户的风险偏好，不该由我们替他定',
}

const SPECIALIST_DRAFT = renderProposal(BASE_PROPOSAL)

// RM 的反驳：依据是客户关系知识，不是产品知识——这是 RM 不可替代的地方。
const RM_PUSHBACK =
  `集中度这条我同意，②的 ${rng(['0700.HK', '9988.HK'], 65)} 我也同意别放首选——他一看到就想要，真敲入接到阿里他不会开心。` +
  '但①压到 65% 之后票息就在 10% 出头了，Mr. Chan 对收益比较敏感，我怕他嫌低。' +
  '能不能 65% 和 70% 两档都给他，让他自己选缓冲厚薄？接货他是能接受的。'

// v3：不替客户做决定，把选择权交回去——这也回答了"标的是谁决定的"。
// 对客版本：同一份内容、不同受众——内部指示价、持仓与风控参数整段摘除。
const CLIENT_BRIEF =
  '给 Mr. Chan 的方向说明（待确认，非报价）：\n\n' +
  '按您说的想法，我们先看港股互联网科技这个方向，期限 6 个月，都是不保本结构：\n' +
  '① 挂钩腾讯单一标的：缓冲有 65% 和 70% 两档可选。只要腾讯期间不跌破期初价的这个水平，到期收回全部本金及票息；若曾跌破且到期低于行权价，将按行权价接入腾讯股票。\n' +
  '   （提示：您 2025 年 9 月那笔就是 70% 这一档，当时敲入接了股。）\n' +
  '② 挂钩腾讯 + 阿里（取表现较差者）：票息会明显更高，但两只里任何一只跌破缓冲都算触发，风险高于方案①。\n\n' +
  '票息水平要向发行商询价后才能确定，您确认方向后我们立即安排。\n' +
  '请您确认：倾向哪个标的方向、缓冲要 65% 还是 70%、以及能否接受持有至到期并接货。'

const CLIENT_DIRECTION_REPLY =
  '客户回复：就做腾讯单一标的吧，我知道自己腾讯拿得不少，但我看好它。两只的那个票息虽然高，我怕看错一只。' +
  '缓冲还是 65% 稳一点，上次 70% 敲进去了。接货没问题，钱 6 个月不用，可以持有到期。'

// agent 把已确认需求细化成交易要素：客户确认约束锁死，只在可调参数上给变体。

const CLIENT_NOTE_DRAFT =
  '和客户沟通口径：只要腾讯期间不跌破期初价的 70%，到期收回全部本金及票息；若曾跌破且到期低于 80%，将按 80% 接入股票。建议先确认客户理解下行情形，再报票息水平。'

const DEVIATION_DRAFT =
  '客户条款已完整（FCN · 6M · Strike 80% · KI 70%），建议跳过三方案对比，直接询价。'

const REPLY_ACTION_LABEL: Record<string, string> = {
  revise_direction: '修改方向初稿',
  revise_structure: '修改交易要素初稿',
  draft_client_note: '起草对客说明',
  revise_client_email: '修改对客报价邮件正文',
  propose_deviation: '起草流程偏离请求',
  answer: '回答',
}

const STAGE_LABEL: Record<string, string> = {
  need: '需求', structure: '结构', rfq: '询价', pricing: '定价',
  client: '客户', execution: '执行', termsheet: '条款书', done: '已完成',
}

/** 客户原始诉求——上下文装配里 client.email 那一块 */
const CLIENT_EMAIL_BRIEF =
  'USD 1,000,000 · 期限约 6 个月 · 目标年化 10% 以上 · 风险承受中等且不接受全损结构 ·\n'
  + '看好中国互联网科技板块，但未指定具体标的，请我们给产品建议。'

const SPECIALIST_CLOSE_MSG = '需求齐了，我按这个出结构方案。'

const DRAFT_AUDIT_NAME: Record<string, string> = {
  specialistProposal: '结构方向建议',
  tradeTerms: '交易要素',
  clientBrief: '对客方向说明',
  reply: '双署名回复',
  deviation: '流程偏离请求',
  roomMessage: '交易室消息',
}

const CLIENT_REPLY =
  '客户回复：我选不设赎回那个吧，我看好腾讯，要是涨回去就被提前赎回了反而可惜。' +
  'USD 1,000,000，请今天内帮我执行。'

/**
 * 需求摘要有三个阶段，对应两维模型里推导字段的三种状态：
 *  draft    —— 推导字段还没有值（待推导）
 *  proposed —— 产品专家已给出 working assumption，但客户没确认（内部假设，不可进 RFQ）
 *  settled  —— 客户已确认
 * 中间那个 proposed 态才是这套模型的意义所在：值有了，但还不能用。
 */
export type NeedPhase = 'draft' | 'proposed' | 'settled'

function needBriefArtifact(version: number, phase: NeedPhase): Artifact {
  const settled = phase === 'settled'
  const hasDerived = phase !== 'draft'
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
        // 客户明确表达
        { label: 'Notional', value: 'USD 1,000,000' },
        { label: 'Investment Horizon', value: '~6M' },
        { label: 'Target Yield', value: '>10% p.a.' },
        { label: 'Risk Tolerance', value: '中等 · 不接受全损结构' },
        { label: 'Directional View', value: '看好中国互联网科技' },
        { label: 'Liquidity Preference', value: settled ? '可持有到期 Hold to maturity' : '—' },
        // AI 推断
        { label: 'Asset Class Preference', value: '港股互联网科技（0700 / 9988 / 1810）' },
        // CRM 档案
        { label: 'Client Classification', value: '个人 PI · 可承受产品风险等级 C4' },
        // RM / 产品专家推导
        {
          label: 'Underlying',
          value: settled ? 'Tencent / 0700.HK · KI 65%' : hasDerived ? 'Tencent / 0700.HK（单一标的）' : '—',
        },
        {
          label: 'Concentration Constraint',
          value: settled
            ? `敞口 ${KI_EXPOSURE} < 上限 50%（客户知悉）`
            : hasDerived
              ? `敞口 ${KI_EXPOSURE} < 上限 50%`
              : '—',
        },
        { label: 'Delivery Willingness', value: settled ? '接受实物交割' : hasDerived ? '需接受实物交割' : '—' },
      ],
      missing: settled
        ? []
        : hasDerived
          ? ['Liquidity preference / 流动性偏好', '推导值待客户确认（标的 / 集中度 / 接货意愿）']
          : [
              'Underlying / 标的（待推导 + 客户确认）',
              'Concentration Constraint / 集中度约束（待读取持仓计算）',
              'Delivery Willingness / 接货意愿（FCN 必需要素）',
              'Liquidity preference / 流动性偏好',
            ],
      sourceRef: settled
        ? 'Mr. Chan 邮件 · 14:02 / CRM 档案 + 持仓 / 需求共创（Alice + David）· 14:05–14:13'
        : hasDerived
          ? 'Mr. Chan 邮件 · 14:02 / CRM 档案 + 持仓 / 产品专家推导（待客户确认）'
          : 'Mr. Chan 邮件 · 14:02',
    },
  }
}

// 客户在需求阶段确认过的要素——结构阶段锁死，三个变体共用。
// 客户确认的是他理解得了的东西；Strike / 观察方式 / 票息支付这些他理解不了，
// 由产品专家定（访谈：RM 不会拿十几个参数逐项问客户）。
const LOCKED_TERMS: TermRow[] = [
  { label: 'Underlying', value: 'Tencent / 0700.HK（单一标的）' },
  { label: 'Knock-In', value: '65%' },
  { label: 'Tenor', value: '6M' },
  { label: 'Notional', value: 'USD 1,000,000' },
  { label: 'Delivery', value: '接受实物交割接股' },
]

const LOCKED_KI = 65

/** 脚本版交易要素初稿——真模型不可用时的回退，也是结构 agent 的校验基线 */
const BASE_STRUCTURE_DRAFT: StructureDraft = {
  version: 1,
  locked: LOCKED_TERMS,
  underlyings: ['0700.HK'],
  ki: LOCKED_KI,
  variants: [
    {
      id: 'opt-a', label: '变体 A · 基准', strike: 80,
      autocall: '月度观察 · 自第 2 月起', payment: '月付',
      rationale: '参考条款：接股价为期初 80%，月度观察自第 2 月起，票息按月支付。',
      tradeoff: '基准变体',
      risks: ['跌破 KI 65% 后按 Strike 80% 接股', '提前赎回后票息中止'],
    },
    {
      id: 'opt-b', label: '变体 B · 接股价更高', strike: 85,
      autocall: '月度观察 · 自第 3 月起', payment: '到期一次付',
      rationale: 'Strike 提到 85%，票息更高；观察推迟到第 3 月，降低过早被赎回的概率。',
      tradeoff: '票息更高，但真接股时成本价是期初 85%（比基准贵）',
      risks: ['接股价高于基准，浮亏更大', '票息到期才付，中途无现金流'],
    },
    {
      id: 'opt-c', label: '变体 C · 不设赎回', strike: 80,
      autocall: '无 autocall', payment: '月付',
      rationale: '取消 autocall：票息更高，且不会因标的上涨被提前赎回，能拿满 6 个月。',
      tradeoff: '票息更高且期限确定，但没有提前了结的机会',
      risks: ['无提前赎回，资金锁定 6 个月', '标的大涨时收益封顶'],
    },
  ],
  suitability: { pass: true, note: 'FCN·R4 ≤ 客户可承受 C4，适当性预检通过；下单前会再次校验。' },
  pricingAsOf: MARKET_SNAPSHOT.asOf,
}


export interface PricedVariant {
  id: string
  label: string
  strike: string
  autocall: string
  payment: string
}

/**
 * 报价矩阵：每个结构变体 × 每家发行商。
 * 刻意保留三种真实的不完整：某家不回、某家条款不可比、某家不做某类结构——
 * 一维列表里"谁最优"一眼可见，二维矩阵里才需要归一化。
 */
function quoteSet(round: number, _nowMs: number, approvedKI: string, variants: PricedVariant[]): Quote[] {
  const bump = round * 0.04
  const bnpKI = approvedKI === '65%' ? '70%' : '65%'
  const out: Quote[] = []
  for (const v of variants) {
    const base = indicativeCoupon({
      underlyings: ['0700.HK'],
      ki: parseInt(approvedKI),
      strike: parseInt(v.strike),
      autocall: v.autocall,
    }).mid
    const mk = (
      issuer: string, delta: number | null, ki: string, _secs: number | null,
      comparable: boolean, statusLabel: string, differences: string[] = [],
    ): Quote => ({
      id: `q-${v.id}-${issuer.replace(/\s/g, '')}-r${round}`,
      variantId: v.id,
      variantLabel: v.label,
      issuer,
      coupon: delta === null ? null : +(base + delta + bump).toFixed(2),
      strike: v.strike,
      ki,
      tenor: '6M',
      // 报价当日有效，不是分钟级——不再挂秒级失效时间戳
      expiresAt: null,
      comparable,
      differences,
      statusLabel,
    })
    out.push(
      mk('Morgan Stanley', 0.32, approvedKI, 300, true, 'Comparable'),
      mk('JPM', 0.25, approvedKI, 272, true, 'Comparable'),
      mk('Goldman Sachs', 0.18, approvedKI, 250, true, 'Comparable'),
      mk('BNP', 0.55, bnpKI, 291, false, 'Different terms', [`KI ${bnpKI} ≠ approved ${approvedKI}`]),
      // UBS 只报有 autocall 的结构——不同发行商的产品覆盖本来就不一样
      v.autocall === '无 autocall'
        ? mk('UBS', null, '—', null, false, '不报该结构（无 autocall）')
        : mk('UBS', null, '—', null, false, '未回复'),
    )
  }
  // 每个变体的可比最优
  for (const v of variants) {
    const rows = out.filter((q) => q.variantId === v.id && q.comparable && q.coupon !== null)
    const best = rows.sort((a, b) => (b.coupon ?? 0) - (a.coupon ?? 0))[0]
    if (best) {
      best.best = true
      best.statusLabel = 'Best comparable'
    }
  }
  return out
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
      stage: 'need',
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
      caseName: 'Mr. Chan · 结构化需求',
      stage: 'need',
      stageException: false,
      status: 'CLIENT_NEED_DRAFT',
      statusLabel: '客户需求草稿',
      statusTone: 'neutral',
      currentOwner: PEOPLE.rm,
      waitingOn: null,
      nextAction: '标的与结构方向未定：请产品专家加入，与客户共同界定需求',
      approvedTerms: null,
      alerts: [
        {
          id: 'al-underlying',
          severity: 'warning',
          title: '标的与结构方向未定',
          detail: '客户只给了收益区间、期限、风险承受度和板块方向，没有指定标的，也没有指定结构。需要 RM 与产品专家一起与客户界定后才能确认需求。',
          owner: 'RM + 产品专家',
          actions: ['请产品专家加入'],
        },
        {
          id: 'al-missing',
          severity: 'warning',
          title: '客户信息缺失',
          detail: '缺少流动性偏好。可在与客户的共创回合中一并确认，或在确认时明确接受缺失项。',
          owner: 'RM',
          actions: ['与客户确认'],
        },
      ],
      recentChanges: [],
    },
    timeline,
    artifacts: { 'art-need': needBriefArtifact(1, 'draft') },
    audit: [
      {
        id: uid('au'),
        time: '14:03',
        actor: 'AI Copilot',
        actorRole: 'AI',
        action: '已起草 Client Need Brief v1（提取自 Mr. Chan 邮件 14:02；标的与流动性未定）',
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
    needSettled: false,
    needFieldUpdates: [],
    structureDraft: BASE_STRUCTURE_DRAFT,
    structureSource: 'script',
    specialistDraftRevised: false,
    specialistProposalPublished: false,
    rmPushedBack: false,
    tradeTermsRevised: false,
    requoteRound: 0,
    clientChannel: null,
    pricedVariants: [],
    baseProposal: BASE_PROPOSAL,
    proposalSource: 'script',
    privateOpen: false,
    privateChats: { rm: [], ps: [], dealer: [], ops: [] },
    pendingDraftId: null,
    dragging: null,
    invited: [],
  }
}

class Store {
  state: EngineState = initialState()
  private listeners = new Set<Listener>()
  private epoch = 0
  private timers: ReturnType<typeof setTimeout>[] = []
  /** 需求共创回合在途（跨越多个 later，needSettled 要到回合结束才置位） */
  private jointRoundRunning = false

  constructor() {
    setInterval(() => {
      // Advance the clock silently; only re-render when a countdown is on screen.
      this.state = { ...this.state, now: Date.now() }
      if (this.hasLiveCountdown()) this.listeners.forEach((l) => l())
    }, 1000)
  }

  private hasLiveCountdown(): boolean {
    // 现流程没有秒级时效：报价当日有效，执行前也不刷价。
    // 保留此方法与时钟以备将来，但不再触发每秒重渲染。
    return false
    /* eslint-disable no-unreachable */
    const active = new Set(['ACTIVE', 'PENDING REVIEW', 'PENDING CONFIRMATION', 'DRAFT', 'SENT'])
    return Object.values(this.state.artifacts).some((a) => {
      if (!active.has(a.status)) return false
      if (a.data.type === 'quoteMatrix') return a.data.quotes.some((q) => q.expiresAt !== null)
      if (a.data.type === 'clientQuote') return a.data.validityUntil !== null
      if (a.data.type === 'executionTicket') return a.data.validityUntil !== null
      return false
    })
    /* eslint-enable no-unreachable */
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
    // 聊天类条目自动打上所属阶段标记，供 RoomFeed 按阶段折叠
    if (item.kind === 'human' || item.kind === 'preAnalysis' || item.kind === 'system') {
      if (item.stage === undefined) item.stage = this.state.truth.stage
    }
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

  /** 客户报价卡上的选项数 */
  private clientQuoteOptionCount(): number {
    return this.clientQuoteOptions().length || 1
  }

  /** 已发给客户的选项列表（对客邮件、通话转写都要按它逐条复述） */
  private clientQuoteOptions() {
    const cq = this.state.artifacts['art-cq']
    return cq?.data.type === 'clientQuote' ? (cq.data.options ?? []) : []
  }

  /**
   * 客户选定的选项。客户回复里说"不设赎回那个"——这就是把 N 收窄到 1 的地方，
   * 也是唯一一处由客户而非内部角色做的结构选择。
   */
  private chosenOption() {
    const cq = this.state.artifacts['art-cq']
    if (cq?.data.type !== 'clientQuote') return null
    const opts = cq.data.options ?? []
    return opts.find((o) => o.label.includes('不设赎回')) ?? opts[0] ?? null
  }

  /** Current approved KI, single source of truth for downstream narrative. */
  private approvedKI(): string {
    return this.state.truth.approvedTerms?.find((t) => t.label === 'KI')?.value ?? '65%'
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
    /** 通知标题；共创邀请与正式交接的措辞不同 */
    notificationTitle?: string,
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
          title: notificationTitle ?? `${this.state.truth.caseId} · ${this.state.truth.caseName} 已交接给你`,
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
    icon: 'check' | 'arrow' | 'alert' | 'flag' | 'send' | 'mail',
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
    // @ 某人：内核给对方的 agent 派预处理任务（回执进公共层，预分析分层可见）。
    const mentionTarget = [...Object.values(PEOPLE), ...INVITABLE.map((c) => c.person)]
      .find((p) => body.includes('@' + p.name) && p.name !== author.name)
    if (mentionTarget) this.handleMention(author, mentionTarget, body)
    // 需求阶段的每一句讨论都可能定下某个字段——让书记员 agent 看一眼
    if (!mentionTarget) this.harvestNeedFields()
    // 对他人已发布产出的意见：不需要按钮，打一句话就行。
    // 识别谁在对谁的什么东西提意见 —— 这是接真模型后由意图分类承接的地方。
    const feedbackTarget = this.classifyFeedbackTarget(author, body)
    if (feedbackTarget) this.routeFeedbackToAuthor(author, feedbackTarget, body)
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
          this.push({ kind: 'system', id: uid('tl'), icon: 'flag', text: 'AI 起草了流程偏离卡：跳过结构对比，需产品专家确认', meta: `AI · ${ct}`, tone: 'warning', feed: true })
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
  /** @ 流程的预分析内容（演示用脚本；真实版由运行时层承接） */
  private preAnalysisText(question: string): string {
    // 需求阶段 @ 产品专家：agent 结合邮件 + 客户档案出结构方向初稿。
    // 这是本环节 AI 唯一不可替代的贡献——IC 自己想不起来客户的历史。
    if (this.state.truth.stage === 'need') return SPECIALIST_DRAFT
    if (/65|KI|敲入/i.test(question)) {
      return '初步分析（基于报价矩阵与批准结构）：KI 从 70% 压到 65% 约压低票息 25–35bp（参考方案 B 调整时 10.5% → 10.2%）；MS / JPM / GS 均可按 65% 报价。注意：需产品专家重新审批结构后才能正式询价。'
    }
    if (/BNP|不可比/i.test(question)) {
      return '初步分析：BNP 报价条款与批准结构不符（KI 差 5 个点），已被隔离在不可比区；若要采纳需退回结构重审，不能直接用于客户报价。'
    }
    return `初步分析：当前案例处于「${this.state.truth.statusLabel}」，下一步为 ${this.state.truth.nextAction}。我已整理相关产物与依赖，待你补充判断。`
  }

  /** @ 某人：回执进公共层；agent 预分析分层可见（仅提问者与被 @ 者）；
   *  预分析同时作为草稿进入被 @ 者私区，本人确认后以双署名发布。 */
  private handleMention(asker: Person, target: Person, question: string) {
    // 需求阶段 RM @ 产品专家 = 需求共创的入口。@ 即入场：参与事实立刻留痕，
    // 内容要等本人确认才留痕（两人同办公室，不存在"待接受"这一步）。
    if (
      target.role === 'ps' && asker.role === 'rm' &&
      this.state.truth.status === 'CLIENT_NEED_DRAFT' && !this.specialistJoined()
    ) {
      this.enterJointNeedDiscovery(asker, target, question)
    }
    const t = tick()
    this.push({ kind: 'system', id: uid('tl'), icon: 'send', text: `${target.name} 的 agent 正在预分析 · 待 ${target.name} 确认后回复`, meta: `${asker.name} @ ${target.name} · ${t}`, tone: 'neutral', feed: true })
    if (target.guest) {
      // 协作者是脚本化人格：延迟后直接以双署名回复（发言全员可见）
      this.later(1600, () => {
        this.push({ kind: 'human', id: uid('tl'), author: target, time: tick(), text: this.preAnalysisText(question), via: 'agent 预分析 · 本人确认' })
      })
      return
    }
    const needStage = this.state.truth.stage === 'need' && target.role === 'ps'
    if (needStage) return this.generateNeedProposal(asker, target, question)
    const analysis = this.preAnalysisText(question)
    this.later(1100, () => {
      const ct = tick()
      const paId = uid('pa')
      this.push({ kind: 'preAnalysis', id: paId, time: ct, asker: asker.role, target: target.role, targetName: target.name, text: analysis })
      // 草稿进被 @ 者私区，等本人确认发布
      // 初稿已经在交易室展示（提问者可见），私区不再复制一份——
      // 右侧是"产出新版本"的工作台，不是左侧的镜子。
      // 只有当你让它改、或它重新生成之后，右侧才会出现一张可编辑可拖出的卡。
      this.pushPrivate(target.role, {
        id: uid('pm'), who: 'agent', time: ct,
        text: `${asker.name} @ 了你：「${question.slice(0, 60)}」。我在交易室做了预分析（提问者已可见）。要调整就跟我说，我改完给你新版本。`,
      })
      this.set({
        notifications: [...this.state.notifications, {
          id: uid('ntf'), role: target.role, caseId: this.state.truth.caseId,
          title: `${asker.name} @ 了你`, body: question.slice(0, 50), time: ct, read: false,
        }],
      })
    })
  }

  /**
   * 需求阶段的方向初稿：真模型（可用时）或脚本。
   *
   * 模型只决定"提哪几个方向"；票息、敞口、发行商覆盖度全部由代码算，
   * 再由 renderProposal 渲染——同一份 schema 驱动模型输出与界面渲染。
   * 任何环节失败都静默回退脚本，现场看不出区别。
   */
  private generateNeedProposal(asker: Person, target: Person, question: string) {
    const traceId = uid('trace')
    // 已经给过一版吗？给过的话这次是改稿——不带上一版进去，
    // 「这个方案不行」就没有指代对象，模型只能从零再出一版一样的。
    const priorId = this.livePreAnalysisId(target.role)
    const prior = priorId
      ? this.state.timeline.find((i) => i.kind === 'preAnalysis' && i.id === priorId)
      : undefined
    const previous = prior?.kind === 'preAnalysis' ? prior.text : undefined

    this.push({
      kind: 'agentTrace',
      id: traceId,
      title: previous ? `${target.name} 的 agent 正在改稿` : `${target.name} 的 agent 正在处理`,
      owner: target.role,
      asker: asker.role,
      steps: [],
      done: false,
      stage: this.state.truth.stage,
    })

    void (async () => {
      const started = Date.now()
      const { proposal, source, ms, reason, rounds, toolCalls, slices } = await generateProposal(
        question,
        BASE_PROPOSAL,
        (steps) => this.patchTrace(traceId, { steps }),
        this.contextSource(target.role, previous),
      )
      this.patchTrace(traceId, {
        done: true,
        ms: ms ?? Date.now() - started,
        rounds,
        toolCalls,
        title: source === 'live' ? `${target.name} 的 agent · 已完成` : `${target.name} 的 agent · 脚本模式`,
      })

      const ct = tick()
      const paId = uid('pa')
      // 改稿要把上一版标成 superseded，否则两版并排挂着，不知道哪个算数
      this.set({
        baseProposal: proposal,
        proposalSource: source,
        timeline: priorId
          ? this.state.timeline.map((i) => (i.kind === 'preAnalysis' && i.id === priorId ? { ...i, superseded: true } : i))
          : this.state.timeline,
      })
      this.push({
        kind: 'preAnalysis', id: paId, time: ct,
        asker: asker.role, target: target.role, targetName: target.name,
        text: renderProposal(proposal), source,
      })
      this.addAudit({
        time: ct, actor: 'AI Copilot', actorRole: 'AI',
        action: previous
          ? `已按 ${asker.name} 的反馈改出结构方向建议 v${proposal.version}（${proposal.directions.length} 个方向）`
          : `已生成结构方向建议 v${proposal.version}（${proposal.directions.length} 个方向）`,
        detail:
          source === 'live'
            ? `agent 循环 ${rounds} 轮 · 调用工具 ${toolCalls} 次 · ${ms}ms；上下文装配：${slices ?? '—'}；票息与敞口由工具计算，模型不产出数值。`
            : source === 'fallback'
              ? `模型不可用，已回退脚本版：${reason ?? '未知原因'}`
              : '脚本模式',
        priorState: this.state.truth.status,
        newState: this.state.truth.status,
      })
      this.pushPrivate(target.role, {
        id: uid('pm'), who: 'agent', time: ct,
        text: `${asker.name} @ 了你：「${question.slice(0, 40)}」。我已在交易室出了一版方向初稿（${asker.name} 可见，但未经你确认不能转发给客户）。要改就在初稿上划词批注，或直接跟我说要改成什么——我改完在这里给你新版本。`,
      })
      this.set({
        notifications: [...this.state.notifications, {
          id: uid('ntf'), role: target.role, caseId: this.state.truth.caseId,
          title: `${asker.name} @ 了你`, body: question.slice(0, 50), time: ct, read: false,
        }],
      })
    })()
  }

  /**
   * 需求书记员：从交易室讨论里提字段更新。
   * 只提议，不落地——落地要人点「采纳」。同一时刻只跑一个，避免刷屏。
   */
  private harvestNeedFields() {
    if (this.state.truth.stage !== 'need' || this.state.needSettled) return
    if (!this.specialistJoined()) return // 共创还没开始，需求还只是邮件抽取
    if (this.harvesting) return
    const pendingKeys = new Set(this.state.needFieldUpdates.map((u) => u.key))

    const fields = NEED_BRIEF_SCHEMA.map((f) => ({
      key: f.key,
      label: f.labelZh,
      value: this.needFieldValue(f.key),
      // 已确认的、已经有待办提议的，都不再让它动
      settled: !f.pendingBeforeSettle || pendingKeys.has(f.key),
    }))
    if (fields.every((f) => f.settled)) return

    if (!this.state.timeline.some((i) => i.kind === 'human')) return

    this.harvesting = true
    void (async () => {
      try {
        const { updates, source } = await extractNeedUpdates(fields, this.contextSource(this.state.role))
        if (source !== 'live' || !updates.length) return
        const t = tick(0)
        const fresh = updates.filter((u) => !this.state.needFieldUpdates.some((x) => x.key === u.key))
        if (!fresh.length) return
        // 直接写入。把关点是阶段边界那次「确认客户需求」，不是每个字段一次点击——
        // 逐条确认会把摘要卡变成一堆待办，而且人工随时可以改。
        this.set({
          needFieldUpdates: [
            ...this.state.needFieldUpdates,
            ...fresh.map((u) => ({ ...u, id: uid('nfu'), time: t })),
          ],
        })
        const labels = fresh.map((u) => NEED_BRIEF_SCHEMA.find((f) => f.key === u.key)?.labelZh ?? u.key)
        this.addAudit({
          time: t, actor: 'AI Copilot', actorRole: 'AI',
          action: `从讨论写入需求字段：${labels.join('、')}`,
          detail: fresh.map((u) => `${NEED_BRIEF_SCHEMA.find((f) => f.key === u.key)?.labelZh ?? u.key} = ${u.value}（${u.source}）`).join('；')
            + '。由 AI 从交易室讨论中提取并直接写入；需求摘要整体仍须经「确认客户需求」由 RM 与产品专家共同确认后才能进入询价。',
          priorState: this.state.truth.status,
          newState: this.state.truth.status,
        })
        this.push({
          kind: 'system', id: uid('tl'), icon: 'check',
          text: `需求摘要已更新：${labels.join('、')}`,
          meta: `AI 书记员 · ${t}`, tone: 'neutral', feed: true,
        })
      } finally {
        this.harvesting = false
      }
    })()
  }

  private harvesting = false

  /** 卡上当前显示的取值——讨论写入的优先于 schema 默认 */
  needFieldValue(key: string): string {
    const live = this.state.needFieldUpdates.find((u) => u.key === key)
    if (live) return live.value
    const spec = NEED_BRIEF_SCHEMA.find((f) => f.key === key)
    if (!spec) return '—'
    if (spec.pendingBeforeSettle && !this.state.needSettled) {
      return spec.origin === 'derived' ? '待推导' : '客户未提及'
    }
    return spec.valueZh ?? '—'
  }

  /**
   * 人工改一个需求字段。
   * 这是自动写入的兜底：AI 写错了，本人直接改，不用先撤销再重填。
   */
  editNeedField(key: string, value: string) {
    const next = value.trim()
    if (!next) return
    const me = PEOPLE[this.state.role]
    const label = NEED_BRIEF_SCHEMA.find((f) => f.key === key)?.labelZh ?? key
    const prev = this.needFieldValue(key)
    if (next === prev) return
    const t = tick(0)
    const existing = this.state.needFieldUpdates.find((u) => u.key === key)
    const patch: NeedFieldUpdate = existing
      ? { ...existing, value: next, source: `${me.name} 手动修改`, edited: true, time: t }
      : { id: uid('nfu'), key, value: next, source: `${me.name} 手动填写`, rationale: '', time: t, edited: true }
    this.set({
      needFieldUpdates: existing
        ? this.state.needFieldUpdates.map((u) => (u.key === key ? patch : u))
        : [...this.state.needFieldUpdates, patch],
    })
    this.addAudit({
      time: t, actor: me.name, actorRole: me.roleLabel,
      action: `修改需求字段「${label}」`,
      detail: `${prev} → ${next}`,
      priorState: this.state.truth.status,
      newState: this.state.truth.status,
    })
  }

  /**
   * 上下文装配的唯一数据源。
   *
   * 四个 agent 都从这里取，所以它们在调用那一刻看到的是同一份现实——
   * 不存在谁拿着旧快照。加一块上下文只需在这里加一次，声明了的 agent 自动都能看见。
   */
  contextSource(role: RoleKey, priorVersion?: string): ContextSource {
    const s = this.state
    const need = s.artifacts['art-need']
    return {
      truth: {
        stageLabel: STAGE_LABEL[s.truth.stage] ?? s.truth.stage,
        statusLabel: s.truth.statusLabel,
        owner: s.truth.currentOwner ? `${s.truth.currentOwner.name} · ${s.truth.currentOwner.roleLabel}` : '—',
        nextAction: s.truth.nextAction,
        waitingOn: s.truth.waitingOn,
      },
      clientEmail: CLIENT_EMAIL_BRIEF,
      needFields: buildNeedFields({
        needSettled: s.needSettled,
        hasProposal: s.specialistProposalPublished,
        updates: s.needFieldUpdates,
        fields: need?.data.type === 'needBrief' ? need.data.fields : [],
        zh: true,
      }).map((f) => ({ label: f.label, value: f.value, source: f.source, open: f.open, origin: f.origin })),
      discussion: s.timeline
        .filter((i): i is Extract<TimelineItem, { kind: 'human' }> => i.kind === 'human')
        .slice(-8)
        .map((m) => ({ author: m.author.name, role: m.author.roleLabel, text: m.text })),
      artifacts: Object.values(s.artifacts).map((a) => ({
        title: a.titleZh, status: a.status, version: a.version,
        summary: a.data.type === 'structureProposal' ? `${a.data.options.length} 个变体` : '',
      })),
      pendingDrafts: s.privateChats[role]
        .filter((m) => m.draft && !m.draft.published)
        .map((m) => ({ label: DRAFT_AUDIT_NAME[m.draft!.kind] ?? m.draft!.kind, text: m.draft!.text })),
      priorVersion,
    }
  }

  private patchTrace(id: string, patch: Partial<Extract<TimelineItem, { kind: 'agentTrace' }>>) {
    this.set({
      timeline: this.state.timeline.map((t) => (t.kind === 'agentTrace' && t.id === id ? { ...t, ...patch } : t)),
    })
  }

  /** 拉同事加入协作：可参与讨论，不占正式审批角色，全程留痕 */
  invitePerson(name: string) {
    const c = INVITABLE.find((x) => x.person.name === name)
    if (!c || this.state.invited.some((i) => i.person.name === name)) return
    const t = tick()
    const host = PEOPLE[this.state.role]
    this.set({ invited: [...this.state.invited, { person: c.person, joinedAt: t }] })
    this.push({ kind: 'system', id: uid('tl'), icon: 'send', text: `${host.name} 拉 ${c.person.name} · ${c.person.roleLabel} 加入协作（可参与讨论，不占审批角色）`, meta: `${host.name} · ${t}`, tone: 'neutral', feed: true })
    this.addAudit({
      time: t,
      actor: host.name,
      actorRole: host.roleLabel,
      action: `邀请协作者 ${c.person.name}（${c.person.roleLabel}）加入交易室`,
      priorState: this.state.truth.status,
      newState: this.state.truth.status,
    })
    this.later(900, () => {
      this.push({ kind: 'human', id: uid('tl'), author: c.person, time: tick(), text: c.greeting })
    })
  }

  setDragging(d: { kind: 'artifact' | 'draft'; id: string } | null) {
    this.set({ dragging: d })
  }
  /** 拖拽版反向门：产物落入右侧投放区 → 拉入私区 */
  dropArtifactToPrivate(artifactId: string) {
    this.set({ dragging: null })
    this.pullIntoPrivate(artifactId)
  }
  /** 拖拽版正向门：草稿落入交易室投放区 → 弹发布确认（跨界仍须显式确认） */
  dropDraftToRoom(msgId: string) {
    this.set({ dragging: null })
    this.publishDraft(msgId)
  }

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
    const chat = this.state.privateChats[role]
    const last = chat[chat.length - 1]
    if (last?.quotedArtifactId === artifactId) return // 已在讨论中，避免重复拉入
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
  /**
   * 划词批注：从交易室的初稿上圈一段，写一句话发过去。
   * 批注本身是私区行为（不进公区、不进审计），但它带着原文片段——
   * agent 知道你在说哪一句，人也不用再复述一遍上下文。
   */
  annotateDraft(quote: string, comment: string) {
    const body = comment.trim()
    if (!body) return
    const role = this.state.role
    this.set({ privateOpen: true })
    this.pushPrivate(role, { id: uid('pm'), who: 'me', time: tick(), text: body, quotedText: quote })
    this.later(700, () => this.agentReply(role, body, quote))
  }

  /**
   * 私区应答。
   *
   * 先让 agent 判断意图；判断不出来（脚本模式 / 模型不可用 / 解析失败）就退回规则分支。
   * 关键分工：模型只选动作、只写话；改初稿、生成草稿卡仍由下面那几个确定性方法执行。
   * 「发布到交易室」不在可选动作里——那道正向门只能人点。
   */
  private agentReply(role: RoleKey, q: string, quotedText?: string) {
    void (async () => {
      const decided = await this.tryAgentReply(role, q, quotedText)
      if (!decided) this.scriptedReply(role, q, quotedText)
    })()
  }

  /** 此刻允许 agent 选的动作——由流程状态决定，不由模型自己声明 */
  private allowedReplyActions(role: RoleKey): ReplyAction[] {
    const out: ReplyAction[] = ['answer', 'draft_client_note']
    // 报价邮件还没发出去时，才谈得上改它
    if (role === 'rm' && this.state.privateChats.rm.some((m) => m.draft?.kind === 'clientQuoteEmail' && !m.draft.published)) {
      out.push('revise_client_email')
    }
    if (role === 'ps') {
      if (this.livePreAnalysisId('ps') && !this.state.specialistDraftRevised) out.push('revise_direction')
      const ttPending = this.state.privateChats.ps.some((m) => m.draft?.kind === 'tradeTerms' && !m.draft.published)
      if (ttPending && !this.state.tradeTermsRevised) out.push('revise_structure')
    }
    if (this.state.truth.status === 'STRUCTURE_REVIEW' && !this.state.artifacts['art-dev']) {
      out.push('propose_deviation')
    }
    return out
  }

  private async tryAgentReply(role: RoleKey, q: string, quotedText?: string): Promise<boolean> {
    if (getAiMode() !== 'live') return false
    const pending = this.state.privateChats[role].find((m) => m.draft && !m.draft.published)
    // 真模型要跑十几秒，先放一个占位气泡，别让人对着空白等
    const holdId = uid('pm')
    // 只留三个点：写「在想」是在替一个还没说话的东西配旁白，点本身就够了
    this.pushPrivate(role, { id: holdId, who: 'agent', time: tick(0), text: '', thinking: true })
    const drop = () => this.set({
      privateChats: { ...this.state.privateChats, [role]: this.state.privateChats[role].filter((m) => m.id !== holdId) },
    })

    const { decision } = await decideReply(
      q,
      { allowed: this.allowedReplyActions(role), quoted: quotedText },
      this.contextSource(role, pending?.draft?.text),
    )
    drop()
    if (!decision) return false

    const t = tick()
    this.pushPrivate(role, { id: uid('pm'), who: 'agent', time: t, text: decision.reply })

    // 动作由确定性代码执行，模型只是选了哪一个
    switch (decision.action) {
      case 'revise_direction':
        // 指令要传下去。之前这里断了：模型照你的话说了一遍，改稿却走写死的规则，
        // 于是「删掉③」这种要求根本到不了执行层，新版本和旧版一字不差。
        this.later(500, () => this.reviseSpecialistDraft(decision.instruction || q))
        break
      case 'revise_structure':
        this.later(500, () => this.reviseTradeTerms())
        break
      case 'revise_client_email':
        this.later(400, () => this.reviseClientEmail(decision.instruction || q))
        break
      case 'draft_client_note':
        this.pushPrivate(role, {
          id: uid('pm'), who: 'agent', time: t,
          text: '这是给客户的说明草稿，发布前你可以再改：',
          draft: { kind: 'roomMessage', text: CLIENT_NOTE_DRAFT, published: false },
        })
        break
      case 'propose_deviation':
        this.pushPrivate(role, {
          id: uid('pm'), who: 'agent', time: t,
          text: '我起草了一条发往交易室的偏离请求，你确认后发布：',
          draft: { kind: 'deviation', text: DEVIATION_DRAFT, published: false },
        })
        break
      default:
        break
    }
    if (decision.action !== 'answer') {
      this.addAudit({
        time: t, actor: 'AI Copilot', actorRole: 'AI',
        action: `按 ${PEOPLE[role].name} 的要求执行「${REPLY_ACTION_LABEL[decision.action]}」`,
        detail: `${decision.instruction ? `要求：${decision.instruction}。` : ''}意图由模型判断，动作由流程代码执行；产物仍需本人确认后才发布。`,
        priorState: this.state.truth.status, newState: this.state.truth.status,
      })
    }
    return true
  }

  /** 规则版应答——脚本模式与模型不可用时的回退 */
  private scriptedReply(role: RoleKey, q: string, quotedText?: string) {
    const t = tick()
    // 需求 / 结构阶段的批注：能落到初稿修改上就落，落不上就先复述确认
    if (quotedText && (role === 'ps')) {
      const wantsCut = /删|去掉|拿掉|不要|移除|砍/.test(q)
      const wantsLower = /压|降|低|收紧|薄|厚一点/.test(q)
      const ttPending = this.state.privateChats.ps.some((m) => m.draft?.kind === 'tradeTerms' && !m.draft.published)
      // 新模型：初稿在交易室，私区此时还没有卡——所以看的是"交易室有没有待确认的初稿"
      const spPending = !!this.livePreAnalysisId('ps')
      if ((wantsCut || wantsLower) && spPending && !this.state.specialistDraftRevised) {
        this.pushPrivate(role, {
          id: uid('pm'), who: 'agent', time: t,
          text: `收到——针对「${quotedText.slice(0, 28)}${quotedText.length > 28 ? '…' : ''}」。我按你的意思改初稿：删除达不到 10% 目标的指数方向，并把单一标的 KI 由 70% 压到 65%（集中度已逼近上限，且客户对薄缓冲有拒绝记录）。改动会记进审计。`,
        })
        this.later(500, () => this.reviseSpecialistDraft(`${quotedText}｜${q}`))
        return
      }
      if ((wantsCut || wantsLower) && ttPending && !this.state.tradeTermsRevised) {
        this.pushPrivate(role, {
          id: uid('pm'), who: 'agent', time: t,
          text: `收到——针对「${quotedText.slice(0, 28)}${quotedText.length > 28 ? '…' : ''}」。我删掉变体 B（Strike 85%），理由记为：客户上次敲入接股后持有至反弹才了结，接股价越高等待期越长。`,
        })
        this.later(500, () => this.reviseTradeTerms())
        return
      }
      this.pushPrivate(role, {
        id: uid('pm'), who: 'agent', time: t,
        text: `针对「${quotedText.slice(0, 28)}${quotedText.length > 28 ? '…' : ''}」记下了。要我据此改初稿的话，说清楚改成什么（例如"这条删掉""KI 压到 65%"），我改完你再确认发布。`,
      })
      return
    }
    if (this.state.truth.status === 'STRUCTURE_REVIEW' && /跳过|直接询价|直连询价|不用比较|省略比较/.test(q)) {
      this.pushPrivate(role, {
        id: uid('pm'), who: 'agent', time: t,
        text: '可以走流程偏离：客户邮件已含完整条款（FCN · 6M · Strike 80% · KI 70%）。注意两点——适当性与职责分离检查不会被豁免；偏离会作为独立事件留痕并计入流程改进统计。我起草了一条发往交易室的偏离请求，你确认后发布：',
        draft: { kind: 'deviation', text: DEVIATION_DRAFT, published: false },
      })
      return
    }
    if (/话术|怎么跟客户|客户沟通|说明|解释给客户/.test(q)) {
      this.pushPrivate(role, {
        id: uid('pm'), who: 'agent', time: t,
        text: '这是给客户的说明草稿（口径已按"先讲下行保护再谈票息"的附注调整），发布前你可以再改：',
        draft: { kind: 'roomMessage', text: CLIENT_NOTE_DRAFT, published: false },
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

  /**
   * 本人自由编辑初稿。
   *
   * 自由文本改完之后，"改了什么"只能靠 diff 推——这正是我们说过的
   * "被审计的东西必须是结构化的"那个问题。这里做两件事：
   *  1. 审计记可计算的行级差异（删了几行、加了几行），不猜语义；
   *  2. 对会驱动结构化产物的初稿（交易要素），从文本里反推还剩哪些变体，
   *     避免正文删了变体、产物里却还在。
   * 真实实现应该编辑结构化对象、由它渲染正文，而不是反过来。
   */
  editDraft(msgId: string, nextText: string) {
    const role = this.state.role
    const msgs = this.state.privateChats[role]
    const m = msgs.find((x) => x.id === msgId)
    if (!m?.draft || m.draft.published) return
    const prev = m.draft.text
    if (nextText.trim() === prev.trim()) return

    const prevLines = prev.split('\n').map((l) => l.trim()).filter(Boolean)
    const nextLines = nextText.split('\n').map((l) => l.trim()).filter(Boolean)
    const removed = prevLines.filter((l) => !nextLines.includes(l)).length
    const added = nextLines.filter((l) => !prevLines.includes(l)).length

    this.set({
      privateChats: {
        ...this.state.privateChats,
        [role]: msgs.map((x) => (x.id === msgId ? { ...x, draft: { ...x.draft!, text: nextText } } : x)),
      },
      ...(m.draft.kind === 'specialistProposal' ? { specialistDraftRevised: true } : {}),
      ...(m.draft.kind === 'tradeTerms' ? { tradeTermsRevised: true } : {}),
    })

    const t = fmtClock()
    this.addAudit({
      time: t,
      actor: PEOPLE[role].name,
      actorRole: PEOPLE[role].roleLabel,
      action: `编辑 agent 初稿（${DRAFT_AUDIT_NAME[m.draft.kind] ?? '草稿'}）：删除 ${removed} 行 · 新增 ${added} 行`,
      detail: '本人自由编辑；发布前内容不进入共享上下文。',
      priorState: this.state.truth.status,
      newState: this.state.truth.status,
    })
    this.pushPrivate(role, {
      id: uid('pm'), who: 'agent', time: t,
      text: `已保存你的修改（删除 ${removed} 行、新增 ${added} 行）。改动已记进审计，确认后发布。`,
    })
  }

  /** 从交易要素初稿正文反推还剩哪些变体（正文删掉的变体不该出现在产物里） */
  /**
   * 正文里还留着哪些变体。
   * 变体本身是结构化的，这里只处理"本人自由编辑了正文"的情况——
   * 按 label 在文本里找，找不到就当他删了。
   */
  private variantsFromDraftText(text: string, draft: StructureDraft): string[] {
    const kept = draft.variants.filter((v) => text.includes(v.label)).map((v) => v.id)
    return kept.length ? kept : [draft.variants[0]?.id ?? 'opt-a']
  }

  /** 正向门：发布草稿到交易室——显式确认，仅发布内容进入共享上下文与审计 */
  publishDraft(msgId: string) {
    this.set({ pendingDraftId: msgId })
    this.requestConfirm({
      key: 'publishPrivateDraft',
      title: '确认发布到交易室？',
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
    let auditAction = '发布私区草稿到交易室（仅发布内容进入共享上下文）'
    if (m.draft.kind === 'reply' || m.draft.kind === 'specialistProposal') {
      // 双署名：升级到公共层，预分析标记为已被取代
      const paId = m.draft.preAnalysisId
      const specialist = m.draft.kind === 'specialistProposal'
      this.push({
        kind: 'human', id: uid('tl'), author: PEOPLE[role],
        // v3（RM 反驳后的第二版）晚于第一版，不能共用同一个写死时间
        time: specialist ? setClock(this.state.specialistProposalPublished ? '14:10' : '14:07') : tick(),
        text: m.draft.text,
        via: specialist
          ? this.state.specialistDraftRevised ? 'agent 初稿 · 产品专家修改确认' : 'agent 初稿 · 产品专家确认（未修改）'
          : 'agent 预分析 · 本人确认',
      })
      if (paId) {
        this.set({ timeline: this.state.timeline.map((i) => (i.kind === 'preAnalysis' && i.id === paId ? { ...i, superseded: true } : i)) })
      }
      if (specialist) {
        // working assumption 落进需求摘要：有值了，但推导字段仍标"未经客户确认"
        if (!this.state.specialistProposalPublished) this.putArtifact(needBriefArtifact(2, 'proposed'))
        this.set({ specialistProposalPublished: true })
        this.patchTruth({ nextAction: 'RM 起草对客方向说明并与客户确认' })
        this.addChange('产品专家已确认方向建议', `David · 产品专家 · ${fmtClock()}`)
        auditAction = this.state.specialistDraftRevised
          ? '确认并发布方向建议（基于 agent 初稿，含本人修改）'
          : '确认并发布方向建议（基于 agent 初稿，未作修改）'
      }
    } else if (m.draft.kind === 'tradeTerms') {
      // 交易要素确认发布 → 才成为公开的结构方案产物
      this.publishTradeTerms(m.draft.text)
      auditAction = this.state.tradeTermsRevised
        ? '确认并发布交易要素（基于 agent 初稿，含本人修改）'
        : '确认并发布交易要素（基于 agent 初稿，未作修改）'
    } else if (m.draft.kind === 'clientBrief') {
      // 对客说明发出：内部指示价已在起草时移除，此处只发已脱敏版本
      this.push({ kind: 'human', id: uid('tl'), author: PEOPLE[role], time: setClock('14:12'), text: m.draft.text })
      this.systemEvent('send', `对客方向说明已发出（已移除 ${m.draft.redacted?.length ?? 0} 项内部信息，非报价）`, `Alice · RM · ${fmtClock()}`, 'neutral')
      auditAction = `发出对客方向说明（按受众脱敏：移除内部指示价等 ${m.draft.redacted?.length ?? 0} 项；未构成报价）`
      this.clientDirectionRound()
    } else {
      this.postTradeRoomMessage(m.draft.text)
    }
    this.addAudit({
      time: fmtClock(),
      actor: PEOPLE[role].name,
      actorRole: PEOPLE[role].roleLabel,
      action: auditAction,
      // 卡面上不再列脱敏清单了，逐条移除了什么落在这里——
      // 只说"移除了 6 项"而不说移除了哪 6 项，等于没说
      detail: m.draft.redacted?.length ? `移除项：${m.draft.redacted.join('；')}` : undefined,
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
    this.jointRoundRunning = false
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
  executeConfirmed(choice?: string) {
    const key = this.state.confirm?.key
    this.set({ confirm: null })
    if (!key) return
    // 权限在动作入口就拦掉。formalTransition 只守住状态流转，
    // 挡不住 do* 方法里的副作用（改产物、发消息、排定后续事件）——
    // 界面按角色禁用按钮只是第一道，这里才是真的那道。
    const rule = FCN_WORKFLOW[key]
    if (rule && !rule.allowedRoles.includes(this.state.role)) {
      console.warn(`[workflow] ${key} blocked at entry: role ${this.state.role} not in`, rule.allowedRoles)
      return
    }
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
      sendClientQuote: () => this.doSendClientQuote(choice === 'phone' ? 'phone' : 'email'),
      confirmInstruction: () => this.doConfirmInstruction(),
      rejectInstruction: () => this.doRejectInstruction(),
      confirmBooking: () => this.doConfirmBooking(),
      executeTrade: () => this.doExecuteTrade(),
      confirmTradeRecord: () => this.doConfirmTradeRecord(),
      approveTermsheet: () => this.doApproveTermsheet(),
      raiseException: () => this.doRaiseException(),
      resolveException: () => this.doResolveException(),
    }
    map[key]?.()
  }

  /** 当前角色名下尚未被取代的预分析 id */
  private livePreAnalysisId(role: RoleKey): string | undefined {
    const hit = [...this.state.timeline].reverse().find(
      (t) => t.kind === 'preAnalysis' && t.target === role && !t.superseded,
    )
    return hit?.kind === 'preAnalysis' ? hit.id : undefined
  }

  /** 产品专家是否已在场（需求共创的前提，也是确认需求的门槛） */
  specialistJoined(): boolean {
    return this.state.participants.some((p) => p.person.role === 'ps' && !p.person.guest)
  }

  // ── Step 0: RM @ 产品专家 → 需求共创入场 ────────────────────────────
  // 访谈：RM 和 IC 同在办公室，问一句就是了——没有"待对方接受"这一步。
  // 所以 @ 即入场：参与事实立刻留痕，内容等本人确认才留痕。
  private enterJointNeedDiscovery(asker: Person, target: Person, question: string) {
    const t = setClock('14:05')
    this.formalTransition('inviteSpecialist', {
      time: t,
      detail: `${asker.name} 在交易室 @ ${target.name}：「${question.slice(0, 60)}」`,
      truth: {
        waitingOn: null,
        nextAction: '产品专家确认 agent 方向初稿',
      },
    })
    this.addChange('产品专家加入需求共创', `${asker.name} @ ${target.name} · ${t}`)
    this.pushContextBrief(
      target,
      '需求共创 · Joint Need Discovery',
      [
        'Alice 收到 Mr. Chan 邮件（14:02）：USD 1m · 约 6M · 目标 >10% p.a. · 中等风险 · 看好中国互联网科技。',
        '客户未指定标的，也未指定结构——需要你和 Alice 一起跟客户把方向定下来，而不是等需求定稿后接手。',
        '你的 agent 已读取客户邮件与 Mr. Chan 的 CRM 档案，方向初稿在你的私有工作区等你修改确认。',
        '适当性：个人 PI · 可承受 C4（来自 CRM 客户档案）。',
      ],
      [{ label: 'Client Need Brief v1 · 客户需求摘要（草稿）', artifactId: 'art-need' }],
      '修改并确认 agent 方向初稿，再与 RM 一起同客户确认',
      `${this.state.truth.caseId} · ${this.state.truth.caseName}：Alice @ 了你（需求共创）`,
    )
  }

  /** 演示入口：一键发出 RM 的 @ 提问（等价于在输入框里手打这句） */
  consultSpecialist() {
    if (this.specialistJoined() || this.state.truth.status !== 'CLIENT_NEED_DRAFT') return
    this.postTradeRoomMessage(CONSULT_MSG)
  }

  // ── Step 0b: 产品专家修改 agent 初稿 ────────────────────────────────
  // 关键：进审计的是"他改了什么"，不是"他点了同意"——否则人就是橡皮图章。
  /**
   * 落一版结构化的方向建议到私区。
   * 先过校验——模型出的对象丢了约束、或票息判断与定价不符，这里就拦下来。
   */
  private pushProposalDraft(proposal: DirectionProposal, intro: string) {
    const issues = validateProposal(proposal)
    if (issues.length) {
      // 真接模型后这里应该退回重试；演示阶段只记一笔并照常展示
      this.addAudit({
        time: fmtClock(),
        actor: 'AI Copilot',
        actorRole: 'AI',
        action: `方向建议未通过结构化校验（${issues.length} 项）`,
        detail: issues.map((i) => `${i.field}：${i.message}`).join('；'),
        priorState: this.state.truth.status,
        newState: this.state.truth.status,
      })
    }
    this.pushPrivate('ps', {
      id: uid('pm'), who: 'agent', time: fmtClock(),
      text: intro,
      draft: {
        kind: 'specialistProposal',
        text: renderProposal(proposal),
        proposal,
        published: false,
        preAnalysisId: this.livePreAnalysisId('ps'),
      },
    })
  }

  /**
   * 按产品专家的指令改方向建议。
   *
   * 改稿由模型整份重出（受 PROPOSAL_SCHEMA 约束、由 validateProposal 兜硬约束），
   * 不再走写死的 applySpecialistRevision——后者只认「删不达标的」「压单一标的 KI」
   * 两条规则，指令落在规则外时会静默返回一版和原稿一字不差的东西。
   *
   * 代价是模型可能顺手改掉没点名的地方。三道防线：prompt 里划改稿边界、
   * validateProposal 拦硬约束、diffProposal 把每一处改动摊在审计里。
   * 还有一道兜底：diff 为空就不出新版本——「改了但没改」是假象，不能上屏。
   */
  reviseSpecialistDraft(instruction?: string) {
    if (this.state.specialistDraftRevised) return
    setClock('14:07')
    const base = this.state.baseProposal

    // 脚本模式 / 没拿到指令：维持原来的确定性变换
    if (getAiMode() !== 'live' || !instruction) {
      this.commitRevisedProposal(base, applySpecialistRevision(base))
      return
    }

    // 真模型要跑十几秒，先放一个占位气泡
    const holdId = uid('pm')
    this.pushPrivate('ps', { id: holdId, who: 'agent', time: tick(0), text: '', thinking: true })
    void (async () => {
      const { proposal, source } = await generateProposal(
        instruction,
        base,
        () => {},
        this.contextSource('ps', renderProposal(base)),
        base,
      )
      this.set({
        privateChats: { ...this.state.privateChats, ps: this.state.privateChats.ps.filter((m) => m.id !== holdId) },
      })
      // 模型不可用或校验没过时 generateProposal 会把 base 原样退回来——
      // 那就退回确定性变换，别把原稿当新版本推出去
      this.commitRevisedProposal(base, source === 'live' ? proposal : applySpecialistRevision(base))
    })()
  }

  /** 出版本 + 记审计的共用尾段；diff 为空则不出版本 */
  private commitRevisedProposal(base: DirectionProposal, revised: DirectionProposal) {
    // 审计记的是对象之间的 diff，不是我写死的一句话
    const changes = diffProposal(base, revised)
    if (!changes.length) {
      // 一个字都没变还推一张「新版本」卡，是在骗人——把没改成说清楚，让人自己动手
      this.pushPrivate('ps', {
        id: uid('pm'), who: 'agent', time: tick(),
        text: '这一版我没能改动任何内容——你的要求落在我能确定性执行的范围之外。'
          + '别按新版本看待，请直接点上面初稿的编辑按钮自己改，改动同样会按行级差异记进审计。',
      })
      this.addAudit({
        time: fmtClock(),
        actor: 'AI Copilot',
        actorRole: 'AI',
        action: `改稿未产生任何变更（v${base.version}）`,
        detail: '模型返回的方向建议与上一版逐字相同，已拦下，未生成新版本。',
        priorState: this.state.truth.status,
        newState: this.state.truth.status,
      })
      return
    }
    this.set({ specialistDraftRevised: true })
    this.pushProposalDraft(revised, '按你的意思改好了。这是新版本，确认后发布，或直接拖到左侧交易室：')
    this.addAudit({
      time: fmtClock(),
      actor: PEOPLE.ps.name,
      actorRole: PEOPLE.ps.roleLabel,
      action: `修改 agent 方向建议（v${base.version} → v${revised.version}）：${changes.join('；')}`,
      detail: revised.revisionNote,
      priorState: this.state.truth.status,
      newState: this.state.truth.status,
    })
  }

  /**
   * FAKE-AI：判断这条交易室发言是不是"对某人已发布产出的意见"。
   *
   * 现在是规则——有人发布了待响应的产出、发言者不是作者、且句子里带评价性措辞。
   * 接真模型后这里换成意图分类：输入是发言 + 当前待响应产出清单，
   * 输出是「这是对哪一份的意见 / 不是意见」。函数签名不用变。
   */
  private classifyFeedbackTarget(author: Person, body: string): RoleKey | null {
    if (body.startsWith('@')) return null // @ 已经有自己的路径
    const pending: { author: RoleKey } | null =
      this.state.specialistProposalPublished && !this.state.needSettled ? { author: 'ps' } : null
    if (!pending || pending.author === author.role) return null
    if (this.state.rmPushedBack) return null // 本轮已经提过一次
    if (body.length < 8) return null
    if (!/[？?]|不|但|能不能|建议|我觉得|怕|担心|太|再|换|保留|加上|去掉/.test(body)) return null
    return pending.author
  }

  /** 把意见路由给产出作者：进公区留痕，作者的 agent 据此出新版本 */
  private routeFeedbackToAuthor(from: Person, to: RoleKey, body: string) {
    const t = fmtClock()
    this.set({ rmPushedBack: true })
    this.systemEvent(
      'arrow',
      `${PEOPLE[to].name} 的 agent 收到 ${from.name} 的意见，正在出新版本`,
      `${from.name} · ${t}`,
      'neutral',
    )
    this.patchTruth({ nextAction: `${PEOPLE[to].name} 回应意见并出新版本` })
    this.addChange(`${from.name} 就方向建议提出不同看法`, `${from.name} · ${t}`)
    this.addAudit({
      time: t,
      actor: from.name,
      actorRole: from.roleLabel,
      action: `就已发布的方向建议提出意见：「${body.slice(0, 46)}${body.length > 46 ? '…' : ''}」`,
      detail: '交易室自然语言发言，经意图识别路由给产出作者；意见本身进公区留痕，新版本仍需作者确认。',
      priorState: this.state.truth.status,
      newState: this.state.truth.status,
    })
    this.later(1200, () => {
      setClock('14:09')
      this.pushProposalDraft(
        V3_PROPOSAL,
        `${from.name} 在交易室提了意见：「${body.slice(0, 50)}${body.length > 50 ? '…' : ''}」。我据此出了 v${V3_PROPOSAL.version}，确认后发布，或拖到左侧交易室：`,
      )
      const changes = diffProposal(applySpecialistRevision(this.state.baseProposal), V3_PROPOSAL)
      this.addAudit({
        time: fmtClock(),
        actor: 'AI Copilot',
        actorRole: 'AI',
        action: `据 ${from.name} 的意见出 v${V3_PROPOSAL.version}：${changes.join('；')}`,
        detail: V3_PROPOSAL.revisionNote,
        priorState: this.state.truth.status,
        newState: this.state.truth.status,
      })
      this.set({
        notifications: [...this.state.notifications, {
          id: uid('ntf'), role: to, caseId: this.state.truth.caseId,
          title: `${from.name} 对你的方向建议有意见`, body: body.slice(0, 40), time: fmtClock(), read: false,
        }],
      })
    })
  }

  // ── Step 0b2: RM 提出不同看法 ──────────────────────────────────────
  // 需求共创是双向的：产品专家出结构判断，RM 出客户关系判断。
  // Alice 推翻的不是 David 的产品逻辑，而是"该不该替客户决定缓冲厚薄"。
  /**
   * 演示快捷入口：等价于 Alice 在交易室输入框里手打这句话。
   * 真实交互里没有"我有不同看法"这个按钮——她就是打一句话，
   * 由意图识别决定它是不是对某份产出的意见。
   */
  pushBackOnProposal() {
    if (this.state.rmPushedBack || !this.state.specialistProposalPublished || this.state.needSettled) return
    setClock('14:08')
    this.postTradeRoomMessage(RM_PUSHBACK)
  }

  // ── Step 0c: RM 起草对客版本（按受众脱敏）──────────────────────────
  // 同一份内容、两个受众：内部指示价不能出现在对客材料里，
  // 否则等于在询价之前给了客户一个准报价。
  draftClientBrief() {
    if (!this.state.specialistProposalPublished) return
    if (this.state.privateChats.rm.some((m) => m.draft?.kind === 'clientBrief')) return
    // 有未确认的 v3 挂在 David 私区时，不能抢跑发客户
    if (this.state.privateChats.ps.some((m) => m.draft?.kind === 'specialistProposal' && !m.draft.published)) return
    this.set({ privateOpen: true })
    this.runProcessing(['正在按对客受众改写方向说明...', '正在移除内部指示价与定价依据...'], 700, () => {
      const t = setClock('14:11')
      this.pushPrivate('rm', {
        id: uid('pm'), who: 'agent', time: t,
        text: '这是给 Mr. Chan 的方向说明。已移除全部内部指示价——询价还没做，任何票息数字发出去都会被当成准报价。你审核后发出：',
        draft: {
          kind: 'clientBrief',
          text: CLIENT_BRIEF,
          published: false,
          redacted: [
            `indicative ${rng(['0700.HK'], 65)} / ${rng(['0700.HK'], 70)}（方向①两档内部指示区间）`,
            `indicative ${rng(['0700.HK', '9988.HK'], 65)}（方向②内部指示区间）`,
            `内部定价快照 · ${MARKET_SNAPSHOT.asOf}`,
            `crm.holdings：腾讯持仓 HKD 25.4m、敞口 ${TENCENT_NOW} → ${KI_EXPOSURE}`,
            `本行单一标的敞口上限 ${CAP}（内部风控参数）`,
            `发行商覆盖度（${cov(['0700.HK'])}）`,
          ],
        },
      })
    })
  }

  // ── Step 0d: 客户回合 —— 对客说明发出后，客户回复并收敛需求 ────────
  private clientDirectionRound() {
    if (this.jointRoundRunning || this.state.needSettled) return
    this.jointRoundRunning = true
    this.later(1200, () => {
      const rt = setClock('14:13')
      this.push({ kind: 'human', id: uid('tl'), author: PEOPLE.rm, time: rt, text: CLIENT_DIRECTION_REPLY, quote: true })
      this.runProcessing(['正在把客户回复对齐到需求字段...', '正在更新客户需求摘要...'], 750, () => {
        const ct = setClock('14:14')
        this.putArtifact(needBriefArtifact(3, 'settled'))
        this.set({ needSettled: true })
        this.patchTruth({
          // 标的经客户确认，案例这时才真正有名字
          caseName: 'Tencent FCN',
          alerts: this.state.truth.alerts.filter((x) => x.id !== 'al-missing' && x.id !== 'al-underlying'),
          nextAction: 'RM 与产品专家共同确认客户需求',
        })
        this.addChange('需求共创完成：标的与流动性已确定', `Alice + David · ${ct}`)
        this.addAudit({
          time: ct,
          actor: 'AI Copilot',
          actorRole: 'AI',
          action: '已更新 Client Need Brief v2：标的 0700.HK 与流动性偏好由需求共创确定',
          priorState: 'CLIENT_NEED_JOINT_REVIEW',
          newState: 'CLIENT_NEED_JOINT_REVIEW',
        })
        this.later(700, () => {
          const dt = setClock('14:15')
          this.push({ kind: 'human', id: uid('tl'), author: PEOPLE.ps, time: dt, text: SPECIALIST_CLOSE_MSG })
        })
      })
    })
  }

  /** 多选：产品专家可以同时把几个变体送去询价，最后由客户选一个 */
  toggleOption(optionId: string) {
    const a = this.state.artifacts['art-structure']
    if (!a || a.data.type !== 'structureProposal' || a.status === 'APPROVED') return
    const cur = a.data.selectedIds
    const next = cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId]
    if (next.length === 0) return // 至少留一个
    this.updateArtifact('art-structure', { data: { ...a.data, selectedIds: next } })
  }

  // ── Step 1: Confirm client need (RM) ───────────────────────────────────
  private doConfirmNeed() {
    const t = setClock('14:16')
    this.updateArtifact('art-need', {
      status: 'APPROVED',
      approvedMeta: `Alice · RM · ${t} 确认（David · 产品专家 共同界定）`,
      note: { author: 'Alice · RM', text: '客户对保本的敏感度高于收益目标；与客户沟通时先讲下行保护，再谈票息。' },
    })
    this.systemEvent('check', '客户需求已确认（RM + 产品专家共同界定）', `负责人转为 David · 产品专家 · ${t}`, 'success', ['rm', 'dealer'])
    this.formalTransition('confirmNeed', {
      time: t,
      truth: {
        waitingOn: null,
        nextAction: '等待 AI 把共创结论细化成结构方案',
        alerts: this.state.truth.alerts.filter((x) => x.id !== 'al-missing' && x.id !== 'al-underlying'),
      },
    })
    this.addChange('客户需求 Approved', `Alice · RM · ${t}`)
    // David 在需求共创时就已加入并收到过 Context Brief，这里不再重复推送。
    // 结构方案不再凭空出现：agent 先把已确认需求细化成交易要素，落到 David 私区，
    // 他确认后才成为公开产物——和需求阶段同构。
    this.later(600, () => this.generateTradeTerms())
  }

  /**
   * 交易要素初稿：真模型（可用时）或脚本。
   *
   * 和需求阶段同构——模型只定可调参数（Strike / Autocall / 票息支付）和取舍说明；
   * 票息、发行商覆盖度由代码算，适当性结论由 check_suitability 工具给。
   * 锁定要素模型碰不到：它们根本不在输出 schema 里。
   */
  private generateTradeTerms() {
    const traceId = uid('trace')
    this.push({
      kind: 'agentTrace', id: traceId,
      title: 'David 的 agent 正在细化交易要素',
      owner: 'ps', steps: [], done: false,
      stage: this.state.truth.stage,
    })

    void (async () => {
      const started = Date.now()
      const { draft, source, ms, reason, rounds, toolCalls, slices } = await generateStructure(
        {
          locked: LOCKED_TERMS,
          underlyings: ['0700.HK'],
          ki: LOCKED_KI,
          directionNote: this.state.baseProposal.directions
            .map((d) => `${d.label} · KI ${d.ki}%：${d.note}`)
            .join('\n'),
        },
        BASE_STRUCTURE_DRAFT,
        (steps) => this.patchTrace(traceId, { steps }),
        this.contextSource('ps'),
      )
      this.patchTrace(traceId, { done: true, ms: ms ?? Date.now() - started, rounds, toolCalls })

      const ct = setClock('14:17')
      this.set({ structureDraft: draft, structureSource: source })
      this.pushPrivate('ps', {
        id: uid('pm'), who: 'agent', time: ct,
        text: `需求已确认，我把它细化成交易要素了。客户确认过的五项（标的 / KI ${LOCKED_KI}% / 6M / 名义本金 / 接货）已锁死，下面 ${draft.variants.length} 个变体只动你可调的参数。确认后发布为结构方案：`,
        draft: { kind: 'tradeTerms', text: renderStructureDraft(draft), published: false },
      })
      // agent 干完了，等的是人——这里不更新的话过渡屏会一直显示"AI 处理中"，看着像卡死
      this.patchTruth({
        nextAction: '产品专家确认 agent 交易要素初稿',
        waitingOn: 'David 确认交易要素初稿（在他的私有工作区）',
      })
      this.set({
        notifications: [...this.state.notifications, {
          id: uid('ntf'), role: 'ps', caseId: this.state.truth.caseId,
          title: `${this.state.truth.caseId} 交易要素初稿待你确认`,
          body: '客户确认约束已锁死，可调参数变体待你取舍', time: ct, read: false,
        }],
      })
      this.addAudit({
        time: ct, actor: 'AI Copilot', actorRole: 'AI',
        action: `已起草交易要素（${draft.variants.length} 个参数变体，客户确认约束锁死）· 待产品专家确认`,
        detail:
          source === 'live'
            ? `agent 循环 ${rounds} 轮 · 调用工具 ${toolCalls} 次 · ${ms}ms；上下文装配：${slices ?? '—'}；参数取自 structure_template 合法域，适当性由 check_suitability 预检，票息与覆盖度由代码计算。`
            : source === 'fallback'
              ? `模型不可用，已回退脚本版：${reason ?? '未知原因'}`
              : '脚本模式',
        priorState: 'CLIENT_NEED_APPROVED', newState: 'CLIENT_NEED_APPROVED',
      })
    })()
  }

  // ── Step 1b: 产品专家修改交易要素初稿 ──────────────────────────────
  reviseTradeTerms() {
    if (this.state.tradeTermsRevised) return
    const msgs = this.state.privateChats.ps
    const idx = msgs.findIndex((m) => m.draft?.kind === 'tradeTerms' && !m.draft.published)
    if (idx < 0) return
    const t = setClock('14:18')
    // 规则化改稿，不写死 id：接股价最高的那个变体是要删的那个。
    // 这样无论变体是模型给的还是脚本给的，同一条判断都成立。
    const draft = this.state.structureDraft
    const target = [...draft.variants].sort((a, b) => b.strike - a.strike)[0]
    if (!target || draft.variants.length <= 2) return
    const why = '客户 2025-09 敲入接股后持有至反弹才了结；接股价越高，等待期越长。他接受接货不等于愿意接贵货。'
    const next = removeVariant(draft, target.id, why)
    this.set({
      tradeTermsRevised: true,
      structureDraft: next,
      privateChats: {
        ...this.state.privateChats,
        ps: msgs.map((m, i) => (i === idx ? { ...m, draft: { ...m.draft!, text: renderStructureDraft(next) } } : m)),
      },
    })
    this.pushPrivate('ps', {
      id: uid('pm'), who: 'agent', time: t,
      text: `已删除「${target.label}」并记录了你的理由。剩下 ${next.variants.length} 个变体，确认后发布。`,
    })
    this.addAudit({
      time: t, actor: PEOPLE.ps.name, actorRole: PEOPLE.ps.roleLabel,
      action: `修改 agent 交易要素初稿：删除「${target.label}」（Strike ${target.strike}%）`,
      detail: `理由：${why}`,
      priorState: this.state.truth.status, newState: this.state.truth.status,
    })
  }

  /** 发布交易要素 → 才成为公开的结构方案产物 */
  private publishTradeTerms(text: string) {
    const ct = setClock('14:19')
    // 以结构化初稿为准；正文被自由编辑过的，才回头按文本推断还剩哪些变体
    const draft = this.state.structureDraft
    const kept = this.variantsFromDraftText(text, draft)
    const options = toStructureOptions(draft).filter((o) => kept.includes(o.optionId))
    this.pushArtifactItem({
      id: 'art-structure',
      title: 'Structure Proposal',
      titleZh: '结构方案',
      status: 'PENDING APPROVAL',
      version: 1,
      createdAt: ct,
      data: {
        type: 'structureProposal',
        options,
        recommendedId: 'opt-a',
        selectedIds: ['opt-a'],
        comparisonNote: `客户确认约束已锁死（${LOCKED_TERMS.map((l) => l.label).join(' · ')}）；以下 ${options.length} 个变体只在产品专家可调的参数上不同。`,
        modifiedNote: this.state.tradeTermsRevised
          ? 'David 删除了变体 B（Strike 85%）：客户上次敲入接股后持有至反弹才了结，接股价越高等待期越长。'
          : null,
        lockedTerms: LOCKED_TERMS,
      },
    })
    this.patchTruth({
      status: 'STRUCTURE_REVIEW',
      statusLabel: '结构待审批',
      statusTone: 'warning',
      nextAction: '产品专家选择变体并审批结构',
    })
    this.addChange('交易要素已发布为结构方案', `David · 产品专家 · ${ct}`)
  }

  // ── Step 2: Approve structure (PS) ─────────────────────────────────────
  private doApproveStructure() {
    const a = this.state.artifacts['art-structure']
    if (!a || a.data.type !== 'structureProposal') return
    const data = a.data
    const picked = data.options.filter((o) => data.selectedIds.includes(o.optionId))
    if (!picked.length) return
    const variants: PricedVariant[] = picked.map((o) => ({
      id: o.optionId,
      label: o.label,
      strike: o.strike,
      autocall: o.autocall,
      payment: o.couponTarget.split('·').pop()?.trim() ?? '月付',
    }))
    const t = setClock('14:19')
    this.updateArtifact('art-structure', {
      status: 'APPROVED',
      approvedMeta: `David · 产品专家 · ${t} 审批（${picked.length} 个变体同时询价）`,
    })
    this.set({ pricedVariants: variants })
    this.systemEvent(
      'check',
      `结构已审批：${picked.map((o) => o.label).join(' + ')} · KI ${picked[0].knockIn}`,
      `David · 产品专家 · ${t}`, 'success', ['rm', 'ps'],
    )
    this.formalTransition('approveStructure', {
      time: t,
      detail: `同时询价 ${picked.length} 个变体：${picked.map((o) => `${o.label}（Strike ${o.strike} · ${o.autocall}）`).join('；')}`,
      truth: {
        waitingOn: null,
        nextAction: '等待 AI 生成 RFQ包',
        // 已批准条款只放所有变体共用的部分；各变体的差异在 RFQ 包里
        approvedTerms: [
          { label: 'Underlying', value: '0700.HK' },
          { label: 'Product', value: `FCN · ${picked[0].tenor}` },
          { label: 'Notional', value: 'USD 1,000,000' },
          { label: 'KI', value: picked[0].knockIn },
          { label: 'Variants', value: picked.map((o) => o.label.replace('变体 ', '')).join(' + ') },
        ],
      },
    })
    this.addChange(`结构 Approved（${picked.length} 个变体）`, `David · 产品专家 · ${t}`)
    this.queueRFQGeneration(
      variants,
      `David 已于 ${t} 审批结构：Tencent FCN · KI ${picked[0].knockIn} · ${picked.length} 个变体同时询价（${picked.map((o) => o.label).join(' / ')}），RFQ Package 已生成并通过完整性检查。`,
    )
  }

  private queueRFQGeneration(variants: PricedVariant[], briefLine: string) {
    this.later(600, () => {
      this.runProcessing(['正在起草 RFQ 包...', '正在做完整性检查...'], 900, () => {
        const ct = setClock('14:20')
        this.pushArtifactItem({
          id: 'art-rfq',
          title: 'RFQ Package',
          titleZh: 'RFQ包',
          status: 'PENDING REVIEW',
          version: this.state.requoteRound + 1,
          createdAt: ct,
          data: {
            type: 'rfqPackage',
            // 共用要素放 fields，各变体的差异放 variants——询价包本来就是这么发的
            fields: [
              { label: 'Product Type', value: 'Fixed Coupon Note (FCN)' },
              { label: 'Underlying', value: 'Tencent / 0700.HK' },
              { label: 'Notional', value: 'USD 1,000,000' },
              { label: 'Tenor', value: '6M' },
              { label: 'Knock-In', value: this.approvedKI() },
              { label: 'Strike', value: variants.map((v) => v.strike).join(' / ') },
              { label: 'Autocall', value: variants.map((v) => v.autocall).join(' / ') },
              { label: 'Coupon Type', value: `Fixed · ${variants.map((v) => v.payment).join(' / ')}` },
              { label: 'Settlement', value: 'T+2 · 现金/实物' },
            ],
            issuers: issuerCoverage(['0700.HK']),
            variants,
            checks: [
              { label: '关键条款完整（strike / KI / tenor / coupon type）', ok: true },
              { label: `与 Approved Structure 一致（${variants.length} 个变体）`, ok: true },
              { label: `发行商清单已按标的覆盖度生成（${issuerCoverage(['0700.HK']).length} 家）`, ok: true },
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
          { label: 'KI', value: '65%' },
          { label: 'Autocall', value: '月度观察 · 自第 2 月起' },
          { label: 'Variants', value: '直连询价（单变体）' },
        ],
      },
    })
    this.addChange('流程偏离批准 · 直连询价', `David · ${t}`)
    const devVariant: PricedVariant[] = [
      { id: 'opt-a', label: '客户条款（直连）', strike: '80%', autocall: '月度观察 · 自第 2 月起', payment: '月付' },
    ]
    this.set({ pricedVariants: devVariant })
    this.queueRFQGeneration(
      devVariant,
      `David 已于 ${t} 批准流程偏离：跳过结构对比，按客户完整条款（FCN · 6M · Strike 80% · KI 65%）直接询价。偏离已单独留痕。`,
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
    const t = setClock('14:21')
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
    const variants = this.state.pricedVariants
    const quotes = quoteSet(round, Date.now(), ki, variants)
    const bnp = quotes.find((q) => q.issuer === 'BNP')

    // 每个变体一行：最优可比报价是逐行算出来的，不是挑一个全局最高
    const rows = variants.map((v) => {
      const best = quotes.find((q) => q.variantId === v.id && q.best)
      const opt = this.state.artifacts['art-structure']
      const o = opt?.data.type === 'structureProposal' ? opt.data.options.find((x) => x.optionId === v.id) : null
      return {
        id: v.id,
        label: v.label,
        terms: `Strike ${v.strike} · ${v.autocall} · ${v.payment}`,
        bestIssuer: best?.issuer ?? null,
        bestCoupon: best?.coupon ?? null,
        tradeoff: o?.tradeoff,
      }
    })
    const top = [...rows].sort((a, b) => (b.bestCoupon ?? 0) - (a.bestCoupon ?? 0))[0]
    const noQuote = quotes.filter((q) => q.coupon === null)

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
        variants: rows.map(({ tradeoff: _drop, ...r }) => r),
        // 逐变体谁最优，上面那行 A → … B → … 已经列全了，这里不再复述一遍；
        // 只留这句话真正新增的东西：票息最高的那个不等于该选它。
        bestNote:
          variants.length > 1
            ? `票息最高的是${top.label}，但它的取舍需要客户判断，不由交易台替客户选。`
            : `${rows[0]?.bestIssuer} 为最优可比报价：可比报价中 coupon 最高，条款与 Approved Structure 一致。`,
        freshnessNote: `报价由标准询价接口返回并自动标准化，共 ${quotes.length} 条（${variants.length} 变体 × 5 家）。${noQuote.length} 条无报价（UBS 不做无 autocall 结构 / 未回复）。BNP 条款不可比（KI ${bnp?.ki}）。`,
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
          detail: `BNP 使用 KI ${bnp?.ki}，而 Approved RFQ 为 KI ${ki}。虽然 coupon 更高，不能直接用于客户报价。`,
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
      action: `已生成 Quote Matrix v${artifact.version}（${variants.length} 变体 × 5 家 = ${quotes.length} 条；${quotes.filter((q) => q.comparable).length} 条可比，${noQuote.length} 条无报价）`,
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
    const md = matrix?.data.type === 'quoteMatrix' ? matrix.data : null
    const bnpQ = md?.quotes.find((q) => q.issuer === 'BNP')
    const ki = this.approvedKI()
    const struct = this.state.artifacts['art-structure']
    const sd = struct?.data.type === 'structureProposal' ? struct.data : null

    // 每个变体的最优可比报价 → 一个对客选项。收窄留给客户，不由交易台代劳。
    const bests = md?.quotes.filter((q) => q.best) ?? []
    // 对客票息 = 上手票息 − 登记价差。报价矩阵里的是上手价，不能原样给客户。
    const options = bests.map((q) => {
      const o = sd?.options.find((x) => x.optionId === q.variantId)
      const toClient = clientCoupon(q.coupon ?? 0)
      return {
        id: q.variantId,
        label: q.variantLabel,
        issuer: q.issuer,
        coupon: toClient,
        terms: [
          { label: 'Product', value: 'FCN · Tencent (0700.HK) · 6M' },
          { label: 'Notional', value: 'USD 1,000,000' },
          { label: 'Coupon', value: `${toClient.toFixed(2)}% p.a.` },
          { label: 'Strike', value: q.strike },
          { label: 'Knock-In', value: ki },
          { label: 'Autocall', value: o?.autocall ?? '—' },
        ],
        summary:
          o?.autocall === '无 autocall'
            ? `年化 ${toClient.toFixed(2)}%，按月支付，没有提前赎回——腾讯涨上去也不会被提前了结，能拿满 6 个月。`
            : `年化 ${toClient.toFixed(2)}%，按月支付。自第 2 月起每月观察，腾讯回到期初价以上即提前赎回，票息随之中止。`,
        tradeoff: o?.tradeoff ?? '',
      }
    })
    const lead = options.sort((a, b) => b.coupon - a.coupon)[0]

    this.runProcessing(
      ['正在按变体整理最优可比报价...', '正在生成面向客户的表述与风险披露...'],
      850,
      () => {
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
            issuer: lead?.issuer ?? 'Morgan Stanley',
            options,
            terms: lead?.terms ?? [],
            summary:
              options.length > 1
                // 「两个」是写死的，选几个变体去询价是产品专家在结构阶段定的，
                // 数量对不上就会出现「按钮说 3 个、正文说两个」
                ? `以腾讯为标的的 6 个月固定派息票据，${options.length} 个选项的差别在提前赎回与接股价。只要腾讯期间不跌破期初价的 ${ki}，到期收回全部本金及票息。`
                : (lead?.summary ?? ''),
            riskSummary: `若腾讯曾跌破 ${ki}（KI）且到期低于行权价，将按行权价接入腾讯股票，可能产生本金损失。本产品不保本。`,
            // 当日有效；跨日未成交需重新询价（不是分钟级倒计时）
            validityUntil: null,
            internalNote:
              `逐变体最优（上手价）：${bests.map((q) => `${q.variantLabel} → ${q.issuer} ${(q.coupon ?? 0).toFixed(2)}%`).join('；')}。\n` +
              `分销价差：${SPREAD_MODES[SPREAD_POLICY.mode].labelZh} · 登记 ${SPREAD_POLICY.registeredBp}bp（${SPREAD_POLICY.registeredBy} · ${SPREAD_POLICY.registeredAt}）→ 对客票息已扣减。\n` +
              `${SPREAD_MODES[SPREAD_POLICY.mode].reconcileZh}\n` +
              `BNP（KI ${bnpQ?.ki ?? '—'}）条款不可比，未采用。`,
          },
        })
        const m = this.latestMatrix()
        if (m) this.updateArtifact(m.id, { status: 'STALE' })
        this.addChange(`客户报价卡已生成（${options.length} 个选项）`, ct)
        this.addAudit({
          time: ct,
          actor: 'AI Copilot',
          actorRole: 'AI',
          action: `已起草 Client Quote Card（${options.length} 个选项，各取所属变体的最优可比报价）`,
          priorState: 'CLIENT_QUOTE_READY',
          newState: 'CLIENT_QUOTE_READY',
        })
        // 报价卡就绪的同时把对客邮件正文也起草到 Alice 私区——
        // 她得有个地方能改，否则「RM 审核」只是卡面上的一句话
        this.draftClientQuoteEmail()
      },
    )
  }

  /**
   * 对客报价邮件的正文。
   *
   * 抽出来是因为它现在有两个消费者：私区里那张可编辑的草稿卡，和真正发出去的
   * 那封邮件。以前正文是在「发送」那一刻才拼出来的字符串——Alice 从头到尾
   * 没见过它，而卡面上却写着「AI 起草 · RM 审核后发出」。审核这件事不存在。
   */
  private buildClientEmailBody(): string {
    const opts = this.clientQuoteOptions()
    return [
      'Mr. Chan，',
      '',
      `按我们上次谈的方向，这里有 ${opts.length} 个以腾讯为标的的 6 个月固定派息票据方案，差别在提前赎回与接股价：`,
      '',
      // summary 本身就以「年化 X%」开头，别再前缀一次票息
      ...opts.map((o, i) => `${i + 1}. ${o.label.replace('变体 ', '')}：${o.summary}`),
      '',
      `风险提示：若腾讯曾跌破 ${this.approvedKI()}（KI）且到期低于行权价，将按行权价接入腾讯股票，可能产生本金损失。本产品不保本。`,
      '',
      '报价当日有效，跨日未成交需重新询价。选定后回复我即可。',
      '',
      'Alice',
    ].join('\n')
  }

  /**
   * 按 Alice 的一句话改对客邮件正文。
   *
   * 走的是 editDraft 同一条路——改完仍是"未发出的草稿"，发送门还在报价卡上。
   * 用真模型改写；模型不可用就老实说没改动，不做假动作（这是上一轮那个
   * 「话是照你说的说的、稿是按预设改的」的教训）。
   */
  private reviseClientEmail(instruction: string) {
    const msg = this.state.privateChats.rm.find((m) => m.draft?.kind === 'clientQuoteEmail' && !m.draft.published)
    if (!msg?.draft) return
    const before = msg.draft.text
    void (async () => {
      const { text, source } = await rewriteClientEmail(before, instruction, this.contextSource('rm'))
      if (source !== 'live' || !text || text.trim() === before.trim()) {
        this.pushPrivate('rm', {
          id: uid('pm'), who: 'agent', time: tick(),
          text: '这一版我没改动正文——要么模型没给出可用结果，要么改完和原文一样。'
            + '你可以点卡上的编辑按钮直接改，改动同样按行级差异记进审计。',
        })
        return
      }
      // editDraft 会算行级差异并写审计，正文归它改
      this.editDraft(msg.id, text)
      this.pushPrivate('rm', {
        id: uid('pm'), who: 'agent', time: tick(),
        text: '按你说的改好了，正文已更新。发出去还是要你在报价卡上点「发送给客户」——那一步会把全文再摆一遍给你过目。',
      })
    })()
  }

  /** 当前要发出去的正文：优先用 Alice 改过的版本 */
  clientEmailBody(): string {
    const draft = this.state.privateChats.rm.find((m) => m.draft?.kind === 'clientQuoteEmail')?.draft
    return draft?.text ?? this.buildClientEmailBody()
  }

  /**
   * 报价卡就绪后，把对客邮件正文起草到 Alice 私区。
   *
   * 放私区而不是直接进交易室：这封信还没发，它是她的草稿。
   * 改法有两种——直接在卡上编辑（行级差异进审计），或在私区跟 agent 说
   * 「风险提示那段太硬了，换个说法」。发送门仍在报价卡上，因为发送要选渠道。
   */
  private draftClientQuoteEmail() {
    if (this.state.privateChats.rm.some((m) => m.draft?.kind === 'clientQuoteEmail')) return
    this.pushPrivate('rm', {
      id: uid('pm'), who: 'agent', time: fmtClock(),
      text: '这是给 Mr. Chan 的报价邮件正文。发出去之前你先过一遍——要改直接在卡上编辑，或者告诉我怎么改：',
      draft: { kind: 'clientQuoteEmail', text: this.buildClientEmailBody(), published: false },
    })
  }

  // ── Step 5: Send to client & client reply ──────────────────────────────
  //
  // 渠道决定的不是措辞，而是留痕方式：
  // 邮件本身就是可归档的证据，发出去就完事；电话没有原始记录，
  // 通话结束后必须把录音传回来转写，客户说了什么才进得了系统。
  private doSendClientQuote(channel: 'email' | 'phone') {
    const t = setClock('14:27')
    const byEmail = channel === 'email'
    this.set({ clientChannel: channel })
    this.updateArtifact('art-cq', {
      status: 'SENT',
      approvedMeta: `Alice · RM · ${t} ${byEmail ? '已邮件发出' : '已电话沟通'}`,
    })
    if (byEmail) {
      const opts = this.clientQuoteOptions()
      // 发出去的是 Alice 过目（可能改过）的那一版，不是发送那一刻现拼的
      const body = this.clientEmailBody()
      const draftMsg = this.state.privateChats.rm.find((m) => m.draft?.kind === 'clientQuoteEmail')
      const edited = !!draftMsg?.draft && draftMsg.draft.text !== this.buildClientEmailBody()
      if (draftMsg?.draft) {
        this.set({
          privateChats: {
            ...this.state.privateChats,
            rm: this.state.privateChats.rm.map((m) =>
              m.id === draftMsg.id && m.draft ? { ...m, draft: { ...m.draft, published: true } } : m),
          },
        })
      }
      this.pushArtifactItem({
        id: 'art-email',
        title: 'Client Email',
        titleZh: '对客邮件',
        status: 'SENT',
        version: 1,
        createdAt: t,
        data: {
          type: 'clientEmail',
          to: 'Mr. Chan <chan@example.com>',
          subject: `Tencent 6M FCN — ${opts.length} 个方案供你选择`,
          body,
          sentAt: t,
        },
      })
      this.systemEvent('send', `对客邮件已发出（AI 起草 · Alice ${edited ? '改写后' : '审核后'}发出）`, `Alice · RM · ${t}`)
      this.addAudit({
        time: t, actor: PEOPLE.rm.name, actorRole: PEOPLE.rm.roleLabel,
        action: `对客报价邮件已发出${edited ? '（正文经本人改写）' : '（正文经本人审核，未改动）'}`,
        detail: '正文在发送前已在确认弹窗中全文呈现，并可在私区编辑；改动按行级差异记进审计。',
        priorState: this.state.truth.status, newState: 'WAITING_FOR_CLIENT',
      })
    } else {
      this.systemEvent('send', '已与客户电话沟通报价，待上传通话录音', `Alice · RM · ${t}`)
    }
    this.formalTransition('sendClientQuote', {
      time: t,
      truth: {
        currentOwner: PEOPLE.rm,
        waitingOn: byEmail ? '客户 Mr. Chan' : null,
        nextAction: byEmail ? '等待客户回复；AI 将识别潜在客户指令' : '通话结束后上传录音，AI 转写并识别客户意图',
      },
    })
    this.addChange(byEmail ? '报价已邮件发出' : '报价已电话沟通', t)
    // 邮件渠道客户会自己回；电话渠道要等 RM 把录音传回来（uploadCallRecording）
    if (byEmail) this.later(2600, () => this.receiveClientReply('email'))
  }

  /** 电话渠道：RM 通话结束后上传录音 → 转写 → 识别意图 */
  uploadCallRecording() {
    if (this.state.clientChannel !== 'phone') return
    if (this.state.artifacts['art-transcript']) return
    this.runProcessing(['正在转写通话录音...', '正在识别客户意图...'], 900, () => {
      const rt = setClock('14:36')
      const chosen = this.chosenOption()
      this.pushArtifactItem({
        id: 'art-transcript',
        title: 'Call Transcript',
        titleZh: '通话转写',
        status: 'VALIDATED',
        version: 1,
        createdAt: rt,
        data: {
          type: 'callTranscript',
          recordingId: 'rec-20260525-1436',
          duration: '4 分 12 秒',
          lines: [
            { speaker: 'Alice', text: `Mr. Chan，三个方案我刚发你了，票息分别是 ${this.clientQuoteOptions().map((o) => `${o.coupon.toFixed(2)}%`).join(' / ')}。` },
            { speaker: 'Mr. Chan', text: `我选${chosen?.label.replace('变体 ', '').replace(/^[A-C] · /, '') ?? '不设赎回'}那个吧，我看好腾讯，要是涨回去就被提前赎回了反而可惜。`, highlight: true },
            { speaker: 'Alice', text: '好的，金额和时间还是按之前说的？' },
            { speaker: 'Mr. Chan', text: 'USD 1,000,000，请今天内帮我执行。', highlight: true },
          ],
          intent: '执行确认 · Proceed to execute',
          confidence: 'High · 92%',
        },
      })
      this.addAudit({
        time: rt,
        actor: 'AI Copilot',
        actorRole: 'AI',
        action: '通话录音已转写（rec-20260525-1436 · 4 分 12 秒）',
        priorState: 'WAITING_FOR_CLIENT',
        newState: 'CLIENT_RESPONSE_RECEIVED',
      })
      this.receiveClientReply('phone')
    })
  }

  /** 客户回复到达（两条渠道汇合到同一段指令识别） */
  private receiveClientReply(channel: 'email' | 'phone') {
    const rt = setClock('14:36')
    this.push({ kind: 'human', id: uid('tl'), author: PEOPLE.rm, time: rt, text: CLIENT_REPLY, quote: true })
    this.patchTruth({ status: 'CLIENT_RESPONSE_RECEIVED', statusLabel: '收到客户回复', statusTone: 'warning', waitingOn: null })
    this.runProcessing(['AI 识别到一条可能的客户指令...', '正在结构化指令内容...'], 850, () => {
      const ct = setClock('14:37')
      const byEmail = channel === 'email'
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
          summary: `AI 识别到一条可能的客户指令：客户从 ${this.clientQuoteOptionCount()} 个选项中选定「${this.chosenOption()?.label ?? '—'}」，按 ${this.chosenOption()?.issuer ?? '—'} 报价条款执行 USD 1,000,000，今日内完成。请 RM 复核确认。`,
          terms: [
            { label: 'Selected Option', value: `${this.chosenOption()?.label ?? '—'}（客户从 ${this.clientQuoteOptionCount()} 个选项中选定）` },
            { label: 'Issuer', value: this.chosenOption()?.issuer ?? 'Morgan Stanley' },
            { label: 'Product', value: 'FCN · 0700.HK · 6M' },
            { label: 'Notional', value: 'USD 1,000,000' },
            { label: 'Strike / KI', value: `${this.chosenOption()?.terms.find((x) => x.label === 'Strike')?.value ?? '80%'} / ${this.approvedKI()}` },
            { label: 'Autocall', value: this.chosenOption()?.terms.find((x) => x.label === 'Autocall')?.value ?? '—' },
            { label: 'Timing', value: '今日内执行' },
            { label: 'Confirmation Record', value: byEmail ? '客户邮件回复已归档（对客邮件 · 14:27 发出）' : '通话录音 rec-20260525-1436 已转写归档' },
          ],
          confidence: 'High · 92%',
          sourceRef: byEmail ? '客户邮件回复 · 14:36' : '通话转写 rec-20260525-1436 · 14:36',
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

  // ── Step 6: 客户指令确认 → 装配给上手的下单指令 ────────────────────
  // 对客条款在这一刻锁死。往后上手价怎么动都不改对客承诺——
  // 所以流程上不设"执行前刷新报价"这一步（刷了也没用）。
  private doConfirmInstruction() {
    const t = setClock('14:38')
    this.updateArtifact('art-inst', { status: 'CONFIRMED', approvedMeta: `Alice · RM · ${t} 确认为正式客户指令` })
    this.systemEvent('check', '客户指令已确认 · 对客条款锁死', `Alice · RM · ${t} · 交给 Ken · Dealer 代客下单`, 'success')
    this.formalTransition('confirmInstruction', {
      time: t,
      truth: { waitingOn: null, nextAction: 'AI 装配下单指令，Dealer 复核后代客下单' },
    })
    this.addChange('客户指令 Confirmed · 对客价锁死', `Alice · RM · ${t}`)

    this.later(700, () => {
      this.runProcessing(
        ['正在把已确认指令装配成给上手方的下单指令...', '正在核对执行前控制项...'],
        850,
        () => {
          const ct = setClock('14:39')
          const opt = this.chosenOption()
          const strike = opt?.terms.find((x) => x.label === 'Strike')?.value ?? '80%'
          const autocall = opt?.terms.find((x) => x.label === 'Autocall')?.value ?? '—'
          this.pushArtifactItem({
            id: 'art-ticket',
            title: 'Order Instruction',
            titleZh: '下单指令',
            status: 'DRAFT',
            version: 1,
            createdAt: ct,
            data: {
              type: 'executionTicket',
              fields: [
                { label: 'Issuer', value: opt?.issuer ?? 'Morgan Stanley' },
                { label: 'Channel', value: '指令形式（场外 · 不走询价接口）' },
                { label: 'Underlying', value: 'Tencent / 0700.HK' },
                { label: 'Notional', value: 'USD 1,000,000' },
                { label: 'Tenor', value: '6M' },
                { label: 'Strike', value: strike },
                { label: 'Knock-In', value: this.approvedKI() },
                { label: 'Autocall', value: autocall },
                { label: 'Client Coupon (locked)', value: `${(opt?.coupon ?? 0).toFixed(2)}% p.a.` },
                { label: 'Settlement', value: 'T+2' },
              ],
              quoteTime: `${ct} HKT`,
              validityUntil: null,
              note: `对客票息 ${(opt?.coupon ?? 0).toFixed(2)}% 已随客户指令锁死。向上手方的成交价在下单后才确定，两者之差即本单实际价差（登记 ${SPREAD_POLICY.registeredBp}bp）。`,
              preTradeChecks: [
                { label: '客户指令已确认', status: 'passed', detail: `Alice · RM · ${t} · 电话录音与邮件均已归档` },
                { label: '条款与已批准结构一致', status: 'passed', detail: `KI ${this.approvedKI()} · Strike ${strike} · 6M，与客户确认的变体一致` },
                { label: '适当性（下单前复检）', status: 'passed', detail: POLICIES.suitability.passZh },
                {
                  label: '验资验券 / 冻结客户资券',
                  status: 'unconfirmed',
                  detail: '内核检查点 · AI 只读结果不参与',
                },
              ],
            },
          })
          this.patchTruth({
            status: 'EXECUTION_READY',
            statusLabel: '待下单',
            statusTone: 'warning',
            waitingOn: null,
            nextAction: 'Dealer 复核下单指令并代客下单',
          })
          this.addAudit({
            time: ct,
            actor: 'AI Copilot',
            actorRole: 'AI',
            action: '已装配 Order Instruction（对客条款锁死，执行前控制项已核对）',
            priorState: 'CLIENT_INSTRUCTION_CONFIRMED',
            newState: 'EXECUTION_READY',
          })
        },
      )
    })
  }

  // ── Step 7: 代客下单 → 上手成交 → 价差核算 → 交易登记记录 ──────────
  private doExecuteTrade() {
    const t = setClock('14:41')
    const opt = this.chosenOption()
    const clientC = opt?.coupon ?? 10.62
    this.updateArtifact('art-ticket', { status: 'EXECUTED', approvedMeta: `Ken · Dealer · ${t} 已代客下单` })
    this.systemEvent('send', `下单指令已发出 → ${opt?.issuer ?? 'Morgan Stanley'}（场外指令，非接口）`, `Ken · Dealer · ${t}`, 'success')
    this.formalTransition('executeTrade', {
      time: t,
      truth: { waitingOn: `${opt?.issuer ?? 'MS'}（成交回报）`, nextAction: '等待上手方成交回报' },
    })
    this.addChange('已代客下单', `Ken · Dealer · ${t}`)

    this.later(2000, () => {
      const rt = setClock('14:44')
      // 下单时才拿到 firm 价：比询价时的 indicative 差了一点（市场移动）。
      // 对客价锁死不动，被压缩的是券商的价差。
      const fill = +(clientC + 0.23).toFixed(2)
      // 场外成交没有接口回报——发行商发来的是一封确认邮件。这是它的正文要素。
      this.systemEvent('mail', `${opt?.issuer ?? 'MS'} 成交确认邮件已收到（${fill.toFixed(2)}%）`, `${rt} · 待交易员核对`, 'neutral', ['dealer', 'ops'])
      this.runProcessing(['正在读取上手方成交确认邮件...', '正在与已确认指令逐项比对...', '正在核算本单实际价差...'], 850, () => {
        const ct = setClock('14:45')
        const bp = realisedBp(fill, clientC)
        const breached = spreadBreached(fill, clientC)
        const strike = opt?.terms.find((x) => x.label === 'Strike')?.value ?? '80%'
        const issuer = opt?.issuer ?? 'Morgan Stanley'
        const ki = this.approvedKI()
        const ticket = 'MS-FCN-20250516-0731'
        // 从确认邮件抽出来的值。改这里任意一项，交易员那屏就会亮出「与指令不符」——
        // 演示"上手方发错确认"这个分支不需要另写代码。
        const extracted: Record<string, string> = {
          issuer,
          underlying: 'Tencent / 0700.HK',
          notional: 'USD 1,000,000',
          strike,
          ki,
          fill: `${fill.toFixed(2)}% p.a.`,
          tradeDate: '2025-05-16 14:43 HKT',
          settlement: 'T+2',
          ticket,
          clientCoupon: `${clientC.toFixed(2)}% p.a.（客户确认时锁死）`,
        }
        // 比对基准是已确认指令，不是别的抽取结果——两份抽取互相比对不出错
        const inst = this.state.artifacts['art-ticket']
        const instField = (label: string) =>
          inst?.data.type === 'executionTicket' ? inst.data.fields.find((f) => f.label === label)?.value : undefined
        const expected: Record<string, string> = {
          issuer: instField('Issuer') ?? issuer,
          underlying: instField('Underlying') ?? 'Tencent / 0700.HK',
          notional: instField('Notional') ?? 'USD 1,000,000',
          strike: instField('Strike') ?? strike,
          ki: instField('Knock-In') ?? ki,
          settlement: instField('Settlement') ?? 'T+2',
        }
        this.pushArtifactItem({
          id: 'art-rec',
          title: 'Trade Record',
          titleZh: '交易登记记录',
          status: 'PENDING REVIEW',
          version: 1,
          createdAt: ct,
          data: {
            type: 'tradeRecord',
            fields: [
              { label: 'Direction', value: '代客买入 · Buy' },
              { label: 'Issuer', value: issuer },
              { label: 'Underlying', value: 'Tencent / 0700.HK' },
              { label: 'Notional', value: 'USD 1,000,000' },
              { label: 'Strike', value: strike },
              { label: 'Knock-In', value: ki },
              { label: 'Issuer Fill Coupon', value: `${fill.toFixed(2)}% p.a.` },
              { label: 'Client Coupon', value: `${clientC.toFixed(2)}% p.a.（客户确认时锁死）` },
              { label: 'Settlement', value: 'T+2' },
              { label: 'Ticket', value: ticket },
            ],
            extracted,
            expected,
            confirmEmail: {
              issuer,
              notional: 'USD 1,000,000',
              strike,
              ki,
              fill: `${fill.toFixed(2)}%`,
              tradeTime: '16 May 2025, 14:43 HKT',
              settlement: 'T+2',
              ticket,
            },
            spread: {
              mode: SPREAD_MODES[SPREAD_POLICY.mode].labelZh,
              clientCoupon: clientC,
              issuerFillCoupon: fill,
              registeredBp: SPREAD_POLICY.registeredBp,
              realisedBp: bp,
              thresholdBp: SPREAD_POLICY.alertThresholdBp,
              breached,
            },
            replacesNote:
              '真实流程里这一步是交易员照着上手方的成交确认邮件手打一张 Excel，再 share 给 Trade Support 重新录入簿记——两次手工录入，第二次在抄第一次。这条记录由系统直接从那封确认邮件抽取，交易员只需核对；Trade Support 的簿记再从这条记录来，两次手打都消掉。',
          },
        })
        if (breached) {
          this.systemEvent(
            'alert',
            `本单实际价差 ${bp}bp，低于阈值 ${SPREAD_POLICY.alertThresholdBp}bp（登记 ${SPREAD_POLICY.registeredBp}bp）`,
            `AI 价差核算 · ${ct} · 仅交易台可见`,
            'warning',
            ['dealer', 'ops'],
          )
        }
        // 先过交易员这一关。他是唯一知道"我到底跟谁、以什么价成交"的人——
        // 这张记录必须由他签字才有归属，Trade Support 拿到的才是有主的东西。
        this.patchTruth({
          status: 'TRADE_RECORD_REVIEW',
          statusLabel: '待交易员核对成交要素',
          statusTone: 'warning',
          waitingOn: null,
          nextAction: 'Ken 核对上手方成交确认邮件并登记',
          alerts: breached
            ? [
                {
                  id: 'al-spread',
                  severity: 'warning',
                  title: `实际价差 ${bp}bp 低于阈值`,
                  detail: `对客票息 ${clientC.toFixed(2)}% 在客户确认时锁死；上手成交 ${fill.toFixed(2)}%，实际价差 ${bp}bp < 阈值 ${SPREAD_POLICY.alertThresholdBp}bp。属内部损益问题，不影响客户已确认条款，不需要与客户沟通。`,
                  owner: 'Dealer',
                  actions: ['记录说明', '上报交易主管'],
                },
                ...this.state.truth.alerts,
              ]
            : this.state.truth.alerts,
        })
        this.addChange(`已成交 @ ${fill.toFixed(2)}% · 实际价差 ${bp}bp`, `${opt?.issuer ?? 'MS'} · ${rt}`)
        this.addAudit({
          time: ct,
          actor: 'AI Copilot',
          actorRole: 'AI',
          action: `已从 ${issuer} 成交确认邮件抽取交易要素：与已确认指令逐项比对 ${Object.keys(expected).length} 项，成交票息 ${fill.toFixed(2)}% 为新信息 / 实际价差 ${bp}bp（登记 ${SPREAD_POLICY.registeredBp}bp）`,
          detail: breached ? `低于阈值 ${SPREAD_POLICY.alertThresholdBp}bp，已内部预警` : undefined,
          priorState: 'EXECUTED',
          newState: 'TRADE_RECORD_REVIEW',
        })
        this.pushContextBrief(
          PEOPLE.dealer,
          'Trade confirmation · 成交要素核对',
          [
            `${issuer} 的成交确认邮件已到（${rt}）。可比对的要素已逐项对过已确认指令。`,
            `成交票息 ${fill.toFixed(2)}% 是这封邮件带来的新信息——内部没有可比对象，只有你知道成交在哪个价。`,
            '你登记之后，Trade Support 的簿记直接从这条记录来，不再手工转抄。',
          ],
          [{ label: 'Trade Record · 交易登记记录', artifactId: 'art-rec' }],
          '核对成交要素并登记',
        )
      })
    })
  }

  // ── Step 7a2: 交易员核对成交确认邮件的抽取结果并登记 ────────────────
  private doConfirmTradeRecord() {
    const t = setClock('14:48')
    this.updateArtifact('art-rec', { approvedMeta: `Ken · Dealer · ${t} 已核对成交要素并登记` })
    this.systemEvent('check', '成交要素已登记（源自上手方确认邮件，交易员核对）', `Ken · Dealer · ${t}`, 'success')
    this.formalTransition('confirmTradeRecord', {
      time: t,
      detail: '可比要素已与已确认指令逐项核平；成交票息由交易员本人确认。',
      truth: { waitingOn: null, nextAction: 'Trade Support 从交易登记记录录入簿记' },
    })
    this.addChange('成交要素已登记', `Ken · Dealer · ${t}`)
    this.pushContextBrief(
      PEOPLE.ops,
      'Booking & reconciliation · 簿记与核对',
      [
        'Ken 已核对上手方成交确认邮件并登记成交要素。',
        '簿记直接从这条登记记录来——不需要再从交易员的 Excel 手工抄一遍。',
        '录入簿记后，收到发行商条款书时将做三方比对：登记记录 / 簿记 / 条款书。',
      ],
      [{ label: 'Trade Record · 交易登记记录', artifactId: 'art-rec' }],
      '核对交易登记记录并录入簿记',
    )
  }

  // ── Step 7b: Trade Support 录入簿记 → 等条款书三方核对 ────────────
  private doConfirmBooking() {
    const t = setClock('14:52')
    this.updateArtifact('art-rec', { status: 'CONFIRMED', approvedMeta: `Mia · Trade Support · ${t} 已录入簿记` })
    this.systemEvent('check', '簿记已录入（源自交易登记记录，无手工转抄）', `Mia · Trade Support · ${t}`, 'success')
    this.formalTransition('confirmBooking', {
      time: t,
      truth: { waitingOn: 'Morgan Stanley（条款书）', nextAction: '等待发行商条款书并做三方核对' },
    })
    this.addChange('簿记已录入', `Mia · Trade Support · ${t}`)

    this.later(2200, () => {
      const rt = setClock('14:56')
      this.systemEvent('arrow', '已收到 Morgan Stanley Final Termsheet', rt)
      this.runProcessing(
        ['正在三方比对：交易登记记录 / 簿记 / 条款书...', '正在标记差异...'],
        900,
        () => {
          const ct = setClock('14:57')
          const opt = this.chosenOption()
          const clientC = (opt?.coupon ?? 10.62).toFixed(2)
          const strike = opt?.terms.find((x) => x.label === 'Strike')?.value ?? '80%'
          this.pushArtifactItem({
            id: 'art-tv',
            title: 'Termsheet Validation',
            titleZh: '条款书三方核对',
            status: 'PENDING APPROVAL',
            version: 1,
            createdAt: ct,
            data: {
              type: 'termsheetValidation',
              rows: (() => {
                const v: Record<string, Omit<TermsheetRow, 'field'>> = {
                  Notional: { ticket: 'USD 1,000,000', booking: 'USD 1,000,000', termsheet: 'USD 1,000,000', status: 'match' },
                  Underlying: { ticket: '0700.HK', booking: '0700.HK', termsheet: '0700.HK', status: 'match' },
                  Strike: { ticket: strike, booking: strike, termsheet: strike, status: 'match' },
                  'Knock-In': { ticket: this.approvedKI(), booking: this.approvedKI(), termsheet: this.approvedKI(), status: 'match' },
                  Coupon: { ticket: `${clientC}%（对客）`, booking: `${clientC}%（对客）`, termsheet: `${clientC}%`, status: 'match' },
                  Settlement: { ticket: 'T+2', booking: 'T+2', termsheet: 'T+3', status: 'warning' },
                }
                return TS_VALIDATION_FIELDS.map((field) => ({ field, ...v[field] }))
              })(),
              overall: '1 项差异待人工判断（登记记录与簿记一致，差异在发行商一侧）',
              recommended:
                'AI 标记：Settlement 登记记录 T+2 = 簿记 T+2 ≠ 条款书 T+3。内部两方一致，差异在发行商文档，建议请求更正版，无需客户重新确认。',
            },
          })
          this.patchTruth({
            status: 'TERMSHEET_REVIEW',
            statusLabel: '条款书待审批',
            statusTone: 'warning',
            waitingOn: null,
            nextAction: 'Trade Support 审批条款书或提出异常',
            alerts: [
              {
                id: 'al-ts',
                severity: 'warning',
                title: 'Termsheet 差异（发行商一侧）',
                detail: 'Settlement：交易登记记录 T+2 = 簿记 T+2 ≠ 条款书 T+3。内部两方一致，差异指向发行商文档。',
                owner: 'Mia · Trade Support',
                actions: ['提出异常', '核实后审批'],
              },
              ...this.state.truth.alerts,
            ],
          })
          this.addAudit({
            time: ct,
            actor: 'AI Copilot',
            actorRole: 'AI',
            action: '已三方核对 Termsheet：登记记录 / 簿记 / 条款书，5 项一致，1 项差异（Settlement · 发行商一侧）',
            priorState: 'BOOKING_REVIEW',
            newState: 'TERMSHEET_REVIEW',
          })
        },
      )
    })
  }

  // ── Step 8: Termsheet approval / exception ─────────────────────────────
  private doRaiseException() {
    const t = setClock('14:55')
    this.updateArtifact('art-tv', { status: 'EXCEPTION' })
    this.systemEvent('flag', '已提出异常：Settlement 差异（T+2 vs T+3）', `Mia · Trade Support · ${t}`, 'critical')
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
          detail: '解决路径：联系 MS 确认正确结算日 → 核实结果回填 → Trade Support 重新审批条款书。',
          owner: 'Mia · Trade Support',
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
    this.systemEvent('check', '已与 MS 核实：T+2 正确，条款书已更正重发', `Mia · Trade Support · ${t}`, 'success')
    this.formalTransition('resolveException', {
      time: t,
      truth: {
        stageException: false,
        nextAction: 'Trade Support 审批更正后的条款书',
        alerts: this.state.truth.alerts.filter((x) => x.id !== 'al-exc'),
      },
    })
  }

  private doApproveTermsheet() {
    const t = setClock('15:00')
    this.updateArtifact('art-tv', { status: 'APPROVED', approvedMeta: `Mia · 簿记 / 核对 · ${t} 审批` })
    this.systemEvent('check', `Termsheet 已审批（${POLICIES.segregation.passZh}）`, `Mia · Trade Support · ${t}`, 'success')
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
