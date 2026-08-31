// 上手方的成交确认邮件 → 交易要素。
//
// 为什么这一屏值得单独存在：
// 场外产品成交在电话/邮件里完成，发行商随后发一封确认邮件。交易员原来的动作是
// 照着这封邮件手打一张 Excel，再 share 给 Trade Support 重新录入簿记——**两次
// 手工录入，第二次在抄第一次**。系统能直接从这封邮件抽取，两次都省掉。
//
// 但这一端比需求那端能做得更硬：需求抽取只能核"客户说没说过"，没有第二个真相
// 可比；成交确认不一样，**内部已经有一份客户确认时锁死的指令**。所以字段分成
// 两类，责任完全不同：
//
//   · 应当一致的（标的/名义/行权/KI/结算…）：逐项对着已确认指令比。
//     不一致 = 上手方发错了确认，要当场抓住，不是交易员该"确认"的东西。
//   · 唯一的新信息（成交票息）：没有第二份可比，只有交易员知道他成交在哪个价，
//     必须他亲自确认。它同时决定了本单实际价差。
//
// 这个分法就是"智能簿记"的实际含义：把交易员的注意力从核九项压到确认一个数。

import type { SourceDoc } from '../../components/SourceReview'

/** 成交要素的核验状态——比需求那端的 origin 多了"和内部记录比对"这一维 */
export type FillCheck =
  /** 与已确认指令逐字一致 */
  | 'matches'
  /** 与已确认指令不一致——上手方确认有误 */
  | 'mismatch'
  /** 邮件带来的新信息，内部无可比对象，须交易员确认 */
  | 'new'
  /** 来自内部记录，不在这封邮件里 */
  | 'internal'

export const FILL_CHECK_LABEL: Record<FillCheck, string> = {
  matches: '与指令一致',
  mismatch: '与指令不符',
  new: '需交易员确认',
  internal: '内部记录',
}

/** 映射到 need-row 已有的配色档位，不新造一套 */
export const FILL_CHECK_TONE: Record<FillCheck, string> = {
  matches: 'stated',
  mismatch: 'mismatch',
  new: 'derived',
  internal: 'profile',
}

export interface FillFieldSpec {
  key: string
  label: string
  /** 对应 Trade Record 里的字段名 */
  fieldLabel: string
  check: FillCheck
  /** 行尾来源小字 */
  source: string
}

/**
 * 字段清单。check 是**声明**的期望，实际状态由 buildFillFields 用
 * 已确认指令逐项比出来——写死在这里的只是"这一项该不该有可比对象"。
 */
export const FILL_FIELDS: FillFieldSpec[] = [
  { key: 'issuer', label: '发行商', fieldLabel: 'Issuer', check: 'matches', source: '确认邮件抬头' },
  { key: 'underlying', label: '标的', fieldLabel: 'Underlying', check: 'matches', source: '确认邮件第 2 行' },
  { key: 'notional', label: '名义本金', fieldLabel: 'Notional', check: 'matches', source: '确认邮件第 2 行' },
  { key: 'strike', label: '行权价', fieldLabel: 'Strike', check: 'matches', source: '确认邮件第 3 行' },
  { key: 'ki', label: 'Knock-In', fieldLabel: 'Knock-In', check: 'matches', source: '确认邮件第 3 行' },
  { key: 'fill', label: '成交票息', fieldLabel: 'Issuer Fill Coupon', check: 'new', source: '确认邮件第 4 行' },
  { key: 'tradeDate', label: '成交时间', fieldLabel: 'Trade Time', check: 'new', source: '确认邮件第 4 行' },
  { key: 'settlement', label: '结算', fieldLabel: 'Settlement', check: 'matches', source: '确认邮件第 5 行' },
  { key: 'ticket', label: '对手方单号', fieldLabel: 'Ticket', check: 'new', source: '确认邮件落款' },
  { key: 'clientCoupon', label: '对客票息', fieldLabel: 'Client Coupon', check: 'internal', source: '客户确认时锁死，不在本邮件内' },
]

export interface FillFieldView {
  key: string
  label: string
  value: string
  source: string
  check: FillCheck
  checkLabel: string
  tone: string
  /** 与指令不符 —— 整行走警示色 */
  open: boolean
  /** 期望值（仅不一致时用来解释差在哪） */
  expected?: string
}

/**
 * 把邮件抽取值和已确认指令比出每一项的状态。
 * `expected` 传的是已确认指令里的对应值；缺了就退回「无可比对象」。
 */
export function buildFillFields(
  extracted: Record<string, string>,
  expected: Record<string, string | undefined>,
): FillFieldView[] {
  return FILL_FIELDS.map((f) => {
    const value = extracted[f.key] ?? '—'
    const want = expected[f.key]
    // 声明为可比的字段才真去比；比不了就不假装比过了
    const check: FillCheck =
      f.check !== 'matches' ? f.check : want === undefined ? 'new' : norm(want) === norm(value) ? 'matches' : 'mismatch'
    return {
      key: f.key,
      label: f.label,
      value,
      source: f.source,
      check,
      checkLabel: FILL_CHECK_LABEL[check],
      tone: FILL_CHECK_TONE[check],
      open: check === 'mismatch',
      expected: check === 'mismatch' ? want : undefined,
    }
  })
}

/** 比对前把无关差异抹平：空白、百分号后缀、大小写 */
function norm(s: string): string {
  return s.replace(/\s+/g, '').replace(/（.*?）|\(.*?\)/g, '').toLowerCase()
}

/** 发行商成交确认邮件的正文 */
export function fillConfirmEmail(input: {
  issuer: string
  notional: string
  strike: string
  ki: string
  fill: string
  tradeTime: string
  settlement: string
  ticket: string
}): SourceDoc {
  return {
    senderInitials: 'MS',
    senderName: `${input.issuer} · Structured Products Desk`,
    toLabel: '收件人:  Ken (Dealer) · 抄送 Trade Support',
    time: '14:44',
    subject: `Trade Confirmation — FCN / Tencent 0700.HK / ${input.ticket}`,
    paragraphs: [
      ['Hi Ken,'],
      [
        'We confirm the following trade executed today: FCN linked to ',
        { key: 'underlying', text: 'Tencent (0700.HK)', color: 'purple' },
        ', notional ',
        { key: 'notional', text: input.notional, color: 'purple' },
        '.',
      ],
      [
        'Strike ',
        { key: 'strike', text: input.strike, color: 'green' },
        ' of initial, knock-in ',
        { key: 'ki', text: input.ki, color: 'green' },
        ' of initial, observed at maturity.',
      ],
      [
        'Coupon fixed at ',
        { key: 'fill', text: `${input.fill} p.a.`, color: 'orange' },
        ', payable monthly. Executed ',
        { key: 'tradeDate', text: input.tradeTime, color: 'orange' },
        '.',
      ],
      ['Settlement ', { key: 'settlement', text: input.settlement, color: 'blue' }, '. Termsheet to follow separately.'],
      ['Regards,', { br: true }, `${input.issuer} Structured Products`],
      [{ key: 'ticket', text: `Our ref: ${input.ticket}`, color: 'blue' }],
    ],
    footLabel: '邮件 · 14:44 收到 · 上手方确认',
    sourceIdLabel: '来源 ID',
    sourceId: 'issuer-conf-20250516-1444',
    missingNotes: {
      clientCoupon: {
        tone: 'ok',
        text: '对客票息不在这封邮件里——它在客户确认那一刻就锁死了。上手成交价与它的差额即本单实际价差，由系统核算，不需要交易员填。',
      },
    },
  }
}
