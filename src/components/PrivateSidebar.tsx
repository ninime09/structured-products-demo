import { useEffect, useRef, useState } from 'react'
import { Check, CornerDownRight, Lock, Pencil, Send, Sparkles, X } from 'lucide-react'
import { PEOPLE } from '../data'
import { store, useEngine } from '../hooks'
import { setDragGhost } from './dragGhost'
import { MiniMarkdown } from './markdown'
import { AnswerActions } from './primitives'

// 私有工作区侧栏：私区跟人走（按角色隔离），公区跟 case 走。
// 讨论过程不进交易室、不落审计；只有"发布"跨越边界。
const DRAFT_LABEL: Record<string, string> = {
  deviation: '草稿 · 流程偏离请求',
  reply: '草稿 · 双署名回复',
  specialistProposal: 'agent 初稿 · 结构方向建议（读取：客户邮件 + CRM 客户档案）',
  clientBrief: '草稿 · 对客方向说明（已脱敏）',
  tradeTerms: 'agent 初稿 · 交易要素（读取：已确认需求 + 产品目录 + 市场快照）',
  roomMessage: '草稿 · 交易室消息',
  clientQuoteEmail: 'AI 起草 · 对客报价邮件正文（未发出）',
}

/**
 * 方向初稿是整篇推导，全展开会把确认按钮挤出屏幕（演示时得滚半天）。
 * 默认折叠：全文在交易室的预分析卡里同样可读，这里优先保证动作够得着。
 *
 * 正文和 agent 回话走同一套 markdown —— 初稿本来就是 ## 小标题 + **粗体** + 列表
 * 写出来的，当纯文本渲染就是把井号和星号糊在人脸上。折叠改成限高裁切：
 * 行数裁切（-webkit-line-clamp）只对单个文本块成立，块级结构套不上。
 */
function DraftBody({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 220
  if (!long) return <div className="ps-draft-body"><MiniMarkdown text={text} /></div>
  return (
    <>
      <div className={`ps-draft-body${open ? '' : ' clamped'}`}><MiniMarkdown text={text} /></div>
      <button className="ps-draft-expand" onClick={() => setOpen((v) => !v)}>
        {open ? '收起' : '展开全文'}
      </button>
    </>
  )
}

/** 自由编辑：整段可改可删，保存后按行级差异留痕 */
function DraftEditor({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 320) + 'px'
  }, [])
  return (
    <div className="ps-draft-editor">
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = Math.min(e.target.scrollHeight, 320) + 'px'
        }}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      />
      <div className="ps-draft-actions">
        <button className="ps-icon-btn" title="取消编辑（Esc）" aria-label="取消编辑" onClick={onCancel}><X size={15} /></button>
        <button className="ps-icon-btn primary" title="保存修改（改动会记进审计）" aria-label="保存修改" onClick={() => onSave(text)}><Check size={15} /></button>
      </div>
    </div>
  )
}

/** 图标按钮的完整含义放 tooltip，卡片里不占地方 */
const SEND_HINT: Record<string, string> = {
  specialistProposal: '确认并发布方向建议到交易室',
  tradeTerms: '确认并发布为结构方案',
  clientBrief: '审核通过，发给客户',
  reply: '以双署名发布正式回复',
  deviation: '发布流程偏离请求',
  roomMessage: '发布到交易室',
}

