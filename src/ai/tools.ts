// 工具注册表：模型能调什么，以及调用时真正执行什么。
//
// 分权是这套东西的要害：
//   模型有**决策权**——决定该查什么、按什么顺序查、据此提什么方向。
//   模型没有**事实权**——敞口多少、票息多少、几家能报，全部由确定性代码算。
//
// 所有读取都过 readDataPlane，所以 skills.ts 里的 manifest 授权对模型同样生效：
// 技能没声明的数据面，模型调了也拿不到。这条现场可以当场演。

import { readDataPlane, DataPlaneDenied } from '../config/mock-data/planes'
import type { ClientRecord } from '../config/mock-data/clients'
import { exposureIfKnockedIn, exposureRatio, pct } from '../config/mock-data/clients'
import { couponRange, indicativeCoupon } from '../config/mock-data/market'
import { issuerCoverage, UNDERLYINGS } from '../config/mock-data/catalog'

export interface ToolDef {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface ToolContext {
  /** 发起调用的技能——授权按它判 */
  skill: string
}

type Executor = (args: Record<string, unknown>, ctx: ToolContext) => unknown

interface Tool {
  def: ToolDef
  run: Executor
  /** 展示用：这一步在界面上怎么描述 */
  label: (args: Record<string, unknown>) => string
}

const t = (
  name: string,
  description: string,
  parameters: Record<string, unknown>,
  run: Executor,
  label: (a: Record<string, unknown>) => string,
): Tool => ({ def: { type: 'function', function: { name, description, parameters } }, run, label })

const obj = (props: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties: props,
  required,
})

const NOTIONAL_HKD = 7_800_000

/**
 * 各产品的合法参数域。
 * 这是"模型不能发明参数"的那道栏杆：它只能从这里选，选不到就得说选不到。
 */
const STRUCTURE_TEMPLATES: Record<string, {
  adjustable: Record<string, (string | number)[]>
  lockedByClient: string[]
  rules: string[]
}> = {
  FCN: {
    adjustable: {
      strike: [75, 80, 85, 90],
      autocall: ['月度观察 · 自第 2 月起', '月度观察 · 自第 3 月起', '季度观察', '无 autocall'],
      payment: ['月付', '季付', '到期一次付'],
    },
    // 客户在需求阶段确认过的，结构阶段一律不可调
    lockedByClient: ['标的', 'Knock-In', '期限', '名义本金', '接货意愿'],
    rules: [
      'Strike 高于 100% 不做——接股价高于期初没有商业意义',
      'Strike 越高票息越高，但真接股时成本价越贵',
      '无 autocall 票息更高，但资金锁满全期',
      '同一份 RFQ 里的变体必须共用全部锁定要素，只在可调参数上不同',
    ],
  },
}

const THEME_LABEL: Record<string, string> = {
  'china-internet': '中国互联网',
  'hk-tech': '港股科技',
}

