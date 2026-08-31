// 虚拟客户库：`crm.client_profile` 与 `crm.holdings` 两个数据面的实物。
//
// 为什么要有这个：接真模型之前，模型得有东西可读。现在初稿里那些
// "2025-09 敲入过""腾讯占港股持仓 41%"如果只是写在字符串里，换成真模型
// 只会让它更流利地编一样的东西。这份 fixture 就是让那些话有据可查。
//
// Mr. Chan 建全（演示主线），其余三位只有骨架——一条记录看不出是"查档案"
// 还是"写死的"，有多条、每次取对人，才看得出是查。

export interface HoldingPosition {
  code: string
  name: string
  /** 市值（HKD） */
  marketValue: number
}

export interface PastTrade {
  date: string
  product: string
  underlying: string
  strike: string
  ki: string
  outcome: string
  /** 事后有无争议 —— 影响"这类结构还能不能再推给他" */
  disputed: boolean
}

export interface ClientRecord {
  clientId: string
  name: string
  /** 主要负责的 RM */
  rmName: string
  classification: string
  /** 可承受的最高产品风险等级 */
  riskGrade: string
  baseCurrency: string
  asOf: string
  /** 投资目标（KYC 记录，非本次表达） */
  objectives: string[]
  /** 沟通偏好 —— 决定对客材料写成什么样 */
  communication: { channel: string; language: string; note: string }
  holdings: {
    totalMarketValue: number
    positions: HoldingPosition[]
    /** 本行对单一标的敞口的建议上限（占组合比例） */
    singleNameCap: number
  }
  history: PastTrade[]
  /** 档案里记录过的明确拒绝——比历史成交更能说明他的底线 */
  declined: { date: string; what: string; reason: string }[]
}

const CHAN: ClientRecord = {
  clientId: 'chan-hk-0142',
  name: 'Mr. Chan',
  rmName: 'Alice',
  classification: '个人 PI',
  riskGrade: 'C4',
  baseCurrency: 'USD',
  asOf: '2026-05-15',
  objectives: ['收益增强（yield enhancement）', '不接受全损结构', '可接受实物交割接股'],
  communication: {
    channel: '电话为主 · 邮件留痕',
    language: '中英皆可',
    note: '偏好先听下行情形再谈票息；不喜欢一次收到超过 3 个选项',
  },
  holdings: {
    totalMarketValue: 62_000_000,
    positions: [
      { code: '0700.HK', name: 'Tencent', marketValue: 25_400_000 },
      { code: '9988.HK', name: 'Alibaba', marketValue: 8_600_000 },
      { code: '0005.HK', name: 'HSBC', marketValue: 11_200_000 },
      { code: 'CASH', name: 'USD 现金及等价物', marketValue: 16_800_000 },
    ],
    singleNameCap: 0.5,
  },
  history: [
    { date: '2025-03', product: '6M FCN', underlying: '0700.HK', strike: '80%', ki: '65%', outcome: '到期未敲入，全额收回本息', disputed: false },
    { date: '2025-09', product: '6M FCN', underlying: '0700.HK', strike: '80%', ki: '70%', outcome: '敲入后接股，持有至反弹了结', disputed: false },
  ],
  declined: [
    { date: '2025-11', what: 'KI 75% 的 3M FCN', reason: '认为缓冲太薄' },
  ],
}

/** 骨架记录：够 case 列表和"取对人"用，不展开 */
const skeleton = (
  clientId: string,
  name: string,
  rmName: string,
  riskGrade: string,
  totalMarketValue: number,
  positions: HoldingPosition[],
): ClientRecord => ({
  clientId, name, rmName, classification: '个人 PI', riskGrade, baseCurrency: 'USD',
  asOf: '2026-05-15', objectives: ['收益增强'],
  communication: { channel: '邮件', language: '英文', note: '—' },
  holdings: { totalMarketValue, positions, singleNameCap: 0.5 },
  history: [], declined: [],
})

export const CLIENTS: Record<string, ClientRecord> = {
  [CHAN.clientId]: CHAN,
  'lau-hk-0207': skeleton('lau-hk-0207', 'Ms. Lau', 'Alice', 'C4', 38_000_000, [
    { code: 'AAPL', name: 'Apple', marketValue: 9_500_000 },
    { code: 'CASH', name: 'USD 现金及等价物', marketValue: 12_000_000 },
  ]),
  'wong-hk-0311': skeleton('wong-hk-0311', 'Mr. Wong', 'Alice', 'C3', 21_000_000, [
    { code: '9988.HK', name: 'Alibaba', marketValue: 4_200_000 },
    { code: 'CASH', name: 'USD 现金及等价物', marketValue: 8_800_000 },
  ]),
  'ng-hk-0450': skeleton('ng-hk-0450', 'Mrs. Ng', 'Alice', 'C4', 55_000_000, [
    { code: 'HSTECH', name: '恒生科技指数 ETF', marketValue: 7_400_000 },
    { code: 'CASH', name: 'USD 现金及等价物', marketValue: 24_000_000 },
  ]),
}

/** 演示主线客户 */
export const ACTIVE_CLIENT_ID = CHAN.clientId

export function getClient(clientId: string = ACTIVE_CLIENT_ID): ClientRecord {
  const c = CLIENTS[clientId]
  if (!c) throw new Error(`未知客户：${clientId}`)
  return c
}

// ── 集中度：可算，因此可核查 ────────────────────────────────────────────
export const pct = (n: number) => `${(n * 100).toFixed(1)}%`

export function exposureRatio(code: string, clientId?: string): number {
  const h = getClient(clientId).holdings
  const p = h.positions.find((x) => x.code === code)
  return p ? p.marketValue / h.totalMarketValue : 0
}

/**
 * 若该笔名义本金全额敲入接股，单一标的敞口会到多少。
 * 集中度是算出来的硬约束，不是说辞——这也是它能拦住方案的原因。
 */
export function exposureIfKnockedIn(code: string, notionalHkd: number, clientId?: string): number {
  const h = getClient(clientId).holdings
  const p = h.positions.find((x) => x.code === code)
  if (!p) return 0
  return (p.marketValue + notionalHkd) / (h.totalMarketValue + notionalHkd)
}

export function breachesSingleNameCap(code: string, notionalHkd: number, clientId?: string): boolean {
  return exposureIfKnockedIn(code, notionalHkd, clientId) > getClient(clientId).holdings.singleNameCap
}
