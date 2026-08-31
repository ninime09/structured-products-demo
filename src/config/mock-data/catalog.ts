// 产品目录：`catalog.products` 数据面。
//
// 这一份同时喂三处：
//  · 需求阶段——「可选标的范围」（客户说"看好中国互联网科技"能落到哪些标的）
//  · 方向初稿——发行商覆盖度（这个结构有几家能报，是可算的）
//  · 结构阶段——「可调参数」有哪些（客户确认的是方向，参数由产品专家定）

export type PayoffType = 'single-name' | 'worst-of' | 'index'

export interface UnderlyingSpec {
  code: string
  name: string
  /** 板块标签：AI 从"看好中国互联网科技"映射到标的池靠这个 */
  themes: string[]
  /** 能给该标的报价的发行商 */
  issuers: string[]
}

export const UNDERLYINGS: UnderlyingSpec[] = [
  { code: '0700.HK', name: 'Tencent', themes: ['china-internet', 'hk-tech'], issuers: ['JPM', 'UBS', 'Morgan Stanley', 'Goldman Sachs', 'BNP'] },
  { code: '9988.HK', name: 'Alibaba', themes: ['china-internet', 'hk-tech'], issuers: ['JPM', 'Morgan Stanley', 'Goldman Sachs', 'BNP'] },
  { code: '1810.HK', name: 'Xiaomi', themes: ['china-internet', 'hk-tech'], issuers: ['JPM', 'Morgan Stanley', 'BNP'] },
  { code: 'HSTECH', name: '恒生科技指数', themes: ['hk-tech'], issuers: ['UBS', 'Morgan Stanley', 'Goldman Sachs'] },
]

/** 主题字典：客户表达 → 标的池（AI 推断那一层的落地依据） */
export const THEMES: Record<string, { labelZh: string; labelEn: string; match: RegExp }> = {
  'china-internet': {
    labelZh: '中国互联网科技',
    labelEn: 'China internet & tech',
    match: /互联网|科技|internet|tech|china tech/i,
  },
}

export interface ParamSpec {
  key: string
  labelZh: string
  labelEn: string
  options: string[]
  /** 默认取值 */
  fallback: string
  /** 这个参数客户理解得了吗——理解不了的由产品专家定，不拿去问客户 */
  clientFacing: boolean
}

export interface ProductSpec {
  id: string
  nameZh: string
  nameEn: string
  payoff: PayoffType
  /** 该结构可挂的标的 */
  eligible: string[]
  /** 本行产品风险等级 */
  riskGrade: string
  /** 客户在需求阶段确认的要素——结构阶段锁死不可改 */
  clientConfirmed: string[]
  /** 产品专家可调的交易要素 */
  tunable: ParamSpec[]
}

const COMMON_PARAMS: ParamSpec[] = [
  { key: 'strike', labelZh: '行权价 Strike', labelEn: 'Strike', options: ['75%', '80%', '85%'], fallback: '80%', clientFacing: true },
  { key: 'kiObservation', labelZh: 'KI 观察方式', labelEn: 'KI Observation', options: ['连续观察', '到期观察'], fallback: '连续观察', clientFacing: false },
  { key: 'autocall', labelZh: 'Autocall 观察', labelEn: 'Autocall', options: ['月度观察 · 自第 2 月起', '月度观察 · 自第 3 月起', '无 autocall'], fallback: '月度观察 · 自第 2 月起', clientFacing: false },
  { key: 'autocallTrigger', labelZh: 'Autocall 触发水平', labelEn: 'Autocall Trigger', options: ['100%', '103%'], fallback: '100%', clientFacing: false },
  { key: 'couponPayment', labelZh: '票息支付', labelEn: 'Coupon Payment', options: ['月付', '到期一次付'], fallback: '月付', clientFacing: false },
  { key: 'settlement', labelZh: '结算', labelEn: 'Settlement', options: ['T+2', 'T+3'], fallback: 'T+2', clientFacing: false },
]

export const PRODUCTS: ProductSpec[] = [
  {
    id: 'fcn-single',
    nameZh: 'FCN · 单一标的',
    nameEn: 'FCN · Single name',
    payoff: 'single-name',
    eligible: ['0700.HK', '9988.HK', '1810.HK'],
    riskGrade: 'R4',
    clientConfirmed: ['标的', 'KI 缓冲水平', '期限', '接货意愿'],
    tunable: COMMON_PARAMS,
  },
  {
    id: 'fcn-worst-of',
    nameZh: 'FCN · 最差表现型',
    nameEn: 'FCN · Worst-of',
    payoff: 'worst-of',
    eligible: ['0700.HK', '9988.HK', '1810.HK'],
    riskGrade: 'R4',
    clientConfirmed: ['标的组合', 'KI 缓冲水平', '期限', '接货意愿'],
    tunable: COMMON_PARAMS,
  },
  {
    id: 'note-index',
    nameZh: '指数挂钩票据',
    nameEn: 'Index-linked note',
    payoff: 'index',
    eligible: ['HSTECH'],
    riskGrade: 'R3',
    clientConfirmed: ['挂钩指数', 'KI 缓冲水平', '期限'],
    tunable: COMMON_PARAMS.filter((p) => p.key !== 'settlement'),
  },
]

/** 按主题解出可选标的池——需求阶段「AI 推断」那一格的依据 */
export function underlyingsForTheme(theme: string): UnderlyingSpec[] {
  return UNDERLYINGS.filter((u) => u.themes.includes(theme))
}

/** 该组合有几家发行商能同时覆盖（取交集）——可算，因此可核查 */
export function issuerCoverage(codes: string[]): string[] {
  const sets = codes.map((c) => UNDERLYINGS.find((u) => u.code === c)?.issuers ?? [])
  if (!sets.length) return []
  return sets.reduce((acc, cur) => acc.filter((i) => cur.includes(i)))
}

export function productById(id: string): ProductSpec {
  const p = PRODUCTS.find((x) => x.id === id)
  if (!p) throw new Error(`未知产品：${id}`)
  return p
}
