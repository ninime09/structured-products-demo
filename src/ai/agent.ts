// Agent 循环。
//
// 和「单次调用」的区别：模型自己决定查什么、按什么顺序查，结果回喂后再想下一步。
// 每一步（叙述 / 工具调用 / 工具结果）都实时发到界面——
// 你看到的是它走过的路径，不是一个转圈的图标。
//
// 流式在这里是**步骤级**的，不是 token 级：参考 Codex/Manus，
// 有价值的是"它在做什么"，不是字一个个蹦出来。

import { getAiMode } from './gateway'
import { runTool, toolBrief, toolDefs } from './tools'
import type { ToolDef } from './tools'

export type AgentStep =
  | { kind: 'thought'; text: string; streaming?: boolean }
  | { kind: 'tool'; name: string; label: string; args: Record<string, unknown>; result?: unknown; ms?: number; ok?: boolean; denied?: boolean }
  | { kind: 'answer'; text: string }
  | { kind: 'error'; text: string }

export interface AgentRunOptions {
  skill: string
  system: string
  user: string
  /** 允许使用的工具名；不传则全部 */
  tools?: string[]
  maxRounds?: number
  /** 最后一轮要求 JSON 输出 */
  jsonFinal?: boolean
  onStep: (steps: AgentStep[]) => void
  timeoutMs?: number
}

export interface AgentRunResult {
  content: string
  steps: AgentStep[]
  rounds: number
  toolCalls: number
  ms: number
  source: 'live' | 'script'
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

/**
 * 跑一轮 agent。脚本模式直接返回空——调用方据此回退。
 * 循环上限是硬的：模型再想查也不能无限查下去。
 */
export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const started = Date.now()
  const steps: AgentStep[] = []
  const emit = () => opts.onStep([...steps])

  if (getAiMode() !== 'live') {
    return { content: '', steps, rounds: 0, toolCalls: 0, ms: 0, source: 'script' }
  }

