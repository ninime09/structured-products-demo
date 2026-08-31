// FCN 产品线的产物字段 schema：同一份定义驱动 AI 提取目标、核对界面渲染
// 与完整性检查。换产品线 = 换这份文件，核对界面不改代码。

/**
 * 需求字段的「来源」维度。
 *
 * 关键业务点：客户需求摘要 ≠ 把客户说的话结构化。客户给的是投资意图，
 * 进入询价的必须是可交易的交易要素——中间那段是人和 AI 一起推出来的。
 * 这四类信息的确定性完全不同，在系统里不能混成一张平表：出事时"客户说过的"
 * 和"我们推的"责任归属不一样。
 */
export type FieldOrigin = 'stated' | 'inferred' | 'derived' | 'profile'

export const FIELD_ORIGINS: Record<
  FieldOrigin,
  { labelZh: string; labelEn: string; descZh: string; descEn: string }
> = {
  stated: {
    labelZh: '客户明确表达',
    labelEn: 'Client stated',
    descZh: '客户原话可直接指认，无需再确认。',
    descEn: 'Traceable to the client’s own words; no confirmation needed.',
  },
  inferred: {
    labelZh: 'AI 推断',
    labelEn: 'AI inferred',
    descZh: 'AI 从客户表达推出的意图层判断，不是客户原话。',
    descEn: 'Intent-level reading of what the client said — not their words.',
  },
  derived: {
    labelZh: 'RM / 产品专家推导',
    labelEn: 'RM / specialist derived',
    descZh: '结合持仓、历史交易、集中度与市况推导；进入询价前必须经客户确认。',
    descEn: 'Derived from holdings, history, concentration and market; must be client-confirmed before RFQ.',
  },
  profile: {
    labelZh: 'CRM 客户档案',
    labelEn: 'CRM profile',
    descZh: '来自客户档案，非本次表达。',
    descEn: 'From the client record, not from this conversation.',
  },
}

export interface NeedFieldSpec {
  key: string
  /** 对应产物 TermRow 的 label（取值用） */
  fieldLabel: string
  labelZh: string
  labelEn: string
  /** 第一维：这个值是哪来的 */
  origin: FieldOrigin
  sourceZh: string
  sourceEn: string
  /** 静态展示值覆盖（风险/观点等需要分语言的枚举值） */
  valueZh?: string
  valueEn?: string
  /** 共创收敛前尚无取值 */
  pendingBeforeSettle?: boolean
  /**
   * 第二维：推导类字段的硬约束——必须经客户确认才能进入询价。
   * 未确认的推导值只是内部 working assumption，不发客户、不进 RFQ 包。
   */
  requiresClientConfirmation?: boolean
  /** 收敛后的来源标注（覆盖 sourceZh / sourceEn） */
  settledSourceZh?: string
  settledSourceEn?: string
}

const JOINT_ZH = '需求共创 · 客户 14:13 回复确认'
const JOINT_EN = 'Joint discovery · client confirmed 14:13'

