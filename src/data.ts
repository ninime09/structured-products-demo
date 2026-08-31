import type { MiniCase, Person, RoleKey } from './types'

export const PEOPLE: Record<RoleKey, Person> = {
  rm: { name: 'Alice', role: 'rm', roleLabel: 'RM · 客户经理', initials: 'AL' },
  ps: { name: 'David', role: 'ps', roleLabel: '产品专家', initials: 'DV' },
  dealer: { name: 'Ken', role: 'dealer', roleLabel: '内部交易员', initials: 'KE' },
  ops: { name: 'Mia', role: 'ops', roleLabel: 'Trade Support', initials: 'MI' },
}

export const ROLE_SHORT: Record<RoleKey, string> = {
  rm: '客户经理',
  ps: '产品专家',
  dealer: '交易员',
  ops: 'Trade Support',
}

// 可拉入协作的同事：各有擅长，可参与讨论；不占四个正式审批角色。
export const INVITABLE: { person: Person; note: string; greeting: string }[] = [
  { person: { name: 'Sam', role: 'ops', roleLabel: '合规 · 协作', initials: 'SA', guest: true }, note: '适当性与留痕', greeting: '收到，我先看下适当性与留痕记录，有需要随时 @ 我。' },
  { person: { name: 'Leo', role: 'dealer', roleLabel: '交易员 · 协作', initials: 'LE', guest: true }, note: '询价支援', greeting: '在的，询价和报价比较这块我可以搭把手。' },
  { person: { name: 'Nina', role: 'rm', roleLabel: '运营 · 协作', initials: 'NI', guest: true }, note: '归档与运营', greeting: '运营侧我来盯，归档材料齐不齐我会提前看。' },
]

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
    deadline: '报价已发出 2 天，需跟进',
    priority: 'medium',
    attention: null,
  },
  {
    caseId: 'SP-003',
    name: 'Alibaba FCN',
    stageLabel: '定价',
    statusLabel: '需当日决策',
    tone: 'warning',
    ownerRole: 'dealer',
    ownerName: 'Ken',
    waitingOn: '—',
    nextAction: '今日内决定：准备客户报价或请求重报',
    reason: '报价当日有效，跨日未成交需重新询价',
    deadline: '今日收市前',
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
  '有哪些报价今日需决策？',
]

export function assistantReply(question: string, sp001Status: string, sp001Next: string): string[] {
  if (question.includes('SP-001')) {
    return [
      `SP-001 · Tencent FCN 当前状态：${sp001Status}。`,
      `下一步动作：${sp001Next}`,
      '依据：Case State（非聊天记录汇总），可在 Trade Room 右栏核对。',
    ]
  }
  if (question.includes('过期') || question.includes('决策')) {
    return [
      'SP-003 · Alibaba FCN：报价当日有效，今日未成交需重新询价，Ken 需在收市前决定。',
      'SP-002 · AAPL Autocall：客户报价已发出 2 天未回复，建议跟进。',
    ]
  }
  return [
    '按优先级排序，当前最需要处理的是：',
    '1. SP-005 · Basket Note — Termsheet mismatch（Exception），需要产品专家处理。',
    '2. SP-003 · Alibaba FCN — 报价当日有效，Dealer 需在收市前决策。',
    `3. SP-001 · Tencent FCN — ${sp001Next}`,
  ]
}
