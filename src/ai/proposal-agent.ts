// 第一个真接入点：产品专家 agent 的结构方向建议。
//
// 分工是刻意的——
//  模型负责「说」：提哪几个方向、挂什么标的、缓冲定在哪、怎么解释取舍。
//  代码负责「算」：票息区间、集中度敞口、发行商覆盖度，一律由工具算出来喂进去，
//                  再由 renderProposal 渲染。模型碰不到这些数。
//
// 这样即使模型胡说，也编不出一个假票息——它根本没有输出票息的字段。

import { runAgent } from './agent'
import { parseAgentJson } from './json'
import { assembleContext, describeSlices } from './context'
import type { ContextSlice, ContextSource } from './context'
import type { AgentStep } from './agent'
import { readDataPlane } from '../config/mock-data/planes'
import type { ClientRecord } from '../config/mock-data/clients'
import { exposureIfKnockedIn, exposureRatio } from '../config/mock-data/clients'
import { couponRange, MARKET_SNAPSHOT } from '../config/mock-data/market'
import { issuerCoverage } from '../config/mock-data/catalog'
import type { UnderlyingSpec } from '../config/mock-data/catalog'
import { validateProposal } from '../config/fcn-pack/proposal'
import type { DirectionOption, DirectionProposal } from '../config/fcn-pack/proposal'

const SKILL = 'structure-comparator'
const NOTIONAL_HKD = 7_800_000

const SYSTEM = `你是华泰国际结构化产品台产品专家（IC）的 agent，服务对象是产品专家本人，不是客户。
任务：为一位客户的模糊诉求，提出 2–3 个可比的结构方向，供产品专家修改后确认。

工作方式——你有工具，自己决定查什么、按什么顺序查：
· 先弄清客户是谁、拿着什么、以前做过什么，再谈方向。
· 集中度、票息、发行商覆盖度这三类数字**必须调工具拿**。你自己估算的数字一律无效，
  也绝对不要在文字里写任何你没从工具拿到的百分比。
· 标的只能来自 list_underlyings 返回的池子。
· 全程用简体中文，包括过程叙述和 JSON 里的每一个字段——这是给香港中资券商的中文界面用的。
· 除最终 JSON 外，你写的每一段话都会实时显示在产品专家的界面上，所以一律遵守：
  一句话，40 字以内，纯文本。不要星号、井号等任何 markdown 标记，不要分点罗列，
  不要复述工具刚返回的数字——那些数字他在结论里会看到，在过程里重复一遍只会刷屏。
  该写"先看客户历史偏好，判断 KI 该定在哪一档"，不要写"关键发现：1. 腾讯当前 41%…"。
  查够了就直接输出 JSON，不要先写一段总结。

查够了之后，输出最终 JSON（不要 markdown 代码块）：
{
  "clientStated": "客户明确说过的内容，不得添加他没说的",
  "inferred": "你推断的标的范围，须注明是推断",
  "evidenceHoldings": ["持仓与集中度依据，引用工具返回的数值"],
  "evidenceProfile": ["客户档案依据：历史交易、拒绝记录"],
  "directions": [
    { "id": "...", "label": "...", "underlyings": ["0700.HK"], "ki": 65, "meetsTarget": true, "note": "取舍说明" }
  ]
}
JSON 里没有票息字段——票息由系统按你给的 underlyings 与 ki 重新计算后填入。`

/** 这个技能声明它要哪几块上下文——装配由 context.ts 统一做 */
export const SLICES: ContextSlice[] = [
  'case.truth', 'client.email', 'need.brief', 'room.discussion', 'prior.version',
]

/** 只从 manifest 授权过的数据面取——这些数进 constraints，模型碰不到 */
function readFacts() {
  const client = readDataPlane(SKILL, 'crm.client_profile') as ClientRecord
  const holdings = readDataPlane(SKILL, 'crm.holdings') as ClientRecord['holdings']
  const catalog = readDataPlane(SKILL, 'catalog.products') as { underlyings: UnderlyingSpec[] }
  readDataPlane(SKILL, 'market.snapshot') // 未声明会抛错——授权这一层是真的
  void catalog
  return {
    client,
    holdings,
    now: exposureRatio('0700.HK'),
    after: exposureIfKnockedIn('0700.HK', NOTIONAL_HKD),
  }
}

export interface ProposalResult {
  proposal: DirectionProposal
  source: 'live' | 'script' | 'fallback'
  ms?: number
  reason?: string
  rounds?: number
  toolCalls?: number
  /** 这次装配了哪几块上下文——写进审计 */
  slices?: string
}

/**
 * 生成方向建议。
 * 任何一步出问题（模型不可用、JSON 解析失败、结构化校验不过）都回退脚本版。
 */