export const NEED_BRIEF_SCHEMA: NeedFieldSpec[] = [
  // ── 客户明确表达 ──────────────────────────────────────────────────
  { key: 'notional', fieldLabel: 'Notional', labelZh: '名义本金', labelEn: 'Notional', origin: 'stated', sourceZh: '邮件第 2 行', sourceEn: 'Email line 2' },
  { key: 'horizon', fieldLabel: 'Investment Horizon', labelZh: '投资期限', labelEn: 'Investment Horizon', origin: 'stated', sourceZh: '邮件第 2 行', sourceEn: 'Email line 2' },
  { key: 'target', fieldLabel: 'Target Yield', labelZh: '目标收益', labelEn: 'Target Yield', origin: 'stated', sourceZh: '邮件第 3 行', sourceEn: 'Email line 3' },
  { key: 'risk', fieldLabel: 'Risk Tolerance', labelZh: '风险承受度', labelEn: 'Risk Tolerance', origin: 'stated', sourceZh: '邮件第 4 行', sourceEn: 'Email line 4', valueZh: '中等 · 不接受全损结构', valueEn: 'Moderate · no full-loss structure' },
  { key: 'view', fieldLabel: 'Directional View', labelZh: '市场观点', labelEn: 'Directional View', origin: 'stated', sourceZh: '邮件第 5 行', sourceEn: 'Email line 5', valueZh: '看好中国互联网科技', valueEn: 'Constructive · China internet & tech' },
  { key: 'liquidity', fieldLabel: 'Liquidity Preference', labelZh: '流动性偏好', labelEn: 'Liquidity Preference', origin: 'stated', sourceZh: '邮件未提及', sourceEn: 'Not mentioned in email', pendingBeforeSettle: true, settledSourceZh: JOINT_ZH, settledSourceEn: JOINT_EN },

  // ── AI 推断（意图层，不是客户原话）────────────────────────────────
  { key: 'assetClass', fieldLabel: 'Asset Class Preference', labelZh: '可选标的范围', labelEn: 'Asset Class Preference', origin: 'inferred', sourceZh: '由「看好中国互联网科技」推断', sourceEn: 'Inferred from “China internet & tech”', valueZh: '港股互联网科技（0700 / 9988 / 1810）', valueEn: 'HK internet & tech (0700 / 9988 / 1810)' },

  // ── CRM 客户档案 ──────────────────────────────────────────────────
  { key: 'suitability', fieldLabel: 'Client Classification', labelZh: '客户分级 · 适当性', labelEn: 'Client Classification', origin: 'profile', sourceZh: 'CRM 客户档案（非本次表达）', sourceEn: 'CRM profile (not this conversation)', valueZh: '个人 PI · 可承受 C4', valueEn: 'Individual PI · up to C4' },

  // ── RM / 产品专家推导（需客户确认才能进 RFQ）──────────────────────
  { key: 'underlying', fieldLabel: 'Underlying', labelZh: '标的', labelEn: 'Underlying', origin: 'derived', sourceZh: '待结合持仓与集中度推导', sourceEn: 'To be derived from holdings and concentration', pendingBeforeSettle: true, requiresClientConfirmation: true, settledSourceZh: JOINT_ZH, settledSourceEn: JOINT_EN },
  { key: 'concentration', fieldLabel: 'Concentration Constraint', labelZh: '集中度约束', labelEn: 'Concentration Constraint', origin: 'derived', sourceZh: '待读取 crm.holdings 计算', sourceEn: 'To be computed from crm.holdings', pendingBeforeSettle: true, requiresClientConfirmation: true, settledSourceZh: JOINT_ZH, settledSourceEn: JOINT_EN },
  { key: 'delivery', fieldLabel: 'Delivery Willingness', labelZh: '接货意愿', labelEn: 'Delivery Willingness', origin: 'derived', sourceZh: '邮件未提及，FCN 类必需要素', sourceEn: 'Not in email; required for FCN', pendingBeforeSettle: true, requiresClientConfirmation: true, settledSourceZh: JOINT_ZH, settledSourceEn: JOINT_EN },
]

/** 按来源分组渲染——分组本身就是这个功能的产出 */
export const ORIGIN_ORDER: FieldOrigin[] = ['stated', 'inferred', 'profile', 'derived']

/** RFQ 包必填条款（完整性检查依据） */
export const RFQ_FIELD_ORDER = [
  'Product Type', 'Underlying', 'Notional', 'Tenor', 'Strike',
  'Knock-In', 'Autocall', 'Coupon Type', 'Settlement',
] as const

/** 询价发行商清单（按标的覆盖度配置） */
export const FCN_ISSUERS = ['JPM', 'UBS', 'Morgan Stanley', 'Goldman Sachs', 'BNP']

/** 条款书核对的必看字段（执行单 vs 发行商 Final Termsheet 逐字段比对） */
export const TS_VALIDATION_FIELDS = ['Notional', 'Underlying', 'Strike', 'Knock-In', 'Coupon', 'Settlement'] as const
