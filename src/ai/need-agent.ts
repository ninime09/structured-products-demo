// 需求字段提取：把 Alice / David / 客户的讨论，落回客户需求摘要的字段上。
//
// 为什么要有这个：需求不是从邮件里一次读出来的，是三方讨论出来的。
// 卡上却全写着「邮件第 N 行」，等于在说需求是读出来的——和真实过程是反的。
//
// 分权和别处一致：模型只能**提议**改哪个字段、改成什么、依据是什么；
// 落到卡上必须由 RM 或产品专家点确认。需求字段会驱动后面所有产物
// （RFQ、条款书、簿记），不能让模型自己写进去。

import { runAgent } from './agent'
import { parseAgentJson } from './json'
import { assembleContext } from './context'
import type { ContextSlice, ContextSource } from './context'
import type { AgentStep } from './agent'

const SKILL = 'need-extractor'

/** 书记员要的：讨论本身，加上"现在已经出过什么"——避免把已经在方向建议里的东西再提一遍 */
export const SLICES: ContextSlice[] = ['case.truth', 'room.discussion', 'artifact.current']

const SYSTEM = `你是华泰国际结构化产品台的需求书记员。
交易室里 RM（客户经理）和产品专家正在和客户来回讨论，你的唯一任务是：
判断这轮讨论有没有**确定**了客户需求摘要里某个还没定的字段，有就提议更新。

铁律：
· 只提议讨论里**明确出现**的结论。没说的、你推测的、还在讨论中的，一律不提。
· 宁可一条都不提，也不要凑数。空的 updates 是完全正常的输出。
· 数字类结论（集中度上限、敞口）必须调工具核对后再写，不得自己估算。
· 全程简体中文。不要 markdown 标记。
· 过程叙述一句话、40 字以内。没有可提议的就直接输出空结果，不要解释。

输出 JSON（不要代码块）：
{
  "updates": [
    {
      "key": "字段 key，只能从给定清单里选",
      "value": "新取值，简短，像卡片上那样写",
      "source": "依据，写清是谁在什么时候确认的，例如「14:12 客户回复确认」",
      "rationale": "一句话说明为什么这么填"
    }
  ]
}`

export interface NeedUpdateProposal {
  key: string
  value: string
  source: string
  rationale: string
}

export interface NeedExtractResult {
  updates: NeedUpdateProposal[]
  source: 'live' | 'script' | 'fallback'
  ms?: number
  reason?: string
}

export interface NeedField {
  key: string
  label: string
  value: string
  settled: boolean
}

/**
 * 从讨论里提字段更新。
 * 脚本模式或任何失败都返回空——静默，不打断现场。
 */
export async function extractNeedUpdates(
  fields: NeedField[],
  src: ContextSource,
  onStep?: (steps: AgentStep[]) => void,
): Promise<NeedExtractResult> {
  const open = fields.filter((f) => !f.settled)
  if (!open.length) return { updates: [], source: 'script' }

  const assembled = assembleContext(src, SLICES)
  const user = [
    assembled.text,
    '',
    '【还没定下来的字段 —— 只能提议这些】',
    ...open.map((f) => `${f.key}｜${f.label}｜当前：${f.value}`),
    '',
    '【已经定下来的字段（不要重复提议）】',
    ...fields.filter((f) => f.settled).map((f) => `${f.label}：${f.value}`),
  ].join('\n')

  const run = await runAgent({
    skill: SKILL,
    system: SYSTEM,
    user,
    tools: ['get_client_profile', 'get_holdings', 'compute_exposure'],
    maxRounds: 3,
    jsonFinal: true,
    onStep: onStep ?? (() => {}),
    timeoutMs: 30_000,
  })
  if (run.source !== 'live' || !run.content) {
    return { updates: [], source: run.source === 'live' ? 'fallback' : 'script', ms: run.ms }
  }

  try {
    const raw = parseAgentJson<Record<string, unknown>>(run.content)
    if (!raw) throw new Error('无法从输出里取出 JSON')
    const allowed = new Set(open.map((f) => f.key))
    const updates = (Array.isArray(raw.updates) ? raw.updates : [])
      .map((u: Record<string, unknown>) => ({
        key: String(u?.key ?? ''),
        value: String(u?.value ?? '').trim(),
        source: String(u?.source ?? '').trim(),
        rationale: String(u?.rationale ?? '').trim(),
      }))
      // 模型只能动还没定的字段——已确认的字段不接受覆盖
      .filter((u: NeedUpdateProposal) => allowed.has(u.key) && u.value && u.value.length <= 40)
      .slice(0, 3)
    return { updates, source: 'live', ms: run.ms }
  } catch (err) {
    console.warn('[need-agent] 解析失败', (err as Error).message, run.content.slice(0, 300))
    return { updates: [], source: 'fallback', ms: run.ms, reason: '解析失败' }
  }
}
