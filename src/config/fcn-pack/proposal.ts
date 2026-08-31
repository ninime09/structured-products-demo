// 结构方向建议的**结构化定义**——接模型前最该做的一步。
//
// 为什么不能是一段散文：
//  1. 审计要记"改了什么"。自由文本上做 diff 不可靠——模型换个措辞就一堆噪音。
//     对象之间的 diff 是确定性的。
//  2. 模型出 v2 时可能悄悄丢掉约束（比如忘了集中度上限）。约束放在
//     constraints 块里由代码校验，模型就丢不掉。
//  3. 同一份定义驱动模型输出（schema 约束）、界面渲染、和完整性检查。
//
// 正文由 renderProposal() 从对象生成，不是反过来从正文解析。

import { couponRange } from '../mock-data/market'
import { issuerCoverage } from '../mock-data/catalog'

export interface DirectionOption {
  id: string
  /** 展示序号，渲染时按数组顺序重排，不用手工维护 */
  label: string
  underlyings: string[]
  ki: number
  /** 相对客户目标的判断：达标 / 不达标 */
  meetsTarget: boolean
  note: string
}

export interface ProposalConstraints {
  /** 本行单一标的敞口上限 */
  concentrationCap: number
  currentExposure: number
  exposureIfKnockedIn: number
  /** 客户目标年化（%） */
  targetYield: number
  /** 客户风险承受度描述 */
  riskTolerance: string
}

export interface DirectionProposal {
  version: number
  clientStated: string
  inferred: string
  evidenceHoldings: string[]
  evidenceProfile: string[]
  directions: DirectionOption[]
  constraints: ProposalConstraints
  /** 本人修改说明（结构化编辑时自动生成，自由编辑时留空） */
  revisionNote?: string
  pricingAsOf: string
}

/** 喂给模型的 JSON Schema——同一份定义既约束输出，也驱动渲染 */
export const PROPOSAL_SCHEMA = {
  type: 'object',
  required: ['clientStated', 'inferred', 'evidenceHoldings', 'evidenceProfile', 'directions', 'constraints'],
  properties: {
    clientStated: { type: 'string', description: '客户明确表达的内容，不得加入未说过的信息' },
    inferred: { type: 'string', description: 'AI 从表达推断的标的范围，须注明非客户原话' },
    evidenceHoldings: { type: 'array', items: { type: 'string' }, description: '来自 crm.holdings 的推导依据，数值必须来自工具调用' },
    evidenceProfile: { type: 'array', items: { type: 'string' }, description: '来自 crm.client_profile 的推导依据' },
    directions: {
      type: 'array',
      minItems: 2,
      maxItems: 4,
      items: {
        type: 'object',
        required: ['id', 'label', 'underlyings', 'ki', 'meetsTarget', 'note'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          underlyings: { type: 'array', items: { type: 'string' } },
          ki: { type: 'number' },
          meetsTarget: { type: 'boolean' },
          note: { type: 'string' },
        },
      },
    },
  },
} as const

// ── 校验：模型丢不掉硬约束 ─────────────────────────────────────────────
export interface ValidationIssue {
  field: string
  message: string
}

/**
 * 结构化校验。模型出的对象必须过这一关才能落到私区。
 * 这些都是可判定的，不需要再问模型。
 */
export function validateProposal(p: DirectionProposal): ValidationIssue[] {
  const out: ValidationIssue[] = []
  if (p.directions.length < 2) out.push({ field: 'directions', message: '至少要给两个方向供比较' })
  for (const d of p.directions) {
    if (!d.underlyings.length) out.push({ field: `directions.${d.id}`, message: '缺少标的' })
    if (d.ki <= 0 || d.ki >= 100) out.push({ field: `directions.${d.id}.ki`, message: `KI ${d.ki} 不在合理区间` })
    // 票息不由模型给：这里按 KI/标的重算，模型只负责叙述
    const mid = midCoupon(d)
    if (d.meetsTarget !== mid >= p.constraints.targetYield) {
      out.push({ field: `directions.${d.id}.meetsTarget`, message: `达标判断与定价结果不符（${mid.toFixed(2)}% vs 目标 ${p.constraints.targetYield}%）` })
    }
  }
  if (p.constraints.exposureIfKnockedIn > p.constraints.concentrationCap) {
    out.push({ field: 'constraints', message: '接股后敞口已超上限，不应作为可行方向提出' })
  }
  return out
}

function midCoupon(d: DirectionOption): number {
  const r = couponRange({ underlyings: d.underlyings, ki: d.ki })
  const [lo, hi] = r.replace('%', '').split('–').map(Number)
  return (lo + hi) / 2
}

// ── 结构化编辑：改的是对象，diff 因此是确定的 ──────────────────────────
export function removeDirection(p: DirectionProposal, id: string, reason: string): DirectionProposal {
  return {
    ...p,
    version: p.version + 1,
    directions: p.directions.filter((d) => d.id !== id),
    revisionNote: [p.revisionNote, reason].filter(Boolean).join('；'),
  }
}

export function setKi(p: DirectionProposal, id: string, ki: number, reason: string): DirectionProposal {
  return {
    ...p,
    version: p.version + 1,
    directions: p.directions.map((d) => {
      if (d.id !== id) return d
      const next = { ...d, ki }
      return { ...next, meetsTarget: midCoupon(next) >= p.constraints.targetYield }
    }),
    revisionNote: [p.revisionNote, reason].filter(Boolean).join('；'),
  }
}

