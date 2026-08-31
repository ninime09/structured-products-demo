import type { RoleKey, StageKey } from '../../types'

// FCN 产品线的正式流转表：每一行对应一个需要人确认的正式动作。
// 引擎（store.formalTransition）只按表执行五步骨架；本表之外的状态变化
// （AI 起草、时效标记等叙事性 patch）不属于正式流转，不入表。
export interface TransitionRule {
  /** 审计日志里的动作名（保持与既有 audit 文案一致） */
  auditAction: string
  /** 确认弹窗 Prepared action 标签 */
  metaLabel: string
  from: string
  to: string
  toLabel: string
  toTone: 'neutral' | 'progress' | 'success' | 'warning' | 'critical'
  /** 流转后进入的阶段；不变则省略 */
  stage?: StageKey
  /** 流转后的负责人角色；null = 无负责人；省略 = 不变更 */
  owner?: RoleKey | null
  /** 确认弹窗里展示的下一负责人 */
  ownerLabel: string
  /** 谁能执行本动作（权限单一来源，UI 按钮与引擎共用） */
  allowedRoles: RoleKey[]
}

export const FCN_WORKFLOW: Record<string, TransitionRule> = {
  // 客户给的往往是收益范围 / 风险承受 / 期限，不一定指定标的与结构。
  // 需求必须由 RM 与产品专家共同与客户界定，产品专家不是"需求定稿后才接手"。
  inviteSpecialist: {
    auditAction: 'Invite Product Specialist（需求共创）',
    metaLabel: 'Invite product specialist',
    from: 'CLIENT_NEED_DRAFT',
    to: 'CLIENT_NEED_JOINT_REVIEW',
    toLabel: '需求共创中',
    toTone: 'progress',
    // 阶段与负责人都不变：客户关系仍在 RM 手上，产品专家是共创者不是接手人。
    ownerLabel: 'Alice · RM + David · 产品专家',
    allowedRoles: ['rm'],
  },
  confirmNeed: {
    auditAction: 'Confirm Client Need（RM + 产品专家共同确认）',
    metaLabel: 'Client need approval',
    from: 'CLIENT_NEED_JOINT_REVIEW',
    to: 'CLIENT_NEED_APPROVED',
    toLabel: '客户需求已确认',
    toTone: 'success',
    stage: 'structure',
    owner: 'ps',
    ownerLabel: 'David · Product Specialist',
    allowedRoles: ['rm'],
  },
  approveDeviation: {
    auditAction: 'Approve Process Deviation（跳过结构对比）',
    metaLabel: 'Approve process deviation',
    from: 'STRUCTURE_REVIEW',
    to: 'STRUCTURE_APPROVED',
    toLabel: '结构已确认（偏离批准）',
    toTone: 'success',
    stage: 'rfq',
    owner: 'dealer',
    ownerLabel: 'Ken · Dealer',
    allowedRoles: ['ps'],
  },
  approveStructure: {
    auditAction: 'Approve Structure',
    metaLabel: 'Structure approval',
    from: 'STRUCTURE_REVIEW',
    to: 'STRUCTURE_APPROVED',
    toLabel: '结构已确认',
    toTone: 'success',
    stage: 'rfq',
    owner: 'dealer',
    ownerLabel: 'Ken · Dealer',
    allowedRoles: ['ps'],
  },
  returnRFQ: {
    auditAction: 'Return for Modification',
    metaLabel: 'Return for modification',
    from: 'RFQ_READY',
    to: 'STRUCTURE_MODIFICATION_REQUIRED',
    toLabel: '待修改结构',
    toTone: 'warning',
    stage: 'structure',
    owner: 'ps',
    ownerLabel: 'David · Product Specialist',
    allowedRoles: ['dealer', 'ps'],
  },
  acceptPricing: {
    auditAction: 'Accept Pricing Request',
    metaLabel: 'Release market RFQ',
    from: 'RFQ_READY',
    to: 'PRICING_IN_PROGRESS',
    toLabel: '定价进行中',
    toTone: 'progress',
    stage: 'pricing',
    ownerLabel: 'Ken · Dealer',
    allowedRoles: ['dealer'],
  },
  modifyFromPricing: {
    auditAction: 'Return for Modification',
    metaLabel: 'Modify structure',
    from: 'PRICING_IN_PROGRESS',
    to: 'STRUCTURE_MODIFICATION_REQUIRED',
    toLabel: '待修改结构',
    toTone: 'warning',
    stage: 'structure',
    owner: 'ps',
    ownerLabel: 'David · Product Specialist',
    allowedRoles: ['dealer', 'ps'],
  },
  requestRequote: {
    auditAction: 'Request Requote',
    metaLabel: 'Request refreshed quotes',
    from: 'PRICING_IN_PROGRESS',
    to: 'REQUOTE_REQUIRED',
    toLabel: '等待重报',
    toTone: 'warning',
    ownerLabel: 'Ken · Dealer',
    // 客户报价屏允许 RM 发起"请求更新报价"，与定价屏的 Dealer 入口共用本流转
    allowedRoles: ['dealer', 'rm'],
  },
  prepareClientQuote: {
    auditAction: 'Prepare Client Quote（选定 Morgan Stanley）',
    metaLabel: 'Prepare client communication',
    from: 'PRICING_IN_PROGRESS',
    to: 'CLIENT_QUOTE_READY',
    toLabel: '客户报价已就绪',
    toTone: 'progress',
    stage: 'client',
    owner: 'rm',
    ownerLabel: 'Alice · RM',
    allowedRoles: ['dealer'],
  },
  sendClientQuote: {
    auditAction: 'Communicate Quote to Client',
    metaLabel: 'External client communication',
    from: 'CLIENT_QUOTE_READY',
    to: 'WAITING_FOR_CLIENT',
    toLabel: '等待客户',
    toTone: 'progress',
    ownerLabel: 'Alice · RM',
    allowedRoles: ['rm'],
  },
  rejectInstruction: {
    auditAction: 'Reject Detected Instruction',
    metaLabel: 'Reject AI detection',
    from: 'CLIENT_INSTRUCTION_PENDING_CONFIRMATION',
    to: 'WAITING_FOR_CLIENT',
    toLabel: '等待客户',
    toTone: 'progress',
    ownerLabel: 'Alice · RM',
    allowedRoles: ['rm'],
  },
  confirmInstruction: {
    auditAction: 'Confirm Client Instruction',
    metaLabel: 'Formal client instruction',
    from: 'CLIENT_INSTRUCTION_PENDING_CONFIRMATION',
    to: 'CLIENT_INSTRUCTION_CONFIRMED',
    toLabel: '客户指令已确认',
    toTone: 'success',
    stage: 'execution',
    owner: 'dealer',
    ownerLabel: 'Ken · Dealer',
    allowedRoles: ['rm'],
  },
  // 场外产品不走接口：交易员代客户向上手方发出下单指令。
  // 对客条款在客户确认时已锁死，这里不再刷新价格——刷了也不会改对客承诺。
  executeTrade: {
    auditAction: 'Place Order with Issuer（代客下单 · 指令形式）',
    metaLabel: 'Formal execution',
    from: 'EXECUTION_READY',
    to: 'EXECUTED',
    toLabel: '已下单',
    toTone: 'success',
    ownerLabel: 'Ken · Dealer',
    allowedRoles: ['dealer'],
  },
  // 交易员核对上手方成交确认邮件的抽取结果并登记。
  // 这一关不能省：可比对的要素系统能自动核平，但成交票息内部无可比对象——
  // 只有他知道自己成交在哪个价，也只有他签了字，这条记录才有归属。
  confirmTradeRecord: {
    auditAction: 'Confirm Trade Record（成交要素登记）',
    metaLabel: 'Trade record',
    from: 'TRADE_RECORD_REVIEW',
    to: 'BOOKING_REVIEW',
    toLabel: '待簿记录入',
    toTone: 'warning',
    stage: 'execution',
    owner: 'ops',
    ownerLabel: 'Ken · Dealer',
    allowedRoles: ['dealer'],
  },
  // Trade Support 从交易登记记录录入簿记，再与发行商条款书三方核对
  confirmBooking: {
    auditAction: 'Confirm Booking Entry（簿记录入）',
    metaLabel: 'Booking entry',
    from: 'BOOKING_REVIEW',
    to: 'TERMSHEET_REVIEW',
    toLabel: '条款书待核对',
    toTone: 'warning',
    stage: 'termsheet',
    owner: 'ops',
    ownerLabel: 'Mia · Trade Support',
    allowedRoles: ['ops'],
  },
  raiseException: {
    auditAction: 'Raise Exception（Settlement mismatch）',
    metaLabel: 'Route documentation exception',
    from: 'TERMSHEET_REVIEW',
    to: 'EXCEPTION',
    toLabel: '异常 Exception',
    toTone: 'critical',
    ownerLabel: 'MS Documentation / Trade Support',
    allowedRoles: ['ops', 'dealer'],
  },
  resolveException: {
    auditAction: '异常已核实解决（MS 更正条款书为 T+2）',
    metaLabel: 'Resolve exception',
    from: 'EXCEPTION',
    to: 'TERMSHEET_REVIEW',
    toLabel: '条款书待审批',
    toTone: 'warning',
    ownerLabel: 'Mia · Operations',
    allowedRoles: ['ops'],
  },
  approveTermsheet: {
    auditAction: 'Approve Termsheet',
    metaLabel: 'Final term sheet approval',
    from: 'TERMSHEET_REVIEW',
    to: 'COMPLETED',
    toLabel: '已完成',
    toTone: 'success',
    stage: 'done',
    owner: null,
    ownerLabel: 'No further owner',
    allowedRoles: ['ops'],
  },
}

/** 确认弹窗用的状态预览，全部查表，不再手工维护第二份。 */
export function transitionMeta(key: string): { current: string; next: string; nextLabel: string; owner: string; label: string } | null {
  const rule = FCN_WORKFLOW[key]
  if (!rule) return null
  // nextLabel 是人话（"客户需求已确认"），next 是状态机内部名——确认弹窗上给人看的用前者
  return { current: rule.from, next: rule.to, nextLabel: rule.toLabel, owner: rule.ownerLabel, label: rule.metaLabel }
}
