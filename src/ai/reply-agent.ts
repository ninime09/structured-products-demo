// 私区对话 / 划词批注的应答。
//
// 这是最后一处假 AI 接缝：原来是一串正则（/删|去掉|拿掉/、/话术|怎么跟客户/…），
// 换个说法就认不出来了。现在由模型理解意图。
//
// 但**执行权不给模型**。模型只输出两样东西：
//   action —— 从一个封闭集合里选一个（改初稿 / 起草话术 / 提偏离 / 只回答）
//   reply  —— 跟人说的话
// 真正改初稿、生成草稿卡的是 store 里那几个确定性方法，模型碰不到。
// 尤其是「发布到交易室」这道正向门，永远只能人点，任何一句话都触发不了。

import { runAgent } from './agent'
import { parseAgentJson } from './json'
import { assembleContext } from './context'
import type { ContextSlice, ContextSource } from './context'
import type { AgentStep } from './agent'

const SKILL = 'trade-room-copilot'

/**
 * 私区应答要的最全——他可能问任何事。
 * 之前这个 agent 只看得到状态标签和待确认草稿，交易室发生过什么一概不知，
 * 所以"刚才 Alice 说的那个问题"这类话它接不住。
 */
export const SLICES: ContextSlice[] = [
  'case.truth', 'client.email', 'need.brief', 'room.discussion', 'artifact.current', 'draft.pending',
]

/** 模型能选的动作，封闭集合。多一个都没有。 */
export type ReplyAction =
  | 'revise_direction'   // 改方向初稿（需求阶段）
  | 'revise_structure'   // 改交易要素（结构阶段）
  | 'draft_client_note'  // 起草对客说明
  | 'revise_client_email' // 改对客报价邮件正文（未发出）
  | 'propose_deviation'  // 起草流程偏离请求
  | 'answer'             // 只回答，什么都不改

export interface ReplyDecision {
  action: ReplyAction
  reply: string
  /** 改稿类动作：把人的要求复述成一句可留痕的指令 */
  instruction?: string
}

export interface ReplyResult {
  decision: ReplyDecision | null
  source: 'live' | 'script' | 'fallback'
  ms?: number
}

export interface ReplyContext {
  /** 现在有哪些动作是可用的——不可用的不许选 */
  allowed: ReplyAction[]
  /** 划词批注的原文片段 */
  quoted?: string
}

const SYSTEM = `你是华泰国际结构化产品台某位同事的私人 agent，在他的私有工作区里跟他一对一说话。
他可能是问你一个事实、让你改一版初稿、让你起草点什么，或者只是想听你的判断。

你要做两件事：
1. 判断他想要的动作，从给定的可选动作里选一个。不在可选列表里的一律不许选，选 answer。
2. 写一段回话。

回话要求：
· 简体中文，像同事说话，不要机器腔，不要复述他刚说的话。
· 涉及数字（集中度、票息、发行商家数）必须调工具拿，不得自己估。
· 你**不能**替他发布任何东西。改稿、起草都只是产出待他确认的版本，说话时也别暗示"已经发出去了"。
· 判断不确定时选 answer，把不确定说出来，别硬猜一个动作。

过程叙述一句话、40 字以内、纯文本。查够了直接输出 JSON。

输出 JSON（不要代码块）：
{
  "action": "从可选动作里选一个",
  "instruction": "只有改稿类动作才填：把他的要求复述成一句话，会进审计",
  "reply": "跟他说的话"
}`

/**
 * 让模型判断意图并回话。
 * 脚本模式或任何失败都返回 null —— 调用方回退到原来的规则分支。
 */
export async function decideReply(
  message: string,
  ctx: ReplyContext,
  src: ContextSource,
  onStep?: (steps: AgentStep[]) => void,
): Promise<ReplyResult> {
  const assembled = assembleContext(src, SLICES)
  const user = [
    assembled.text,
    '',
    `【此刻可选的动作】${ctx.allowed.join(' / ')}`,
    ctx.quoted ? `\n【他划中的原文】\n${ctx.quoted}` : '',
    `\n【他说】\n${message}`,
  ].filter(Boolean).join('\n')

  const run = await runAgent({
    skill: SKILL,
    system: SYSTEM,
    user,
    tools: ['get_client_profile', 'get_holdings', 'compute_exposure', 'price_indicative', 'issuer_coverage'],
    maxRounds: 4,
    jsonFinal: true,
    onStep: onStep ?? (() => {}),
    timeoutMs: 30_000,
  })
  if (run.source !== 'live' || !run.content) {
    return { decision: null, source: run.source === 'live' ? 'fallback' : 'script', ms: run.ms }
  }

  try {
    const raw = parseAgentJson<Record<string, unknown>>(run.content)
    if (!raw) throw new Error('无法从输出里取出 JSON')
    const reply = String(raw?.reply ?? '').trim()
    if (!reply) return { decision: null, source: 'fallback', ms: run.ms }
    // 越权的动作一律降级成"只回答"——不在可选集合里就是不能做
    const wanted = String(raw?.action ?? 'answer') as ReplyAction
    const action: ReplyAction = ctx.allowed.includes(wanted) ? wanted : 'answer'
    return {
      decision: { action, reply, instruction: String(raw?.instruction ?? '').trim() || undefined },
      source: 'live',
      ms: run.ms,
    }
  } catch (err) {
    console.warn('[reply-agent] 解析失败', (err as Error).message, run.content.slice(0, 300))
    return { decision: null, source: 'fallback', ms: run.ms }
  }
}

/**
 * 按一句话改写对客报价邮件正文。
 *
 * 只改措辞，不碰事实：票息、KI、行权价、时效这些数字是别处算出来的，
 * 模型动了就等于凭空改了报价。所以约束写死在 prompt 里，并在返回后
 * 由调用方按行级差异留痕——改了什么必须看得见。
 */
export async function rewriteClientEmail(
  body: string,
  instruction: string,
  src: ContextSource,
): Promise<{ text: string | null; source: 'live' | 'script' | 'fallback' }> {
  const assembled = assembleContext(src, SLICES)
  const run = await runAgent({
    skill: SKILL,
    system: `你在帮一位客户经理改一封还没发出去的对客报价邮件。

铁律：
· 只改措辞、语气、详略。**任何数字一律不许动**——票息、KI、行权价、名义本金、
  期限、时效声明都是系统算出来的，你改一个字就等于凭空改了报价。
· 风险提示那段可以换说法，但不许弱化、不许删。
· 保持中文、保持落款、保持它是一封能直接发出去的信。
· 只输出改好的邮件全文，不要解释、不要加代码块、不要写"以下是"。`,
    user: `${assembled.text}\n\n【当前正文】\n${body}\n\n【他要你怎么改】${instruction}`,
    tools: [],
    maxRounds: 1,
    onStep: () => {},
    timeoutMs: 30_000,
  })
  if (run.source !== 'live' || !run.content.trim()) return { text: null, source: run.source }
  return { text: run.content.trim(), source: 'live' }
}