/**
 * 对象之间的 diff——审计记的就是这个，不猜语义。
 *
 * 改稿由模型整份重出，它可能顺手动没被点名的地方。所以这里不能只盯 KI 和标的：
 * 叙述性字段（label / note / 客户原话 / 推断 / 推导依据）一样要报出来，
 * 否则"悄悄改写"就成了审计的盲区。文字改动只报"改了哪一处"，不贴全文——
 * 全文对比在版本卡上看，审计要的是一行能扫过去的清单。
 */
export function diffProposal(a: DirectionProposal, b: DirectionProposal): string[] {
  const out: string[] = []
  for (const d of a.directions) {
    if (!b.directions.some((x) => x.id === d.id)) out.push(`删除方向「${d.label}」`)
  }
  for (const d of b.directions) {
    const prev = a.directions.find((x) => x.id === d.id)
    if (!prev) { out.push(`新增方向「${d.label}」`); continue }
    if (prev.ki !== d.ki) out.push(`「${d.label}」KI ${prev.ki}% → ${d.ki}%`)
    if (prev.underlyings.join() !== d.underlyings.join()) out.push(`「${d.label}」标的 ${prev.underlyings.join('+')} → ${d.underlyings.join('+')}`)
    if (prev.label !== d.label) out.push(`方向名称「${prev.label}」→「${d.label}」`)
    if (prev.note !== d.note) out.push(`「${d.label}」取舍说明已改写`)
  }
  // 顺序也是信息：谁排第一就是在推荐谁
  const order = (p: DirectionProposal) => p.directions.map((d) => d.id).join('>')
  if (out.length === 0 && order(a) !== order(b)) out.push('方向排序调整')
  if (a.clientStated !== b.clientStated) out.push('「客户明确说的」已改写')
  if (a.inferred !== b.inferred) out.push('「AI 推断」已改写')
  if (a.evidenceHoldings.join('\n') !== b.evidenceHoldings.join('\n')) out.push('持仓与集中度推导依据已改写')
  if (a.evidenceProfile.join('\n') !== b.evidenceProfile.join('\n')) out.push('客户档案推导依据已改写')
  return out
}

// ── 渲染：正文从对象生成 ───────────────────────────────────────────────
const NUM = ['①', '②', '③', '④']
const CN_NUM: Record<number, string> = { 1: '一', 2: '两', 3: '三', 4: '四' }

export function renderProposal(p: DirectionProposal): string {
  // 输出 markdown：界面上由 DraftBody 渲染成层级，复制出去也是可读的原文。
  // 只用 ## / ** / - 三种标记，解析器就在 TradeRoom 里，不引库。
  const lines: string[] = []
  lines.push('## 客户明确说的')
  lines.push(p.clientStated)
  lines.push('')
  lines.push('## AI 推断（非客户原话，未经确认）')
  lines.push(p.inferred)
  lines.push('')

  // 方向是他要拿来做决定的东西，一个方向一块，字段拆行——
  // 挤成一行长句的话，票息、家数、取舍全糊在一起，没法比
  lines.push(`## ${CN_NUM[p.directions.length] ?? p.directions.length}个方向 · 均为 working assumption，未经客户确认`)
  p.directions.forEach((d, i) => {
    const cov = issuerCoverage(d.underlyings)
    lines.push('')
    lines.push(`${NUM[i] ?? `${i + 1}.`} **${d.label} · KI ${d.ki}%**`)
    lines.push(`- 指示票息 **${couponRange({ underlyings: d.underlyings, ki: d.ki })}** · 可报 ${cov.length} 家（${cov.join(' · ')}）`)
    if (d.note) lines.push(`- ${d.note}`)
  })

  lines.push('')
  lines.push('## 推导依据 · 持仓与集中度')
  p.evidenceHoldings.forEach((e) => lines.push(`- ${e}`))
  lines.push('')
  lines.push('## 推导依据 · 客户档案')
  p.evidenceProfile.forEach((e) => lines.push(`- ${e}`))

  if (p.revisionNote) {
    lines.push('')
    lines.push(`## David 修改`)
    lines.push(p.revisionNote)
  }
  lines.push('')
  lines.push(`⚠ 指示性区间（内部定价 stub · ${p.pricingAsOf}），不构成报价，最终票息以询价结果为准。`)
  return lines.join('\n')
}

/**
 * 产品专家的标准改稿动作，写成规则而不是写死 id——
 * 这样无论方向是脚本给的还是模型生成的，同一套判断都成立：
 *  1. 删掉达不到客户目标收益的方向（不必占用客户注意力）
 *  2. 把缓冲最薄的单一标的方向压到 65%（集中度逼近上限 + 客户有薄缓冲拒绝记录）
 */
export function applySpecialistRevision(p: DirectionProposal): DirectionProposal {
  let next = p
  for (const d of p.directions.filter((x) => !x.meetsTarget)) {
    next = removeDirection(next, d.id, `删除「${d.label}」（indicative 达不到客户 ${p.constraints.targetYield}% 目标，不必占用客户注意力）`)
  }
  const thin = next.directions
    .filter((d) => d.underlyings.length === 1 && d.ki > 65)
    .sort((a, b) => b.ki - a.ki)[0]
  if (thin) {
    next = setKi(next, thin.id, 65, `「${thin.label}」KI 由 ${thin.ki}% 压到 65%（集中度已逼近上限 ${p.constraints.concentrationCap}%，且客户对薄缓冲有拒绝记录）`)
  }
  return { ...next, version: p.version + 1 }
}
