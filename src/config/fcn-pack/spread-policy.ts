// 分销价差政策。
//
// 访谈（两份都说了，且都标了"我推测/我理解"）：给客户的价格 = 上手价 ± 价差，
// 直接加点还是交易后返佣 case by case。这份配置把两种模式显式化，
// 因为它们的复核方式完全不同——加点要核"加点等不等于登记值"，
// 返佣要核"返佣到没到、金额对不对"。
//
// ⚠ 具体口径待 Ashley 确认（见 README 的待确认清单）。

export type SpreadMode = 'markup' | 'rebate'

export const SPREAD_MODES: Record<SpreadMode, { labelZh: string; descZh: string; reconcileZh: string }> = {
  markup: {
    labelZh: '直接加点',
    descZh: '对客票息 = 上手票息 − 价差；价差藏在价格里，客户看到的是最终票息。',
    reconcileZh: '复核：对客价 vs 上手成交价的差额是否等于登记价差。',
  },
  rebate: {
    labelZh: '交易后返佣',
    descZh: '对客票息约等于上手票息；券商收益来自发行商事后单独支付的返佣。',
    reconcileZh: '复核：返佣是否到账、金额是否与该笔交易匹配（价格里核不出来）。',
  },
}

/** 本单采用的模式与价差（销售与客户谈定后登记） */
export const SPREAD_POLICY = {
  mode: 'markup' as SpreadMode,
  /** 登记价差（bp） */
  registeredBp: 35,
  registeredBy: 'Alice · RM',
  registeredAt: '14:26',
  /**
   * 实际价差低于此阈值时内部预警。
   * 对客价在客户确认那一刻锁死，上手成交价却是下单时才定的——
   * 中间的市场移动由券商承担，价差就是缓冲。压穿了是内部损益问题，
   * 不是客户沟通问题，所以只预警给交易台，不惊动客户。
   */
  alertThresholdBp: 25,
}

/** 上手票息 → 对客票息 */
export function clientCoupon(issuerCoupon: number): number {
  if (SPREAD_POLICY.mode === 'rebate') return issuerCoupon
  return +(issuerCoupon - SPREAD_POLICY.registeredBp / 100).toFixed(2)
}

/** 实际实现的价差（bp）：上手成交价 vs 已锁死的对客价 */
export function realisedBp(issuerFillCoupon: number, clientLockedCoupon: number): number {
  return Math.round((issuerFillCoupon - clientLockedCoupon) * 100)
}

export function spreadBreached(issuerFillCoupon: number, clientLockedCoupon: number): boolean {
  return realisedBp(issuerFillCoupon, clientLockedCoupon) < SPREAD_POLICY.alertThresholdBp
}