  const defs: ToolDef[] = toolDefs(opts.tools)
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.user },
  ]
  const maxRounds = opts.maxRounds ?? 6
  let toolCalls = 0
  // 只补一次：补不出来就让它回退，别把轮数耗光
  let forcedJson = false

  for (let round = 1; round <= maxRounds; round++) {
    const isLast = round === maxRounds

    // 这一轮的叙述占哪一步——第一个字到了才创建，没话说就不占位
    let thoughtIdx = -1
    // 流式期间已经亮出来的工具行：tool_calls 的 index → steps 下标
    const shown = new Map<number, number>()

    const out = await streamRound(
      {
        skill: opts.skill,
        messages,
        // 最后一轮收掉工具，逼它给结论
        tools: isLast || forcedJson ? undefined : defs,
        json: !!opts.jsonFinal && (isLast || forcedJson),
        temperature: 0.4,
        stream: true,
        timeoutMs: opts.timeoutMs ?? 40_000,
      },
      (text) => {
        // 终稿是 JSON，要渲染成产物卡，不能以原文流进轨迹。
        // 模型常常先写一句"让我输出 JSON"再开始吐 {，所以不能只看开头——
        // 从第一个 { 或 [ 起整段截掉，只留前面那句话。
        const prose = opts.jsonFinal ? text.replace(/[{[][\s\S]*$/, '').trim() : text
        if (!prose) return
        if (thoughtIdx < 0) thoughtIdx = steps.push({ kind: 'thought', text: prose, streaming: true }) - 1
        else steps[thoughtIdx] = { kind: 'thought', text: prose, streaming: true }
        emit()
      },
      (index, name) => {
        if (shown.has(index)) return
        // 入参还在流，先用短标签把这一行亮出来
        shown.set(index, steps.push({ kind: 'tool', name, label: toolBrief(name), args: {} }) - 1)
        emit()
      },
    )

    if (!out) {
      steps.push({ kind: 'error', text: '模型不可用，已回退脚本' })
      emit()
      return { content: '', steps, rounds: round, toolCalls, ms: Date.now() - started, source: 'script' }
    }

    const answer = out.content.trim()
    const calls = out.toolCalls

    // 叙述定稿
    if (thoughtIdx >= 0) {
      const prose = opts.jsonFinal ? answer.replace(/[{[][\s\S]*$/, '').trim() : answer
      if (prose) steps[thoughtIdx] = { kind: calls.length ? 'thought' : 'answer', text: prose }
      else steps.splice(thoughtIdx, 1) // 这一轮只有终稿 JSON，不留在轨迹里
      emit()
    }

    if (!calls.length) {
      // 要 JSON 终稿，但它查完就写了段总结收尾——这种时候不能直接当终稿返回。
      // json_object 只在最后一轮才开，而循环在"任何一轮没有工具调用"时就会退出，
      // 于是那段散文被当成结果，后面解析必然失败、静默回退脚本。
      // 补一轮，明确要求只输出 JSON。
      if (opts.jsonFinal && !answer.includes('{') && !forcedJson) {
        forcedJson = true
        messages.push({ role: 'assistant', content: out.content || null })
        messages.push({ role: 'user', content: '不要再写说明了。现在只输出那个 JSON 对象本身，不要代码块、不要前后文字。' })
        continue
      }
      return { content: answer, steps, rounds: round, toolCalls, ms: Date.now() - started, source: 'live' }
    }

    messages.push({ role: 'assistant', content: out.content || null, tool_calls: calls })

    for (let ci = 0; ci < calls.length; ci++) {
      const call = calls[ci]
      toolCalls++
      const args = safeParse(call.function.arguments)
      // 流式已经亮过的那一行就地更新，没亮过的补一行
      const idx = shown.get(ci) ?? (steps.push({ kind: 'tool', name: call.function.name, label: toolBrief(call.function.name), args }) - 1)
      const res = runTool(call.function.name, call.function.arguments, { skill: opts.skill })
      steps[idx] = { kind: 'tool', name: call.function.name, label: res.label, args, result: res.result, ms: res.ms, ok: res.ok, denied: res.denied }
      emit()
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(res.result) })
    }
  }

  steps.push({ kind: 'error', text: `已达循环上限（${maxRounds} 轮）` })
  emit()
  return { content: '', steps, rounds: maxRounds, toolCalls, ms: Date.now() - started, source: 'script' }
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s || '{}')
  } catch {
    return {}
  }
}

interface RawCall {
  id: string
  type: string
  function: { name: string; arguments: string }
}

/**
 * 跑一轮，边收边回调。
 * onDelta 收到的是**累计**文本；onToolName 在工具名一出现时就触发，
 * 这样"它正在查什么"能比结果先一步显示出来。
 * 任何失败返回 null——调用方据此回退。
 */
async function streamRound(
  body: Record<string, unknown>,
  onDelta: (accumulated: string) => void,
  onToolName: (index: number, name: string) => void,
): Promise<{ content: string; toolCalls: RawCall[] } | null> {
  const res = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null)
  if (!res || !res.ok || !res.body) return null

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let acc = ''
  let calls: RawCall[] = []
  let failed = false

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const parts = buf.split('\n\n')
    buf = parts.pop() ?? ''
    for (const chunk of parts) {
      const line = chunk.trim()
      if (!line.startsWith('data:')) continue
      try {
        const evt = JSON.parse(line.slice(5).trim())
        if (evt.delta) { acc += evt.delta; onDelta(acc) }
        if (evt.tool) onToolName(evt.tool.index, evt.tool.name)
        if (evt.error) failed = true
        if (evt.done) {
          if (typeof evt.content === 'string' && evt.content) acc = evt.content
          if (Array.isArray(evt.tool_calls)) calls = evt.tool_calls
        }
      } catch { /* 半个事件，等下一块 */ }
    }
  }
  if (failed) return null
  return { content: acc, toolCalls: calls }
}
