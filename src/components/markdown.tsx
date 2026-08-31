/**
 * 极简 markdown 渲染。
 *
 * 原来只长在 TradeRoom 里，认的是我们自己在 renderProposal 写出来的那几种记号。
 * 私区 agent 回话接的是真模型，它爱写 `1.` 编号、`– ` 破折号列表、`## ` 小标题——
 * 当纯文本渲染就会把星号原样吐在界面上，还因为气泡不保留换行而糊成一整坨。
 * 所以搬到这里共用，并把模型常写的那几种也认上。
 *
 * 仍然不引 markdown 库：要认的记号一只手数得过来，通用解析器换来的只是体积。
 */

/** 行内：**粗体** 与 `等宽` */
export function inline(t: string, key: number) {
  const parts = t.split(/\*\*(.+?)\*\*/g)
  return (
    <span key={key}>
      {parts.map((s, i) => (i % 2
        ? <b key={i}>{s}</b>
        : s.split(/`([^`]+)`/g).map((c, j) => (j % 2 ? <code key={j}>{c}</code> : c))))}
    </span>
  )
}

/** 无序列表项：- · – — 开头 */
const BULLET = /^\s*[-·–—]\s+/
/** 有序列表项：1. 1) 开头 */
const ORDERED = /^\s*(\d+)[.)]\s+/

export function MiniMarkdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = []
  let list: { marker?: string; body: string }[] = []
  const flush = () => {
    if (!list.length) return
    const items = list
    blocks.push(
      <ul className="md-list" key={`l${blocks.length}`}>
        {items.map((item, i) => (
          <li key={i} className={item.marker ? 'numbered' : undefined} data-marker={item.marker}>
            {inline(item.body, i)}
          </li>
        ))}
      </ul>,
    )
    list = []
  }
  text.split('\n').forEach((raw) => {
    const line = raw.trimEnd()
    const ordered = line.match(ORDERED)
    if (ordered) return void list.push({ marker: `${ordered[1]}.`, body: line.replace(ORDERED, '') })
    if (BULLET.test(line)) return void list.push({ body: line.replace(BULLET, '') })
    flush()
    if (!line.trim()) return
    if (/^#{2,6}\s/.test(line)) return void blocks.push(<h4 className="md-h" key={blocks.length}>{line.replace(/^#{2,6}\s/, '')}</h4>)
    if (line.startsWith('⚠')) return void blocks.push(<p className="md-note" key={blocks.length}>{line}</p>)
    // 方向标题行：① … · KI 65%
    if (/^[①②③④]/.test(line)) return void blocks.push(<p className="md-dir" key={blocks.length}>{inline(line, 0)}</p>)
    blocks.push(<p className="md-p" key={blocks.length}>{inline(line, 0)}</p>)
  })
  flush()
  return <>{blocks}</>
}
