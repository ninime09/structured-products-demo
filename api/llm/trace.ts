// 调用轨迹。注意：TRACE 在网关模块的内存里，serverless 实例会回收，
// 所以线上这个数字只反映当前实例，不是全局累计——面板上显示的
// 「调用 N 次 · 成功率」在线上要这么理解。

import type { ServerResponse } from 'node:http'
import { handleTrace } from '../../server/gateway.js'

export default function handler(_req: unknown, res: ServerResponse) {
  return handleTrace(res)
}
