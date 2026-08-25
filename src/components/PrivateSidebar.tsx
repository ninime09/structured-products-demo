import { useEffect, useRef, useState } from 'react'
import { CornerDownRight, Lock, Send, Sparkles, X } from 'lucide-react'
import { PEOPLE } from '../data'
import { store, useEngine } from '../hooks'

// 私有工作区侧栏：私区跟人走（按角色隔离），公区跟 case 走。
// 讨论过程不进交易室、不落审计；只有"发布"跨越边界。
export function PrivateSidebar() {
  const { role, privateChats, artifacts } = useEngine()
  const [input, setInput] = useState('')
  const msgs = privateChats[role]
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs.length])
  const me = PEOPLE[role]
  const send = () => {
    if (!input.trim()) return
    store.sendPrivate(input)
    setInput('')
  }
  return (
    <aside className="private-sidebar" aria-label="私有工作区">
      <div className="ps-head">
        <span className="ps-head-icon"><Sparkles size={14} /></span>
        <div className="ps-head-text">
          <strong>{me.name} 的私有工作区</strong>
          <small><Lock size={9} /> 仅你可见 · 发布后才进入交易室</small>
        </div>
        <button className="ps-close" aria-label="收起私有工作区" onClick={() => store.togglePrivate(false)}><X size={15} /></button>
      </div>
      <div className="ps-chat">
        {msgs.length === 0 ? (
          <div className="ps-empty">
            <p>和你的 agent 讨论这单交易——讨论过程不进交易室、不落审计，只有你点「发布」的内容才跨界。</p>
            <span>试试：「客户条款已完整，能不能跳过对比直接询价？」或在交易室里点「拉入私区讨论」。</span>
          </div>
        ) : (
          msgs.map((m) => (
            <div key={m.id} className={`ps-msg ${m.who}`}>
              {m.quotedArtifactId && artifacts[m.quotedArtifactId] ? (
                <span className="ps-quote">
                  <CornerDownRight size={11} /> 引用 · {artifacts[m.quotedArtifactId].titleZh} v{artifacts[m.quotedArtifactId].version}
                </span>
              ) : null}
              <div className="ps-bubble">{m.text}</div>
              {m.draft ? (
                <div className={`ps-draft${m.draft.published ? ' published' : ''}`}>
                  <div className="ps-draft-label">{m.draft.kind === 'deviation' ? '草稿 · 流程偏离请求' : '草稿 · 交易室消息'}</div>
                  <p>{m.draft.text}</p>
                  {m.draft.published ? (
                    <span className="ps-published">✓ 已发布到交易室 · 已留痕</span>
                  ) : (
                    <button className="ps-publish" onClick={() => store.publishDraft(m.id)}>发布到交易室 →</button>
                  )}
                </div>
              ) : null}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
      <div className="ps-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send() }}
          placeholder="和 agent 私下讨论（不会进入交易室）..."
          aria-label="私有工作区输入框"
        />
        <button onClick={send} aria-label="发送到私有工作区"><Send size={14} /></button>
      </div>
    </aside>
  )
}
