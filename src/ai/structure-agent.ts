// 结构 agent：把已确认的客户需求 + 需求阶段选定的方向，收敛成可询价的交易要素。
//
// 它不是"从头设计产品"——方向讨论已经把范围收窄了。它做的是把 working assumption
// 变成一组可以直接发出去询价的参数组合。
//
// 分权：
//  模型定「可调参数」——Strike、Autocall 观察、票息支付，以及每个变体的取舍说明。
//  模型不碰「锁定要素」——标的、KI、期限、名义本金、接货意愿是客户确认过的，改了就是越权。
//  模型不产出票息、发行商覆盖度、适当性结论——分别由 couponRange / issuerCoverage /
//  check_suitability 给出。

import { runAgent } from './agent'
import { parseAgentJson } from './json'
import { assembleContext, describeSlices } from './context'
import type { ContextSlice, ContextSource } from './context'
import type { AgentStep } from './agent'
import { MARKET_SNAPSHOT } from '../config/mock-data/market'
import { AUTOCALLS, PAYMENTS, STRIKES, validateStructureDraft } from '../config/fcn-pack/structure-draft'
import type { StructureDraft, StructureVariant } from '../config/fcn-pack/structure-draft'
import type { TermRow } from '../types'

const SKILL = 'structure-comparator'

const SYSTEM = `你是华泰国际结构化产品台产品专家（IC）的 agent。
客户需求已经确认、方向也已经定了。你的任务：把它收敛成 2–3 个可以直接发出去询价的交易要素变体。

先做两件事，不做完不许出方案：
· 调 structure_template 拿这个产品的合法参数域。Strike、Autocall、票息支付只能从里面选，不得自己发明取值。
· 调 check_suitability 做适当性预检。结论以工具返回为准，你不得自行判断"应该没问题"。

设计规则：
· 锁定要素（标的 / KI / 期限 / 名义本金 / 接货意愿）是客户确认过的，你一个都不能改。
  所有变体共用这些要素，只在可调参数上不同——这是它们能放进同一份 RFQ 比价的前提。
· 变体之间必须真的构成取舍，不要给三个差不多的东西。典型的三条轴：
  接股价高低（Strike）、被提前赎回的概率（Autocall）、现金流节奏（票息支付）。
· 每个变体都要写清"为什么给他这个"和"代价是什么"，依据客户的历史交易与拒绝记录。
· 不要在文字里写任何票息百分比——票息由系统按你给的参数算出来后填入。

全程简体中文。过程叙述一句话、40 字以内、纯文本，不要 markdown 标记，不要复述工具返回的数字。
查够了直接输出 JSON，不要先写总结。

最终 JSON（不要代码块）：
{
  "variants": [
    {
      "id": "opt-a",
      "label": "变体名，最多 8 个字，只说它的取向（例如「基准」「接股价更高」「不设赎回」）。不要把参数写进名字——参数会自动跟在后面显示。",
      "strike": 80,
      "autocall": "从合法取值里选",
      "payment": "从合法取值里选",
      "rationale": "为什么给客户这个变体",
      "tradeoff": "相对其他变体的代价",
      "risks": ["风险点", "风险点"]
    }
  ]
}`

export interface StructureResult {
  draft: StructureDraft
  source: 'live' | 'script' | 'fallback'
  ms?: number
  reason?: string
  rounds?: number
  toolCalls?: number
  /** 这次装配了哪几块上下文 */
  slices?: string
}

/**
 * 声明要哪几块上下文。
 * room.discussion 是刻意加的：需求阶段 Alice 否掉过什么、为什么否，
 * 直接决定这里该往哪个方向收敛——之前这个 agent 只拿到一个 directions 数组，看不见争论。
 */
export const SLICES: ContextSlice[] = [
  'case.truth', 'need.brief', 'room.discussion', 'artifact.current', 'prior.version',
]

export interface StructureContext {
  locked: TermRow[]
  underlyings: string[]
  ki: number
  /** 需求阶段选定的方向，作为设计的出发点 */
  directionNote: string
}

