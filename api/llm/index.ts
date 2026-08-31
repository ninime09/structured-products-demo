// Vercel Node Function：把 dev server 里那段网关中间件原样搬到线上。
//
// 为什么需要它：vite.config.ts 里的网关挂在 configureServer 上，只在 dev 生效。
// `vite build` 出来的是纯静态产物，线上没有 /api/llm——真模型开关会变成一个
// 点了没反应的开关（fetch 404 → 静默回退脚本）。这个函数补上那一端。
//
// key 仍然只在服务端：Vercel 项目环境变量里配 DEEPSEEK_API_KEY，
// 不带 VITE_ 前缀就不会被注入到客户端 bundle。
//
// 一个已知局限：网关的调用轨迹（TRACE）存在内存里，而 serverless 实例会回收，
// 所以线上「调用 N 次 · 成功率」只反映当前实例，不是全局累计。演示够用；
// 要长期统计得接外部存储。

import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleLlm } from '../../server/gateway.js'

// 超时放在 vercel.json 的 functions 里配（模型带工具调用可能跑几十秒，
// 默认 10s 会被砍断）。这里不再重复声明，免得两处不一致。

export default async function handler(
  req: IncomingMessage & { body?: unknown; method?: string },
  res: ServerResponse,
) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'method not allowed' }))
    return
  }
  // Vercel 已经把 JSON body 解析好了，流被消费过——必须把它传进去，
  // 否则网关里的 readBody 会一直等一个永远不来的 'end'
  await handleLlm(req, res, process.env as Record<string, string>, req.body)
}
