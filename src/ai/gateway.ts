// 客户端侧的模型调用入口。
//
// 三条规则，都是为了现场不出事：
//  1. 默认脚本模式。要真调用必须显式打开——不会因为配了 key 就自动变活。
//  2. 任何失败（没 key / 超时 / 上游报错 / 返回空）都静默回退脚本，不弹错。
//  3. 调用不经过它就没有 kill switch。所有假 AI 接缝都从这里走。

export type AiMode = 'script' | 'live'

const KEY = 'sp-ai-mode'

export function getAiMode(): AiMode {
  if (typeof window === 'undefined') return 'script'
  return window.localStorage.getItem(KEY) === 'live' ? 'live' : 'script'
}

export function setAiMode(mode: AiMode) {
  window.localStorage.setItem(KEY, mode)
}

export interface AskOptions {
  /** 发起调用的技能 id，和 skills.ts 的 manifest 对得上；网关按它记轨迹 */
  skill: string
  system: string
  user: string
  /** 脚本模式、或任何失败时返回它 */
  fallback: string
  temperature?: number
  json?: boolean
  timeoutMs?: number
}

export interface AskResult {
  text: string
  /** live = 真模型返回；script = 脚本；fallback = 想真调但失败了 */
  source: 'live' | 'script' | 'fallback'
  ms?: number
  reason?: string
}

/**
 * 唯一的模型调用口。
 * 接入某个假 AI 接缝 = 把它的返回值换成 await ask({...})，签名不用改。
 */
export async function ask(opts: AskOptions): Promise<AskResult> {
  if (getAiMode() !== 'live') return { text: opts.fallback, source: 'script' }
  const started = Date.now()
  try {
    const res = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        skill: opts.skill,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        temperature: opts.temperature,
        json: opts.json,
        timeoutMs: opts.timeoutMs,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { text: opts.fallback, source: 'fallback', reason: body?.error ?? `http_${res.status}`, ms: Date.now() - started }
    }
    const data = await res.json()
    const text = String(data?.content ?? '').trim()
    if (!text) return { text: opts.fallback, source: 'fallback', reason: 'empty', ms: Date.now() - started }
    return { text, source: 'live', ms: Date.now() - started }
  } catch {
    return { text: opts.fallback, source: 'fallback', reason: 'network', ms: Date.now() - started }
  }
}

export interface GatewayHealth {
  providers: { id: string; model: string; keyConfigured: boolean; keyEnv: string }[]
  active: string
}

export async function gatewayHealth(): Promise<GatewayHealth | null> {
  try {
    const res = await fetch('/api/llm/health')
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

export interface GatewayTrace {
  count: number
  okRate: number | null
  avgMs: number | null
  entries: { id: string; at: string; skill: string; provider: string; model: string; ms: number; ok: boolean; error?: string }[]
}

export async function gatewayTrace(): Promise<GatewayTrace | null> {
  try {
    const res = await fetch('/api/llm/trace')
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}


// ── 流式 ────────────────────────────────────────────────────────────────
export interface StreamOptions extends AskOptions {
  /** 每收到一块就回调，参数是**累计**文本 */
  onDelta: (accumulated: string) => void
}

/**
 * 流式调用。行为和 ask() 一致：脚本模式直接返回 fallback，
 * 任何失败静默回退——调用方不需要写 try/catch。
 */
export async function askStream(opts: StreamOptions): Promise<AskResult> {
  if (getAiMode() !== 'live') return { text: opts.fallback, source: 'script' }
  const started = Date.now()
  try {
    const res = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        skill: opts.skill,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        temperature: opts.temperature,
        json: opts.json,
        stream: true,
        timeoutMs: opts.timeoutMs,
      }),
    })
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}))
      return { text: opts.fallback, source: 'fallback', reason: body?.error ?? `http_${res.status}`, ms: Date.now() - started }
    }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let acc = ''
    let failed: string | null = null
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
          if (evt.delta) {
            acc += evt.delta
            opts.onDelta(acc)
          }
          if (evt.error) failed = evt.error
          if (evt.done && typeof evt.content === 'string' && evt.content) acc = evt.content
        } catch { /* 半个事件，等下一块 */ }
      }
    }
    if (failed || !acc.trim()) {
      return { text: opts.fallback, source: 'fallback', reason: failed ?? 'empty', ms: Date.now() - started }
    }
    return { text: acc, source: 'live', ms: Date.now() - started }
  } catch {
    return { text: opts.fallback, source: 'fallback', reason: 'network', ms: Date.now() - started }
  }
}