/**
 * 生成交易要素初稿。
 * 任何一步出问题都回退脚本版——现场看不出区别。
 */
export async function generateStructure(
  ctx: StructureContext,
  fallback: StructureDraft,
  onStep?: (steps: AgentStep[]) => void,
  src?: ContextSource,
): Promise<StructureResult> {
  if (!onStep || !src) return { draft: fallback, source: 'script' }

  const assembled = assembleContext(src, SLICES)
  const user = [
    assembled.text,
    '',
    '【锁定要素 —— 客户确认过，一个都不能改】',
    ...ctx.locked.map((l) => `${l.label}：${l.value}`),
    '',
    '【需求阶段定下来的方向】',
    ctx.directionNote,
    '',
    '请给出 2–3 个可比的交易要素变体。上面的讨论里如果有人否过某个取向，别再端回来。',
  ].join('\n')

  const run = await runAgent({
    skill: SKILL,
    system: SYSTEM,
    user,
    tools: ['structure_template', 'check_suitability', 'get_client_profile', 'issuer_coverage'],
    maxRounds: 5,
    jsonFinal: true,
    onStep,
    timeoutMs: 40_000,
  })
  if (run.source !== 'live' || !run.content) {
    return { draft: fallback, source: run.source === 'live' ? 'fallback' : 'script', ms: run.ms, reason: '模型未给出最终结果' }
  }

  try {
    const raw = parseAgentJson<Record<string, unknown>>(run.content)
    if (!raw) throw new Error('无法从输出里取出 JSON')
    const variants = asVariants(raw.variants)
    const draft: StructureDraft = {
      version: 1,
      locked: ctx.locked,
      underlyings: ctx.underlyings,
      ki: ctx.ki,
      variants,
      // 适当性结论由代码写，不采信模型的说法
      suitability: fallback.suitability,
      pricingAsOf: MARKET_SNAPSHOT.asOf,
    }
    const issues = validateStructureDraft(draft)
    if (issues.length) {
      console.warn('[structure-agent] 回退脚本 ——', issues.map((i) => i.message).join('；'), variants)
      return { draft: fallback, source: 'fallback', ms: run.ms, reason: `校验未通过：${issues.map((i) => i.message).join('；')}` }
    }
    return { draft, source: 'live', ms: run.ms, rounds: run.rounds, toolCalls: run.toolCalls, slices: describeSlices(assembled.used) }
  } catch (err) {
    console.warn('[structure-agent] 解析失败', (err as Error).message, run.content.slice(0, 300))
    return { draft: fallback, source: 'fallback', ms: run.ms, reason: `解析失败：${(err as Error).message}` }
  }
}

/** 落在合法域外的变体直接丢弃——宁可回退脚本，也不要一个报不出去的参数组合 */
function asVariants(v: unknown): StructureVariant[] {
  if (!Array.isArray(v)) return []
  return v
    .map((d, i): StructureVariant | null => {
      const strike = Number(d?.strike)
      const autocall = String(d?.autocall ?? '')
      const payment = String(d?.payment ?? '')
      if (!STRIKES.includes(strike) || !AUTOCALLS.includes(autocall) || !PAYMENTS.includes(payment)) return null
      return {
        id: String(d?.id || `opt-${'abcd'[i] ?? i}`),
        // 名字里再带参数就和后面重复了，截短——渲染时参数本来就跟在后面
        label: `变体 ${'ABCD'[i] ?? i + 1} · ${String(d?.label || '').split(/[·,，]/)[0].trim().slice(0, 10) || '方案'}`,
        strike,
        autocall,
        payment,
        rationale: String(d?.rationale ?? ''),
        tradeoff: String(d?.tradeoff ?? ''),
        risks: Array.isArray(d?.risks) ? d.risks.map(String).filter(Boolean).slice(0, 3) : [],
      }
    })
    .filter((x): x is StructureVariant => x !== null)
    .slice(0, 3)
}
