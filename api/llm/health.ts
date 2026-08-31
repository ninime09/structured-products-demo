// 配置自检：只回传"配没配 key"，不回传 key 本身。
// 前端的 AI 模式面板据此决定「真模型」这个开关能不能点——
// 没配 key 就该是禁用态，而不是点了之后静默回退。

import type { ServerResponse } from 'node:http'
import { handleHealth } from '../../server/gateway.js'

export default function handler(_req: unknown, res: ServerResponse) {
  return handleHealth(res, process.env as Record<string, string>)
}
