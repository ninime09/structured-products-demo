// 部分 JSON 的容错解析。
//
// 流式返回的是没写完的 JSON，直接 JSON.parse 必然失败。
// 这里把未闭合的字符串/括号补齐再解析——这样每来一块就能拿到
// "目前已经确定的部分"，"思考中"才是真的在动，而不是转圈等结果。
//
// 只用于**展示**：最终落地的对象仍以完整响应为准，再过结构化校验。

export function parsePartialJson<T = unknown>(raw: string): T | null {
  const t = stripFence(raw).trim()
  if (!t) return null
  // 先试完整解析
  try {
    return JSON.parse(t) as T
  } catch {
    /* 继续修补 */
  }
  const repaired = repair(t)
  if (!repaired) return null
  try {
    return JSON.parse(repaired) as T
  } catch {
    return null
  }
}

function stripFence(t: string): string {
  const open = t.indexOf('{')
  if (open < 0) return ''
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/)
  const body = fenced ? fenced[1] : t.slice(open)
  const s = body.indexOf('{')
  return s < 0 ? '' : body.slice(s)
}

/**
 * 补齐未闭合的结构：
 *  - 处在字符串里 → 先补引号
 *  - 末尾是 , 或 : → 去掉这段不完整的键值
 *  - 依次补上未闭合的 } 和 ]
 */
function repair(t: string): string | null {
  const stack: string[] = []
  let inStr = false
  let esc = false
  let lastComplete = -1 // 最后一个"结构上安全"的位置

  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') {
        inStr = false
        lastComplete = i
      }
      continue
    }
    if (c === '"') { inStr = true; continue }
    if (c === '{' || c === '[') { stack.push(c); continue }
    if (c === '}' || c === ']') { stack.pop(); lastComplete = i; continue }
    if (c === ',' || /[\d\w]/.test(c)) lastComplete = i
  }

  let out = t
  if (inStr) {
    // 字符串没写完：截到该字符串开始前，避免半个词
    const open = out.lastIndexOf('"', out.length)
    void open
    out += '"'
  } else if (lastComplete >= 0 && lastComplete < out.length - 1) {
    out = out.slice(0, lastComplete + 1)
  }
  // 去掉悬空的 , 或 键:
  out = out.replace(/,\s*$/, '').replace(/"[^"]*"\s*:\s*$/, '').replace(/,\s*$/, '')
  // 补齐括号
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === '{' ? '}' : ']'
  return out
}
