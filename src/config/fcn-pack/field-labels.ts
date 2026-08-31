// 产物字段的中文显示名。
//
// 底层 label 仍是英文——它同时是 value(rows, 'Strike') 这类查值的 key，
// 改了会断。所以只在渲染时映射一层。
//
// 交易台常用的行业术语保持英文（Strike / Knock-In / Autocall / Coupon /
// Notional / Settlement / Issuer / Tenor），这些中文反而不好认；
// 其余非术语的字段名一律中文。

export const FIELD_LABEL_ZH: Record<string, string> = {
  // ── 需求 ──
  Underlying: '标的',
  'Investment Horizon': '投资期限',
  'Target Yield': '目标收益',
  'Risk Tolerance': '风险承受度',
  'Directional View': '市场观点',
  'Liquidity Preference': '流动性偏好',
  'Asset Class Preference': '可选标的范围',
  'Client Classification': '客户分级 · 适当性',
  'Concentration Constraint': '集中度约束',
  'Delivery Willingness': '接货意愿',

  // ── 结构 / RFQ ──
  'Product Type': '产品类型',
  Product: '产品',
  'Coupon Type': '票息类型',
  Delivery: '交割方式',
  Variants: '询价变体',

  // ── 客户报价 / 指令 ──
  'Selected Option': '客户选定',
  Timing: '执行时限',
  'Confirmation Record': '确认留痕',
  'Strike / KI': 'Strike / KI',

  // ── 下单与登记 ──
  Channel: '下单渠道',
  Direction: '买卖方向',
  'Client Coupon (locked)': '对客票息（已锁死）',
  'Client Coupon': '对客票息',
  'Issuer Fill Coupon': '上手成交票息',
  'Coupon (Final)': '最终票息',
}

/** 渲染用显示名；未收录的保持原样（多为行业术语） */
export const fieldLabel = (label: string) => FIELD_LABEL_ZH[label] ?? label