export const TOOLS: Record<string, Tool> = {
  get_client_profile: t(
    'get_client_profile',
    '读取客户档案：分级、适当性等级、投资目标、历史结构化产品交易、以及档案里记录过的明确拒绝。',
    obj({}),
    (_a, ctx) => {
      const c = readDataPlane(ctx.skill, 'crm.client_profile') as ClientRecord
      return {
        name: c.name,
        classification: c.classification,
        riskGrade: c.riskGrade,
        objectives: c.objectives,
        history: c.history.map((h) => `${h.date} ${h.product} / ${h.underlying} / Strike ${h.strike} / KI ${h.ki} —— ${h.outcome}`),
        declined: c.declined.map((d) => `${d.date} 拒绝${d.what}（${d.reason}）`),
      }
    },
    () => '读取客户档案',
  ),

  get_holdings: t(
    'get_holdings',
    '读取客户当前持仓：各标的市值、组合总市值、以及本行对单一标的敞口的建议上限。',
    obj({}),
    (_a, ctx) => {
      const h = readDataPlane(ctx.skill, 'crm.holdings') as ClientRecord['holdings']
      return {
        totalMarketValueHkd: h.totalMarketValue,
        positions: h.positions.map((p) => ({ code: p.code, name: p.name, marketValueHkd: p.marketValue, share: pct(p.marketValue / h.totalMarketValue) })),
        singleNameCap: pct(h.singleNameCap),
      }
    },
    () => '读取客户持仓',
  ),

  compute_exposure: t(
    'compute_exposure',
    '计算某标的的集中度：当前敞口占比，以及若本笔全额敲入接股后的敞口占比，并判断是否超过本行上限。数值由系统计算，不要自行估算。',
    obj({ code: { type: 'string', description: '标的代码，如 0700.HK' } }, ['code']),
    (a, ctx) => {
      const h = readDataPlane(ctx.skill, 'crm.holdings') as ClientRecord['holdings']
      const code = String(a.code)
      const now = exposureRatio(code)
      const after = exposureIfKnockedIn(code, NOTIONAL_HKD)
      return {
        code,
        current: pct(now),
        ifKnockedIn: pct(after),
        cap: pct(h.singleNameCap),
        breachesCap: after > h.singleNameCap,
        headroom: pct(Math.max(0, h.singleNameCap - after)),
      }
    },
    (a) => `计算 ${a.code} 集中度`,
  ),

  price_indicative: t(
    'price_indicative',
    '按结构条款计算指示性票息区间。票息只能由本工具给出，你自己不得估算或编造任何票息数字。',
    obj(
      {
        underlyings: { type: 'array', items: { type: 'string' }, description: '一个标的为单一标的；两个及以上为最差表现型' },
        ki: { type: 'number', description: 'Knock-In 水平，如 65 表示 65%' },
        strike: { type: 'number', description: '可选，默认 80' },
        autocall: { type: 'string', description: "可选：'月度观察 · 自第 2 月起' | '月度观察 · 自第 3 月起' | '无 autocall'" },
      },
      ['underlyings', 'ki'],
    ),
    (a, ctx) => {
      readDataPlane(ctx.skill, 'market.snapshot')
      const codes = (a.underlyings as string[]).map(String)
      const c = indicativeCoupon({
        underlyings: codes,
        ki: Number(a.ki),
        strike: a.strike ? Number(a.strike) : undefined,
        autocall: a.autocall ? String(a.autocall) : undefined,
      })
      return {
        range: couponRange({ underlyings: codes, ki: Number(a.ki), strike: a.strike ? Number(a.strike) : undefined, autocall: a.autocall ? String(a.autocall) : undefined }),
        mid: c.mid,
        derivation: c.derivation.map((d) => `${d.label}${d.delta === null ? '' : ` ${d.delta > 0 ? '+' : ''}${d.delta}`}：${d.value}`),
        disclaimer: c.disclaimer,
      }
    },
    (a) => `试算票息 ${(a.underlyings as string[])?.join('+')} · KI ${a.ki}%`,
  ),

  issuer_coverage: t(
    'issuer_coverage',
    '查询哪些发行商能同时覆盖给定的一组标的（取交集）。家数由系统计算，不要自行猜测。',
    obj({ underlyings: { type: 'array', items: { type: 'string' } } }, ['underlyings']),
    (a, ctx) => {
      readDataPlane(ctx.skill, 'catalog.products')
      const codes = (a.underlyings as string[]).map(String)
      const issuers = issuerCoverage(codes)
      return { underlyings: codes, count: issuers.length, issuers }
    },
    (a) => `查可报价发行商 ${(a.underlyings as string[])?.join('+')}`,
  ),

  structure_template: t(
    'structure_template',
    '读取某类产品的合法参数域：哪些 Strike / Autocall / 票息支付方式是本行能做的，以及哪些参数是客户已确认锁死、不可调的。设计变体前必须先查，不得自行发明参数取值。',
    obj({ product: { type: 'string', description: "产品类型，如 'FCN'" } }, ['product']),
    (a, ctx) => {
      const cat = readDataPlane(ctx.skill, 'catalog.products') as { products?: unknown }
      void cat
      const p = String(a.product).toUpperCase()
      const tpl = STRUCTURE_TEMPLATES[p]
      if (!tpl) return { error: 'unknown_product', supported: Object.keys(STRUCTURE_TEMPLATES) }
      return { product: p, ...tpl }
    },
    (a) => `读取 ${a.product} 参数域`,
  ),

  check_suitability: t(
    'check_suitability',
    '适当性预检：按客户分级与产品风险等级判断这个结构能不能卖给这位客户。结论由系统给出，你不得自行判断"应该可以"。',
    obj(
      {
        productType: { type: 'string' },
        ki: { type: 'number', description: 'Knock-In 水平，如 65' },
        principalProtected: { type: 'boolean', description: '是否保本' },
      },
      ['productType', 'ki'],
    ),
    (a, ctx) => {
      const c = readDataPlane(ctx.skill, 'crm.client_profile') as ClientRecord
      const ki = Number(a.ki)
      // 产品风险等级：FCN 本身 R4；缓冲越薄风险越高
      const rating = a.principalProtected ? 'R2' : ki >= 75 ? 'R5' : 'R4'
      const capNum = Number(String(c.riskGrade).replace(/\D/g, '')) || 4
      const ratingNum = Number(rating.replace(/\D/g, ''))
      const pass = ratingNum <= capNum
      return {
        productRating: rating,
        clientCap: c.riskGrade,
        pass,
        reason: pass
          ? `${rating} ≤ ${c.riskGrade}，适当性预检通过`
          : `${rating} 超出客户可承受的 ${c.riskGrade}，不可销售；需降低风险等级（例如加厚缓冲）`,
        // 档案里的拒绝记录不是硬约束，但设计时要看
        declined: c.declined.map((d) => `${d.date} 拒绝${d.what}（${d.reason}）`),
        note: '下单前仍会再次校验，本次为设计阶段预检。',
      }
    },
    (a) => `适当性预检 ${a.productType} · KI ${a.ki}%`,
  ),

  list_underlyings: t(
    'list_underlyings',
    '按主题列出可选标的池。只能从这个池子里选标的，不得自行发明代码。',
    obj({ theme: { type: 'string', description: "如 'china-internet'" } }),
    (a, ctx) => {
      const cat = readDataPlane(ctx.skill, 'catalog.products') as { underlyings: typeof UNDERLYINGS }
      const theme = a.theme ? String(a.theme) : null
      const list = theme ? cat.underlyings.filter((u) => u.themes.includes(theme)) : cat.underlyings
      return list.map((u) => ({ code: u.code, name: u.name, themes: u.themes }))
    },
    // theme 是内部 slug，界面上要说人话
    (a) => `列出可选标的${a.theme ? `（${THEME_LABEL[String(a.theme)] ?? a.theme}）` : ''}`,
  ),
}

