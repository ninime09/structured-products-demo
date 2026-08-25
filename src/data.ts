import type { MiniCase, Person, RoleKey } from './types'

export const PEOPLE: Record<RoleKey, Person> = {
  rm: { name: 'Alice', role: 'rm', roleLabel: 'RM · 客户经理', initials: 'AL' },
  ps: { name: 'David', role: 'ps', roleLabel: '产品专家', initials: 'DV' },
  dealer: { name: 'Ken', role: 'dealer', roleLabel: '内部交易员', initials: 'KE' },
  ops: { name: 'Mia', role: 'ops', roleLabel: '簿记 / 核对', initials: 'MI' },
}

export const ROLE_SHORT: Record<RoleKey, string> = {
  rm: '客户经理',
  ps: '产品专家',
  dealer: '交易员',
  ops: '簿记 / 核对',
}

// Cases other than the live SP-001, used by nav / assistant / tasks.
export const OTHER_CASES: MiniCase[] = [
  {
    caseId: 'SP-002',
    name: 'AAPL Autocall',
    stageLabel: '客户报价',
    statusLabel: '等待客户',
    tone: 'progress',
    ownerRole: 'rm',
    ownerName: 'Alice',
    waitingOn: '客户',
    nextAction: '跟进客户对报价的反馈',
    reason: '客户报价卡已发送 2 天，客户尚未回复',
    deadline: '报价有效至明日 12:00',
    priority: 'medium',
    attention: null,
  },
  {
    caseId: 'SP-003',
    name: 'Alibaba FCN',
    stageLabel: '定价',
    statusLabel: '报价即将过期',
    tone: 'warning',
    ownerRole: 'dealer',
    ownerName: 'Ken',
    waitingOn: '—',
    nextAction: '在报价过期前决定：准备客户报价或请求重报',
    reason: 'GS 最优报价 4 分钟后过期',
    deadline: '04:00 后过期',
    priority: 'high',
    attention: 'warning',
  },
  {
    caseId: 'SP-004',
    name: 'HSI Booster Note',
    stageLabel: '结构设计',
    statusLabel: '结构待审批',
    tone: 'neutral',
    ownerRole: 'ps',
    ownerName: 'David',
    waitingOn: '—',
    nextAction: '产品专家审批结构方案',
    reason: 'AI 已起草 3 个候选结构，等待审批',
    deadline: '今日内',
    priority: 'medium',
    attention: 'dot',
  },
  {
    caseId: 'SP-005',
    name: 'Basket Note',
    stageLabel: '条款验证',
    statusLabel: '异常 Exception',
    tone: 'critical',
    ownerRole: 'ops',
    ownerName: 'Mia',
    waitingOn: '—',
    nextAction: '核对 Termsheet mismatch：Coupon 9.80% ≠ 9.85%',
    reason: 'AI 校验发现条款书 Coupon 与执行单不一致',
    deadline: '尽快',
    priority: 'high',
    attention: 'exception',
  },
]

export const ASSISTANT_CHIPS = [
  '今天哪个 Case 最紧急？',
  'SP-001 现在卡在哪一步？',
  '有哪些报价快过期？',
]

export function assistantReply(question: string, sp001Status: string, sp001Next: string): string[] {
  if (question.includes('SP-001')) {
    return [
      `SP-001 · Tencent FCN 当前状态：${sp001Status}。`,
      `下一步动作：${sp001Next}`,
      '依据：Case State（非聊天记录汇总），可在 Trade Room 右栏核对。',
    ]
  }
  if (question.includes('过期')) {
    return [
      'SP-003 · Alibaba FCN：GS 最优报价约 4 分钟后过期，Ken 需要在过期前决定重报或准备客户报价。',
      'SP-002 · AAPL Autocall：客户报价有效至明日 12:00，暂不紧急。',
    ]
  }
  return [
    '按优先级排序，当前最需要处理的是：',
    '1. SP-005 · Basket Note — Termsheet mismatch（Exception），需要产品专家处理。',
    '2. SP-003 · Alibaba FCN — GS 报价 4 分钟后过期，Dealer 需尽快决策。',
    `3. SP-001 · Tencent FCN — ${sp001Next}`,
  ]
}
