// 上下文装配层。
//
// 在这之前，四个 agent 各写各的上下文：方向 agent 手拼邮件要点，结构 agent 只拿到
// 一个 directions 数组，私区应答连交易室发生过什么都不知道。结果就是"改一个地方、
// 别处照旧"——给方向 agent 补上「上一版」之后，结构 agent 里同样的洞还在。
//
// 现在反过来：技能**声明**它要哪几块上下文，装配器在调用那一刻从同一份 state 现场拼。
// 和 manifest 声明数据面是同一个思路——声明即上限，也即可审计。
//
// 这一层只做装配，不做取数：能不能读某个数据面仍由 planes.ts 的 manifest 把关。

export type ContextSlice =
  | 'case.truth'        // 阶段 / 状态 / 负责人 / 下一步
  | 'client.email'      // 客户原始诉求
  | 'need.brief'        // 客户需求摘要（含讨论写入的字段与其来源）
  | 'room.discussion'   // 交易室最近的讨论
  | 'artifact.current'  // 当前已产出的产物
  | 'draft.pending'     // 本人私区里待确认的草稿
  | 'prior.version'     // 这个技能上一版的产出

export interface ContextSource {
  truth: {
    stageLabel: string
    statusLabel: string
    owner: string
    nextAction: string
    waitingOn: string | null
  }
  clientEmail: string
  needFields: { label: string; value: string; source: string; open: boolean; origin: string }[]
  discussion: { author: string; role: string; text: string }[]
  artifacts: { title: string; status: string; version: number; summary: string }[]
  pendingDrafts: { label: string; text: string }[]
  /** 调用方按技能填：这个技能上一次产出了什么 */
  priorVersion?: string
}

export interface AssembledContext {
  text: string
  /** 真正装进去的块——空块不算，写进审计用 */
  used: ContextSlice[]
}

const LABEL: Record<ContextSlice, string> = {
  'case.truth': '当前流程状态',
  'client.email': '客户原始诉求',
  'need.brief': '客户需求摘要',
  'room.discussion': '交易室最近的讨论',
  'artifact.current': '已产出的产物',
  'draft.pending': '你私区里待确认的草稿',
  'prior.version': '你上一版的产出',
}

/**
 * 按声明装配上下文。
 * 顺序固定（不按声明顺序）——同一个技能每次装出来的结构一致，模型才好稳定读。
 */
export function assembleContext(src: ContextSource, slices: ContextSlice[]): AssembledContext {
  const want = new Set(slices)
  const blocks: string[] = []
  const used: ContextSlice[] = []
  const add = (slice: ContextSlice, body: string) => {
    if (!want.has(slice) || !body.trim()) return
    used.push(slice)
    blocks.push(`【${LABEL[slice]}】\n${body.trim()}`)
  }

  add('case.truth', [
    `阶段：${src.truth.stageLabel} · ${src.truth.statusLabel}`,
    `当前负责人：${src.truth.owner}`,
    `下一步：${src.truth.nextAction}`,
    src.truth.waitingOn ? `正在等：${src.truth.waitingOn}` : '',
  ].filter(Boolean).join('\n'))

  add('client.email', src.clientEmail)

  add('need.brief', src.needFields
    .map((f) => `${f.label}：${f.value}${f.open ? '（未定）' : ''}　—— ${f.source}`)
    .join('\n'))

  add('room.discussion', src.discussion
    .map((m) => `${m.author}（${m.role}）：${m.text}`)
    .join('\n'))

  add('artifact.current', src.artifacts
    .map((a) => `${a.title} v${a.version} · ${a.status}${a.summary ? ` —— ${a.summary}` : ''}`)
    .join('\n'))

  add('draft.pending', src.pendingDrafts
    .map((d) => `〔${d.label}〕\n${d.text}`)
    .join('\n\n'))

  add('prior.version', src.priorVersion ?? '')

  return { text: blocks.join('\n\n'), used }
}

/** 审计里写"这次装配了哪几块"——和数据面授权一样，装了什么要说得清 */
export const describeSlices = (used: ContextSlice[]) =>
  used.length ? used.map((s) => LABEL[s]).join(' · ') : '无'
