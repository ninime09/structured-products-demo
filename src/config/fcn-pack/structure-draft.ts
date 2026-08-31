// 交易要素初稿的结构化定义。
//
// 和方向建议同构：模型输出**对象**，界面由同一个渲染器画。
// 之前这一步是一段自由文本，"改了什么"只能靠 diff 猜，变体存活与否要靠字符串匹配
// （variantsFromDraftText）——那正是"被审计的东西必须是结构化的"要解决的问题。
//
// 分权同前：模型定可调参数（Strike / Autocall / 票息支付）和取舍说明；
// 票息区间、发行商覆盖度、适当性结论一律由代码和工具算。

import { couponRange } from '../mock-data/market'
import { issuerCoverage } from '../mock-data/catalog'
import type { StructureOption, TermRow } from '../../types'

export interface StructureVariant {
  id: string
  label: string
  /** 可调参数 —— 模型能决定的就这三个 */
  strike: number
  autocall: string
  payment: string
  rationale: string
  tradeoff: string
  risks: string[]
}

export interface StructureDraft {
  version: number
  /** 客户已确认、结构阶段锁死的要素 */
  locked: TermRow[]
  underlyings: string[]
  ki: number
  variants: StructureVariant[]
  /** 由 check_suitability 工具给出，模型不得自行判断 */
  suitability: { pass: boolean; note: string }
  pricingAsOf: string
  revisionNote?: string
}

export const STRIKES = [75, 80, 85, 90]
export const AUTOCALLS = ['月度观察 · 自第 2 月起', '月度观察 · 自第 3 月起', '季度观察', '无 autocall']
export const PAYMENTS = ['月付', '季付', '到期一次付']

export interface DraftIssue { field: string; message: string }

/** 结构校验：参数必须落在合法域里，变体不能重复 */
export function validateStructureDraft(d: StructureDraft): DraftIssue[] {
  const out: DraftIssue[] = []
  if (d.variants.length < 2) out.push({ field: 'variants', message: '至少需要 2 个可比变体' })
  const seen = new Set<string>()
  d.variants.forEach((v, i) => {
    const at = `variants[${i}]`
    if (!STRIKES.includes(v.strike)) out.push({ field: at, message: `Strike ${v.strike}% 不在合法档位内` })
    if (!AUTOCALLS.includes(v.autocall)) out.push({ field: at, message: `Autocall「${v.autocall}」不在合法取值内` })
    if (!PAYMENTS.includes(v.payment)) out.push({ field: at, message: `票息支付「${v.payment}」不在合法取值内` })
    const sig = `${v.strike}|${v.autocall}|${v.payment}`
    if (seen.has(sig)) out.push({ field: at, message: '与另一个变体参数完全相同' })
    seen.add(sig)
  })
  return out
}

const couponOf = (d: StructureDraft, v: StructureVariant) =>
  couponRange({ underlyings: d.underlyings, ki: d.ki, strike: v.strike, autocall: v.autocall })

/** 渲染成 markdown —— 界面和复制出去的是同一份 */
export function renderStructureDraft(d: StructureDraft): string {
  const lines: string[] = []
  lines.push('## 客户确认约束（锁死，不可调）')
  d.locked.forEach((l) => lines.push(`- ${l.label} ${l.value}`))
  lines.push('')
  lines.push(`## ${d.variants.length} 个变体 · 只在产品专家可调的参数上不同`)
  d.variants.forEach((v, i) => {
    lines.push('')
    lines.push(`${NUM[i] ?? `${i + 1}.`} **${v.label} · Strike ${v.strike}% · ${v.autocall} · ${v.payment}**`)
    lines.push(`- 指示票息 **${couponOf(d, v)}** · 可报 ${issuerCoverage(d.underlyings).length} 家`)
    lines.push(`- ${v.rationale}`)
    if (v.tradeoff) lines.push(`- 取舍：${v.tradeoff}`)
    v.risks.forEach((r) => lines.push(`- 风险：${r}`))
  })
  lines.push('')
  lines.push('## 适当性预检')
  lines.push(d.suitability.note)
  if (d.revisionNote) {
    lines.push('')
    lines.push('## David 修改')
    lines.push(d.revisionNote)
  }
  lines.push('')
  lines.push(`⚠ 指示性区间（内部定价 stub · ${d.pricingAsOf}），不构成报价，最终票息以询价结果为准。`)
  return lines.join('\n')
}

const NUM = ['①', '②', '③', '④']

/** 转成产物用的 StructureOption —— 票息与覆盖度在这里由代码填 */
export function toStructureOptions(d: StructureDraft): StructureOption[] {
  return d.variants.map((v) => ({
    optionId: v.id,
    label: v.label,
    tone: v.autocall === '无 autocall' ? 'No autocall' : v.strike >= 85 ? 'Higher strike' : 'Baseline',
    productType: 'FCN',
    tenor: '6M',
    strike: `${v.strike}%`,
    knockIn: `${d.ki}%`,
    autocall: v.autocall,
    couponTarget: `${couponOf(d, v)} p.a. · ${v.payment}`,
    rationale: v.rationale,
    tradeoff: v.tradeoff,
    risks: v.risks,
    issuerCoverage: `${issuerCoverage(d.underlyings).length} 家可报（${issuerCoverage(d.underlyings).join(' · ')}）`,
  }))
}

/** 删一个变体（产品专家的标准改稿动作），返回新版本 */
export function removeVariant(d: StructureDraft, id: string, why: string): StructureDraft {
  const gone = d.variants.find((v) => v.id === id)
  if (!gone || d.variants.length <= 2) return d
  return {
    ...d,
    version: d.version + 1,
    variants: d.variants.filter((v) => v.id !== id),
    revisionNote: `删除「${gone.label}」：${why}`,
  }
}