export async function generateProposal(
  question: string,
  fallback: DirectionProposal,
  onStep?: (steps: AgentStep[]) => void,
  src?: ContextSource,
  /** 改稿时传上一版：模型在它的基础上改，版本号顺着往上走 */
  revising?: DirectionProposal,
): Promise<ProposalResult> {
  const ctx = readFacts()
  if (!onStep || !src) return { proposal: fallback, source: 'script' }

  const assembled = assembleContext(src, SLICES)
  const user = [
    assembled.text,
    '',
    '【他现在问你】' + question,
    src.priorVersion
      ? '\n上面已经有你给过的版本。这次是**改稿**：先弄清他对哪一条不满意、为什么，再动。\n'
        + '改完要在 note 里说清哪里变了、依据是什么。他没说清不满意在哪的话，'
        + '就点明你按什么理解改的，别默默重出一版一样的。'
      : '',
    // 整份重出的代价是模型可能顺手改掉没让它改的地方——审计 diff 会变成一堆噪音。
    // 约束不了输出范围，至少把"只动被点名的部分"写进指令。
    revising
      ? '\n【改稿边界】只改他点名的那部分。其余方向的 id、label、underlyings、ki、note 一律逐字保留，'
        + '不要重写措辞、不要调整顺序、不要顺手补充。他没提到的地方你改了一个字，都算越权。\n'
        + '当前版本的方向清单（id / label / ki / note，逐字照抄未被点名的项）：\n'
        + revising.directions.map((d) => `  - ${d.id} | ${d.label} | KI ${d.ki} | ${d.note}`).join('\n')
      : '',
  ].filter(Boolean).join('\n')

  const run = await runAgent({
    skill: SKILL,
    system: SYSTEM,
    user,
    tools: ['get_client_profile', 'get_holdings', 'compute_exposure', 'price_indicative', 'issuer_coverage', 'list_underlyings'],
    maxRounds: 6,
    jsonFinal: true,
    onStep,
    timeoutMs: 40_000,
  })
  if (run.source !== 'live' || !run.content) {
    console.warn('[proposal-agent] 回退 —— 模型未给出最终结果', { source: run.source, rounds: run.rounds, contentLen: run.content.length })
    return { proposal: fallback, source: run.source === 'live' ? 'fallback' : 'script', ms: run.ms, reason: '模型未给出最终结果' }
  }

  try {
    const raw = parseAgentJson<Record<string, unknown>>(run.content)
    if (!raw) throw new Error('无法从输出里取出 JSON')
    const proposal: DirectionProposal = {
      version: revising ? revising.version + 1 : 1,
      clientStated: String(raw.clientStated ?? fallback.clientStated),
      inferred: String(raw.inferred ?? fallback.inferred),
      evidenceHoldings: asStrings(raw.evidenceHoldings, fallback.evidenceHoldings),
      evidenceProfile: asStrings(raw.evidenceProfile, fallback.evidenceProfile),
      directions: asDirections(raw.directions),
      // 约束一律由代码填，模型给的同名字段忽略
      constraints: {
        concentrationCap: ctx.holdings.singleNameCap * 100,
        currentExposure: ctx.now * 100,
        exposureIfKnockedIn: ctx.after * 100,
        targetYield: 10,
        riskTolerance: '中等 · 不接受全损',
      },
      pricingAsOf: MARKET_SNAPSHOT.asOf,
    }
    // 达标判断以定价结果为准，不跟模型争
    proposal.directions = proposal.directions.map((d) => ({ ...d, meetsTarget: midCoupon(d) >= proposal.constraints.targetYield }))

    const issues = validateProposal(proposal)
    if (issues.length || proposal.directions.length < 2) {
      const reason = `校验未通过：${issues.map((i) => i.message).join('；') || '方向不足'}`
      // 回退是静默的（现场不能弹错），但排查时要看得见到底卡在哪一条
      console.warn('[proposal-agent] 回退脚本 ——', reason, { raw, directions: proposal.directions })
      return { proposal: fallback, source: 'fallback', ms: run.ms, reason }
    }
    return { proposal, source: 'live', ms: run.ms, rounds: run.rounds, toolCalls: run.toolCalls, slices: describeSlices(assembled.used) }
  } catch (e) {
    console.warn('[proposal-agent] 回退 —— 解析失败', (e as Error).message, run.content.slice(0, 400))
    return { proposal: fallback, source: 'fallback', ms: run.ms, reason: `解析失败：${(e as Error).message}` }
  }
}

function asStrings(v: unknown, fb: string[]): string[] {
  if (!Array.isArray(v)) return fb
  const out = v.filter((x) => typeof x === 'string' && x.trim()).map((x) => String(x).trim())
  return out.length ? out : fb
}

/** 标的必须在池子里；KI 必须在合理区间。模型给不出的直接丢弃。 */
function asDirections(v: unknown): DirectionOption[] {
  if (!Array.isArray(v)) return []
  const allowed = new Set(['0700.HK', '9988.HK', '1810.HK', 'HSTECH'])
  return v
    .map((d, i): DirectionOption | null => {
      const underlyings = Array.isArray(d?.underlyings)
        ? d.underlyings.map(String).filter((c: string) => allowed.has(c))
        : []
      const ki = Number(d?.ki)
      if (!underlyings.length || !Number.isFinite(ki) || ki <= 40 || ki >= 100) return null
      return {
        id: String(d?.id || `dir-${i}`),
        label: String(d?.label || underlyings.join(' + ')),
        underlyings,
        ki: Math.round(ki),
        meetsTarget: Boolean(d?.meetsTarget),
        note: String(d?.note ?? ''),
      }
    })
    .filter((d): d is DirectionOption => d !== null)
    .slice(0, 4)
}

function midCoupon(d: DirectionOption): number {
  const [lo, hi] = couponRange({ underlyings: d.underlyings, ki: d.ki }).replace('%', '').split('–').map(Number)
  return (lo + hi) / 2
}

/** 发行商覆盖度也由代码算，模型不参与 */
export const coverageOf = (codes: string[]) => issuerCoverage(codes)
