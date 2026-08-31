// 市场快照与指示性定价：`market.snapshot` 数据面。
//
// ⚠ 这是 stub，不是定价模型。它存在的唯一理由是：
// indicative 票息绝不能让语言模型生成。模型编一个"大概 10.5%"，RM 转给客户、
// 客户记住了，最后询价回来 10.2%——那是纠纷，而且是 AI 造成的纠纷。
//
// 所以：可算的留给代码，可说的留给模型。这个函数负责算，并把推导过程
// 一并返回，界面可以直接展示依据，而不是甩一个黑箱数字。

export interface MarketQuote {
  code: string
  spot: number
  /** 6M 隐含波动率（%） */
  vol: number
}

export const MARKET_SNAPSHOT = {
  asOf: '2026-05-16 14:06 HKT',
  riskFreeUsd: 4.5,
  quotes: [
    { code: '0700.HK', spot: 402.4, vol: 32 },
    { code: '9988.HK', spot: 88.6, vol: 38 },
    { code: '1810.HK', spot: 21.35, vol: 45 },
    { code: 'HSTECH', spot: 5218, vol: 26 },
  ] as MarketQuote[],
}

export function quoteFor(code: string): MarketQuote {
  const q = MARKET_SNAPSHOT.quotes.find((x) => x.code === code)
  if (!q) throw new Error(`市场快照里没有 ${code}`)
  return q
}

// 参考条款：所有基准票息都以这套条款为准，调整项从这里起算。
const REF = { ki: 65, strike: 80, tenorMonths: 6, autocall: '月度观察 · 自第 2 月起' }

/**
 * 各结构在参考条款下的基准年化票息（%）。
 * 最差表现型比单一标的高——因为任一标的敲入都算敲入，风险更大所以票息更高。
 * 这条容易搞反，写在这里以免后面改文案时又反了。
 */
function baseCoupon(codes: string[]): { base: number; note: string } {
  if (codes.length === 1 && codes[0] === 'HSTECH') {
    return { base: 5.9, note: '恒生科技指数 · 波动率 26%（指数波动率低，票息天然偏低）' }
  }
  if (codes.length === 1) {
    const q = quoteFor(codes[0])
    return { base: +(4.0 + q.vol * 0.197).toFixed(2), note: `${codes[0]} 单一标的 · 波动率 ${q.vol}%` }
  }
  // 最差表现型：取最高波动率并加相关性溢价（标的越多，同时不敲入的概率越低）
  const maxVol = Math.max(...codes.map((c) => quoteFor(c).vol))
  const effVol = maxVol * (1 + 0.12 * (codes.length - 1))
  return {
    base: +(4.0 + effVol * 0.197).toFixed(2),
    note: `最差表现型 ${codes.length} 标的 · 有效波动率 ${effVol.toFixed(1)}%（最高 ${maxVol}% + 相关性溢价）`,
  }
}

export interface CouponTerms {
  underlyings: string[]
  ki: number
  strike?: number
  tenorMonths?: number
  autocall?: string
}

export interface IndicativeCoupon {
  low: number
  high: number
  mid: number
  /** 推导过程，逐项可读——界面直接展示这个，而不是只给一个数 */
  derivation: { label: string; delta: number | null; value: string }[]
  asOf: string
  disclaimer: string
}

/**
 * 指示性票息区间。单调性是刻意的：
 *  KI 越高（缓冲越薄）→ 票息越高；Strike 越高 → 票息越高；
 *  无 autocall → 票息略高（不会被提前赎回）；期限越长 → 票息略低。
 */
export function indicativeCoupon(t: CouponTerms): IndicativeCoupon {
  const strike = t.strike ?? REF.strike
  const tenor = t.tenorMonths ?? REF.tenorMonths
  const autocall = t.autocall ?? REF.autocall
  const { base, note } = baseCoupon(t.underlyings)

  const kiAdj = +((t.ki - REF.ki) * 0.1).toFixed(2)
  const strikeAdj = +((strike - REF.strike) * 0.06).toFixed(2)
  const autocallAdj = autocall === '无 autocall' ? 0.35 : autocall.includes('第 3 月') ? -0.12 : 0
  const tenorAdj = +((tenor - REF.tenorMonths) * -0.05).toFixed(2)

  const mid = +(base + kiAdj + strikeAdj + autocallAdj + tenorAdj).toFixed(2)
  const derivation = [
    { label: '基准', delta: null, value: `${base.toFixed(2)}%（${note}）` },
    { label: `KI ${t.ki}%`, delta: kiAdj, value: `参考 ${REF.ki}%，每 1 个点 ±0.10` },
    { label: `Strike ${strike}%`, delta: strikeAdj, value: `参考 ${REF.strike}%，每 1 个点 ±0.06` },
    { label: autocall, delta: autocallAdj, value: autocallAdj === 0 ? '参考条款' : '相对参考条款调整' },
    { label: `${tenor}M`, delta: tenorAdj, value: tenorAdj === 0 ? '参考条款' : '相对参考条款调整' },
  ].filter((d) => d.delta === null || d.delta !== 0 || d.label.startsWith('KI'))

  return {
    low: +(mid - 0.2).toFixed(2),
    high: +(mid + 0.2).toFixed(2),
    mid,
    derivation,
    asOf: MARKET_SNAPSHOT.asOf,
    disclaimer: '指示性区间（内部定价 stub），不构成报价，最终票息以询价结果为准。',
  }
}

/** "10.10–10.50%" */
export function couponRange(t: CouponTerms): string {
  const c = indicativeCoupon(t)
  return `${c.low.toFixed(2)}–${c.high.toFixed(2)}%`
}
