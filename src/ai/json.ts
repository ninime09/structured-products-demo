// 模型给的 JSON 的容错解析。
//
// 三种反复出现的毛病，每一种都会让 JSON.parse 直接炸、然后静默回退脚本：
//  1. 前面先写一句话再吐 JSON（"数据已核对……" 然后才 {）
//  2. 用 ``` 围栏包起来
//  3. 字符串值里直接换行——多段回话尤其常见，而裸换行在 JSON 里是非法的
//
// 前两种切掉就行；第三种要把字符串内部的控制字符转义回去。

/** 从模型输出里取出 JSON 对象。取不出来返回 null，不抛。 */
export function parseAgentJson<T = Record<string, unknown>>(raw: string): T | null {
  const body = stripFence(raw)
  if (!body) return null
  try {
    return JSON.parse(body) as T
  } catch {
    /* 继续修 */
  }
  try {
    return JSON.parse(escapeControlChars(body)) as T
  } catch {
    return null
  }
}

function stripFence(t: string): string {
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  const s = (fenced ? fenced[1] : t).trim()
  const open = s.indexOf('{')
  const close = s.lastIndexOf('}')
  return open >= 0 && close > open ? s.slice(open, close + 1) : ''
}

/**
 * 把字符串字面量内部的裸控制字符转义。
 * 必须自己扫一遍——不能无脑全局替换，结构本身的换行（键值之间）是合法的，
 * 替换掉不影响解析但会把格式弄乱，而且引号计数得跟着转义符走。
 */
function escapeControlChars(t: string): string {
  let out = ''
  let inStr = false
  let esc = false
  for (const c of t) {
    if (esc) { out += c; esc = false; continue }
    if (c === '\\') { out += c; esc = true; continue }
    if (c === '"') { inStr = !inStr; out += c; continue }
    if (inStr && c === '\n') { out += '\\n'; continue }
    if (inStr && c === '\r') { out += '\\r'; continue }
    if (inStr && c === '\t') { out += '\\t'; continue }
    out += c
  }
  return out
}
