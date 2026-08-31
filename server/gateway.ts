// 模型网关：跑在 Vite dev server 里的一段中间件。
//
// 存在的两个理由：
//  1. API key 绝不能进浏览器 bundle。前端只认识 /api/llm，key 留在服务端。
//  2. 统一接入点 = 可切 provider、可记调用轨迹、可加限流与超时。
//     这就是架构材料里「模型网关」那一页的实物。
//
// 它不做业务判断——提示词、schema、兜底规则都在应用侧。

import type { IncomingMessage, ServerResponse } from 'node:http'

export interface ProviderConfig {
  id: string
  baseUrl: string
  defaultModel: string
  apiKeyEnv: string
}

/** 换 provider = 加一条配置，应用侧不动 */
export const PROVIDERS: Record<string, ProviderConfig> = {
  deepseek: {
    id: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
  },
  openai: {
    id: 'openai',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
}

export interface TraceEntry {
  id: string
  at: string
  /** 哪个技能发起的——和 skills.ts 的 manifest 对得上 */
  skill: string
  provider: string
  model: string
  ms: number
  ok: boolean
  promptChars: number
  completionChars: number
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: string
}

/** 调用轨迹：内存里留最近 200 条，供演示时展示"模型被调用过几次、花了多久" */
const TRACE: TraceEntry[] = []
const TRACE_MAX = 200
let seq = 0

export function readTrace(): TraceEntry[] {
  return [...TRACE].reverse()
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 1_000_000) reject(new Error('payload too large'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, code: number, body: unknown) {
  res.statusCode = code
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export interface GatewayRequest {
  skill: string
  /** 多轮：assistant 的 tool_calls 与 tool 角色的结果都原样带回来 */
  messages: Record<string, unknown>[]
  /** 工具定义。网关只透传，不解释——工具在应用侧执行 */
  tools?: unknown[]
  provider?: string
  model?: string
  temperature?: number
  /** 传了就要求返回 JSON（DeepSeek / OpenAI 都支持 json_object） */
  json?: boolean
  /** 流式：以 SSE 把增量吐给前端，让"思考中"是真的在动 */
  stream?: boolean
  timeoutMs?: number
}

export async function handleLlm(req: IncomingMessage, res: ServerResponse, env: Record<string, string>) {
  let payload: GatewayRequest
  try {
    payload = JSON.parse(await readBody(req))
  } catch {
    return json(res, 400, { error: 'invalid json body' })
  }
  if (!payload?.skill || !Array.isArray(payload.messages) || !payload.messages.length) {
    return json(res, 400, { error: 'skill 与 messages 必填' })
  }

  const provider = PROVIDERS[payload.provider ?? env.LLM_PROVIDER ?? 'deepseek']
  if (!provider) return json(res, 400, { error: `未知 provider: ${payload.provider}` })

  const key = env[provider.apiKeyEnv]
  const id = `t${++seq}`
  const started = Date.now()
  const promptChars = payload.messages.reduce((n, m) => n + String(m.content ?? '').length, 0)

  const record = (e: Partial<TraceEntry>) => {
    const entry: TraceEntry = {
      id,
      at: new Date().toISOString(),
      skill: payload.skill,
      provider: provider.id,
      model: payload.model ?? provider.defaultModel,
      ms: Date.now() - started,
      ok: false,
      promptChars,
      completionChars: 0,
      ...e,
    }
    TRACE.push(entry)
    if (TRACE.length > TRACE_MAX) TRACE.shift()
    return entry
  }

  // 没配 key 就明确告诉前端"未配置"——前端据此回退脚本，不当成故障
  if (!key) {
    record({ ok: false, error: 'no_api_key' })
    return json(res, 503, { error: 'no_api_key', hint: `在 .env 里设置 ${provider.apiKeyEnv}` })
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), payload.timeoutMs ?? 20_000)
  try {
    const upstream = await fetch(provider.baseUrl, {
      method: 'POST',
      signal: ac.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: payload.model ?? provider.defaultModel,
        messages: payload.messages,
        temperature: payload.temperature ?? 0.3,
        ...(payload.tools?.length ? { tools: payload.tools } : {}),
        ...(payload.json && !payload.tools?.length ? { response_format: { type: 'json_object' } } : {}),
        ...(payload.stream ? { stream: true } : {}),
      }),
    })

    // 流式：把上游 SSE 转成我们自己的 SSE，前端边收边解析
    if (payload.stream && upstream.ok && upstream.body) {
      res.statusCode = 200
      res.setHeader('content-type', 'text/event-stream; charset=utf-8')
      res.setHeader('cache-control', 'no-cache')
      res.setHeader('connection', 'keep-alive')
      const reader = upstream.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let full = ''
      // tool_calls 在流式里是按 index 分片来的：name 通常一次到齐，arguments 是一小段一小段拼。
      // 不在这里攒起来，应用侧就拿不到工具调用，agent 循环也就没法流式跑。
      const acc = new Map<number, { id: string; name: string; args: string }>()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const parts = buf.split('\n')
          buf = parts.pop() ?? ''
          for (const line of parts) {
            const t = line.trim()
            if (!t.startsWith('data:')) continue
            const data = t.slice(5).trim()
            if (data === '[DONE]') continue
            try {
              const delta = JSON.parse(data)?.choices?.[0]?.delta
              if (typeof delta?.content === 'string' && delta.content) {
                full += delta.content
                res.write(`data: ${JSON.stringify({ delta: delta.content })}\n\n`)
              }
              if (Array.isArray(delta?.tool_calls)) {
                for (const tc of delta.tool_calls) {
                  const i = typeof tc.index === 'number' ? tc.index : 0
                  let cur = acc.get(i)
                  if (!cur) { cur = { id: '', name: '', args: '' }; acc.set(i, cur) }
                  if (tc.id) cur.id = tc.id
                  if (tc.function?.arguments) cur.args += tc.function.arguments
                  if (tc.function?.name) {
                    cur.name += tc.function.name
                    // 名字一出来就通知前端，让这一行先亮出来（入参还在流）
                    res.write(`data: ${JSON.stringify({ tool: { index: i, name: cur.name } })}\n\n`)
                  }
                }
              }
            } catch { /* 半行 JSON，等下一块 */ }
          }
        }
        const toolCalls = [...acc.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, v]) => ({ id: v.id, type: 'function', function: { name: v.name, arguments: v.args } }))
        record({ ok: true, completionChars: full.length })
        res.write(`data: ${JSON.stringify({ done: true, id, content: full, tool_calls: toolCalls })}\n\n`)
      } catch (e) {
        record({ ok: false, error: 'stream_error' })
        res.write(`data: ${JSON.stringify({ done: true, error: 'stream_error' })}\n\n`)
      }
      return res.end()
    }

    const text = await upstream.text()
    if (!upstream.ok) {
      // 上游错误原样透出状态码，但不回传任何鉴权信息
      record({ ok: false, error: `upstream_${upstream.status}` })
      return json(res, 502, { error: `upstream_${upstream.status}`, detail: text.slice(0, 400) })
    }
    const data = JSON.parse(text)
    const message = data?.choices?.[0]?.message ?? {}
    const content: string = message.content ?? ''
    record({ ok: true, completionChars: content.length, usage: data?.usage })
    // 把整个 message 回给应用侧——tool_calls 要由它来执行
    return json(res, 200, {
      id,
      content,
      message,
      finishReason: data?.choices?.[0]?.finish_reason,
      usage: data?.usage,
      model: data?.model,
    })
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError'
    record({ ok: false, error: aborted ? 'timeout' : 'network_error' })
    return json(res, aborted ? 504 : 502, { error: aborted ? 'timeout' : 'network_error' })
  } finally {
    clearTimeout(timer)
  }
}

export function handleTrace(res: ServerResponse) {
  const t = readTrace()
  return json(res, 200, {
    count: t.length,
    okRate: t.length ? +(t.filter((x) => x.ok).length / t.length).toFixed(2) : null,
    avgMs: t.length ? Math.round(t.reduce((n, x) => n + x.ms, 0) / t.length) : null,
    entries: t.slice(0, 50),
  })
}

/** 配置自检：不回传 key 本身，只回传"配没配" */
export function handleHealth(res: ServerResponse, env: Record<string, string>) {
  return json(res, 200, {
    providers: Object.values(PROVIDERS).map((p) => ({
      id: p.id,
      model: p.defaultModel,
      keyConfigured: Boolean(env[p.apiKeyEnv]),
      keyEnv: p.apiKeyEnv,
    })),
    active: env.LLM_PROVIDER ?? 'deepseek',
  })
}