export function PrivateSidebar() {
  const { role, privateChats, artifacts } = useEngine()
  const [input, setInput] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
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
            <span>试试：「客户条款已完整，能不能跳过对比直接询价？」或把交易室里的产物卡拖进来一起看。</span>
          </div>
        ) : (
          msgs.map((m) => (
            <div key={m.id} className={`ps-msg ${m.who}`}>
              {m.quotedArtifactId && artifacts[m.quotedArtifactId] ? (
                <span className="ps-quote">
                  <CornerDownRight size={11} /> 引用 · {artifacts[m.quotedArtifactId].titleZh} v{artifacts[m.quotedArtifactId].version}
                </span>
              ) : null}
              {/* 划词批注带过来的原文片段 */}
              {m.quotedText ? <span className="ps-quote-text">“{m.quotedText.length > 90 ? m.quotedText.slice(0, 90) + '…' : m.quotedText}”</span> : null}
              {/* agent 回话来自真模型，带 **粗体** / 1. 编号 / ## 小标题，
                  当纯文本渲染会把记号原样吐出来、换行也被气泡吃掉 —— 走 markdown。
                  自己发出去的那句不用：人手打的就是纯文本。 */}
              <div className={`ps-bubble${m.thinking ? ' thinking' : ''}`}>
                {m.thinking ? null : m.who === 'agent' ? <MiniMarkdown text={m.text} /> : m.text}
                {m.thinking ? <span className="ps-dots"><i /><i /><i /></span> : null}
              </div>
              {/* 只给 agent 的回话：自己打的那句不需要复制/评价 */}
              {m.who === 'agent' && !m.thinking ? <AnswerActions text={m.text} /> : null}
              {m.draft ? (
                <div
                  className={`ps-draft${m.draft.published ? ' published' : ''}`}
                  draggable={!m.draft.published}
                  title={m.draft.published ? undefined : '按住拖到左侧交易室 → 发布（需确认）'}
                  onDragStart={m.draft.published ? undefined : (e) => { e.dataTransfer.setData('text/plain', m.id); e.dataTransfer.effectAllowed = 'move'; setDragGhost(e, '⇢ 草稿 · 发布到交易室'); store.setDragging({ kind: 'draft', id: m.id }) }}
                  onDragEnd={() => store.setDragging(null)}
                >
                  <div className="ps-draft-label">{DRAFT_LABEL[m.draft.kind]}</div>
                  {editingId === m.id ? (
                    <DraftEditor
                      value={m.draft.text}
                      onCancel={() => setEditingId(null)}
                      onSave={(v) => { store.editDraft(m.id, v); setEditingId(null) }}
                    />
                  ) : (
                    <DraftBody text={m.draft.text} />
                  )}
                  {/* 脱敏清单从卡上去掉了：六条删除线比正文本身还长，把这张卡撑成了
                      一份内部信息的清单——而这张卡的正事是"这段话能不能发给客户"。
                      移除了什么仍然可查：发布时进审计（见 store 的 publishDraft），
                      条目也还挂在 draft.redacted 上，需要时可以再放回来。 */}
                  {m.draft.published ? (
                    <span className="ps-published">✓ 已发布到交易室 · 已留痕</span>
                  ) : (
                    editingId === m.id ? null : (
                      <div className="ps-draft-actions">
                        {/* 产品专家的动作是"改"，不是"点同意"——整段可自由编辑，
                            改了什么按行级差异记进审计。 */}
                        <button className="ps-icon-btn" title="编辑初稿（整段可改可删，改动会记进审计）" aria-label="编辑初稿"
                          onClick={() => setEditingId(m.id)}>
                          <Pencil size={15} />
                        </button>
                        {/* 对客报价邮件不在这里发：发送要选渠道（邮件 / 电话），
                            那个门在报价卡上。这里只负责改，避免两个发送入口。 */}
                        {m.draft.kind === 'clientQuoteEmail' ? (
                          <span className="ps-draft-elsewhere">改好后在报价卡上点「发送给客户」</span>
                        ) : (
                          <button className="ps-icon-btn primary" title={SEND_HINT[m.draft.kind] ?? '发布到交易室'} aria-label="确认并发布"
                            onClick={() => store.publishDraft(m.id)}>
                            <Send size={15} />
                          </button>
                        )}
                      </div>
                    )
                  )}
                  {!m.draft.published ? (
                    <div className="ps-draft-guard">
                      <span><Lock size={10} /> 未经你确认不进审计、不能转发给客户</span>
                      {m.draft.kind === 'clientQuoteEmail'
                        ? <span className="ps-drag-hint">或直接告诉我怎么改，比如「风险提示那段换个说法」</span>
                        : <span className="ps-drag-hint">或把这张卡拖到左侧交易室发布</span>}
                    </div>
                  ) : null}
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
          placeholder="和 agent 私下讨论..."
          aria-label="私有工作区输入框"
        />
        <button onClick={send} aria-label="发送到私有工作区"><Send size={14} /></button>
      </div>
    </aside>
  )
}
