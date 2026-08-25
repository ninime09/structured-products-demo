// FCN 产品线的产物字段 schema：同一份定义驱动 AI 提取目标、核对界面渲染
// 与完整性检查。换产品线 = 换这份文件，核对界面不改代码。

export interface NeedFieldSpec {
  key: string
  /** 对应产物 TermRow 的 label（取值用） */
  fieldLabel: string
  labelZh: string
  labelEn: string
  /** 字段来源：email = 邮件提取；crm = 客户档案（非邮件） */
  origin: 'email' | 'crm'
  sourceZh: string
  sourceEn: string
  /** 静态展示值覆盖（风险/观点等需要分语言的枚举值） */
  valueZh?: string
  valueEn?: string
  /** 允许缺失（缺失时走 ask_client / accept_gap 流程） */
  optional?: boolean
}

export const NEED_BRIEF_SCHEMA: NeedFieldSpec[] = [
  { key: 'underlying', fieldLabel: 'Underlying', labelZh: '标的', labelEn: 'Underlying', origin: 'email', sourceZh: '邮件第 2 行', sourceEn: 'Email line 2' },
  { key: 'risk', fieldLabel: 'Risk Tolerance', labelZh: '风险承受度', labelEn: 'Risk Tolerance', origin: 'email', sourceZh: '邮件第 5 行', sourceEn: 'Email line 5', valueZh: '中等', valueEn: 'Moderate' },
  { key: 'notional', fieldLabel: 'Notional', labelZh: '名义本金', labelEn: 'Notional', origin: 'email', sourceZh: '邮件第 3 行', sourceEn: 'Email line 3' },
  { key: 'view', fieldLabel: 'Directional View', labelZh: '市场观点', labelEn: 'Directional View', origin: 'email', sourceZh: '邮件第 6 行', sourceEn: 'Email line 6', valueZh: '看好', valueEn: 'Bullish' },
  { key: 'suitability', fieldLabel: 'Client Classification', labelZh: '客户分级 · 适当性', labelEn: 'Client Classification', origin: 'crm', sourceZh: 'CRM 客户档案（非邮件）', sourceEn: 'CRM profile (not email)', valueZh: '个人 PI · 可承受 C4', valueEn: 'Individual PI · up to C4' },
  { key: 'horizon', fieldLabel: 'Investment Horizon', labelZh: '投资期限', labelEn: 'Investment Horizon', origin: 'email', sourceZh: '邮件第 2 行', sourceEn: 'Email line 2' },
  { key: 'liquidity', fieldLabel: 'Liquidity Preference', labelZh: '流动性偏好', labelEn: 'Liquidity Preference', origin: 'email', sourceZh: '—', sourceEn: '—', optional: true },
  { key: 'target', fieldLabel: 'Target Yield', labelZh: '目标收益', labelEn: 'Target Yield', origin: 'email', sourceZh: '邮件第 4 行', sourceEn: 'Email line 4' },
]

/** RFQ 包必填条款（完整性检查依据） */
export const RFQ_FIELD_ORDER = [
  'Product Type', 'Underlying', 'Notional', 'Tenor', 'Strike',
  'Knock-In', 'Autocall', 'Coupon Type', 'Settlement',
] as const

/** 询价发行商清单（按标的覆盖度配置） */
export const FCN_ISSUERS = ['JPM', 'UBS', 'Morgan Stanley', 'Goldman Sachs', 'BNP']

/** 条款书核对的必看字段（执行单 vs 发行商 Final Termsheet 逐字段比对） */
export const TS_VALIDATION_FIELDS = ['Notional', 'Underlying', 'Strike', 'Knock-In', 'Coupon', 'Settlement'] as const