/**
 * 工具名一流出来就先显示这个短标签——那时入参还在流，拼不出具体的 label。
 * 入参到齐后再换成带标的的完整说法。
 */
const BRIEF: Record<string, string> = {
  get_client_profile: '读取客户档案',
  get_holdings: '读取客户持仓',
  compute_exposure: '计算集中度',
  price_indicative: '试算票息',
  issuer_coverage: '查可报价发行商',
  list_underlyings: '列出可选标的',
}

export const toolBrief = (name: string) => BRIEF[name] ?? '调用工具'

export const toolDefs = (names?: string[]): ToolDef[] =>
  Object.entries(TOOLS)
    .filter(([n]) => !names || names.includes(n))
    .map(([, v]) => v.def)

export interface ToolOutcome {
  ok: boolean
  label: string
  result: unknown
  ms: number
  denied?: boolean
}

/** 执行一次工具调用。授权被拒也照常返回给模型——让它知道自己越权了。 */
export function runTool(name: string, argsJson: string, ctx: ToolContext): ToolOutcome {
  const started = Date.now()
  const tool = TOOLS[name]
  if (!tool) return { ok: false, label: `未知工具 ${name}`, result: { error: `unknown_tool:${name}` }, ms: 0 }
  let args: Record<string, unknown> = {}
  try {
    args = argsJson ? JSON.parse(argsJson) : {}
  } catch {
    return { ok: false, label: tool.label({}), result: { error: 'bad_arguments' }, ms: Date.now() - started }
  }
  try {
    return { ok: true, label: tool.label(args), result: tool.run(args, ctx), ms: Date.now() - started }
  } catch (e) {
    const denied = e instanceof DataPlaneDenied
    return {
      ok: false,
      denied,
      label: tool.label(args),
      // manifest 没声明就真的拿不到——把拒绝原因回给模型，它会换个路子
      result: { error: denied ? 'data_plane_denied' : 'tool_error', message: (e as Error).message },
      ms: Date.now() - started,
    }
  }
}
