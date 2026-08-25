import { useEffect, useRef, useState } from 'react'
import {
  AtSign,
  ChevronDown,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  Mail,
  Paperclip,
  Send,
  Sparkles,
  WandSparkles,
} from 'lucide-react'
import { ASSISTANT_CHIPS, OTHER_CASES, PEOPLE, ROLE_SHORT, assistantReply } from '../data'
import { store, useEngine } from '../hooks'
import { Button, IconButton, Panel, Tag } from './primitives'

export function AssistantView() {
  const { role, truth, assistantQA, participants, language } = useEngine()
  const [input, setInput] = useState('')
  const [assistantMode, setAssistantMode] = useState<'today' | 'chat'>('today')
  const conversationEndRef = useRef<HTMLDivElement>(null)
  const me = PEOPLE[role]

  const joined = participants.some((p) => p.person.role === role)
  const isEmptyChat = assistantMode === 'chat' && assistantQA.length === 0
  const zh = language === 'zh'

  useEffect(() => {
    if (assistantMode === 'chat' && assistantQA.length > 0) {
      conversationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [assistantMode, assistantQA.length])

  const ask = (q: string) => {
    if (!q.trim()) return
    setAssistantMode('chat')
    store.askAssistant(q, assistantReply(q, `${truth.statusLabel}（${truth.status}）`, truth.nextAction))
    setInput('')
  }

  return (
    <main className="main assistant-main">
      <div className={`assistant-inner ${isEmptyChat ? 'empty-chat' : ''}`}>
        <div className="assistant-view-header">
          <div className="assistant-view-tabs" role="tablist" aria-label="Assistant views">
            <button
              className={assistantMode === 'today' ? 'active' : ''}
              role="tab"
              aria-selected={assistantMode === 'today'}
              onClick={() => setAssistantMode('today')}
            >
              {zh ? '今日' : 'Today'} <span className="assistant-tab-count">3</span>
            </button>
            <button
              className={assistantMode === 'chat' ? 'active' : ''}
              role="tab"
              aria-selected={assistantMode === 'chat'}
              onClick={() => setAssistantMode('chat')}
            >
              {zh ? '对话' : 'Chat'}
            </button>
          </div>
        </div>

        <div className={`assistant-scroll-content ${assistantMode === 'chat' ? 'assistant-chat-scroll' : ''}`}>
          {assistantMode === 'today' ? (
            <>
              <div className="assistant-greet">
                <h1>下午好，{me.name}</h1>
              </div>
              <div className="assistant-promise">
                <Sparkles size={18} />
                <span>{zh ? '我可以准备下一步操作，审批和客户沟通始终由你确认。' : 'I can prepare the next move. You stay in control of approvals and client messages.'}</span>
              </div>

              <section className="assistant-work-list" aria-label="Assistant work queue">
                <Panel className="assistant-work-card priority-high">
                  <div className="work-card-head">
                    <div className="work-case"><strong>SP-001</strong><span>·</span><strong>Tencent FCN</strong><Tag tone="warning">{zh ? '高优先级' : 'High priority'}</Tag></div>
                    <div className="work-meta"><Mail size={14} />14:02<ChevronRight size={16} /></div>
                  </div>
                  <div className="work-body">
                    <div>
                      <h2>{zh ? '核对 AI 提取的客户需求' : 'Verify extracted client need'}</h2>
                      <div className="work-tags">
                        <Tag tone="primary">{zh ? '技能：客户需求提取' : 'Skill: Client Need Extraction'}</Tag>
                        <Tag>{zh ? '来源：客户邮件' : 'Source: Client email'}</Tag>
                        <Tag tone="warning">{zh ? '需要确认' : 'Needs approval'}</Tag>
                      </div>
                    </div>
                    <div className="work-actions">
                      <Button onClick={() => store.openCase('SP-001')}>{zh ? '核对提取结果' : 'Review extraction'}</Button>
                      <Button variant="primary" onClick={() => ask('Draft a clarification message to Mr. Chan')}>{zh ? '询问客户' : 'Ask client'}</Button>
                    </div>
                  </div>
                </Panel>

                <Panel className="assistant-work-card priority-medium">
                  <div className="work-card-head">
                    <div className="work-case"><strong>SP-002</strong><span>·</span><strong>AAPL Autocall</strong><Tag tone="primary">{zh ? '中等' : 'Medium'}</Tag></div>
                    <div className="work-meta"><Clock3 size={14} />2 days ago<ChevronRight size={16} /></div>
                  </div>
                  <div className="work-body">
                    <div>
                      <h2>{zh ? '起草客户跟进消息' : 'Draft client follow-up'}</h2>
                      <div className="work-tags">
                        <Tag tone="primary">{zh ? '技能：跟进消息草稿' : 'Skill: Follow-up Draft'}</Tag>
                        <Tag tone="warning">{zh ? '发送前需要审核' : 'Requires review before send'}</Tag>
                      </div>
                    </div>
                    <div className="work-actions">
                      <Button onClick={() => ask('Draft a client follow-up for SP-002')}>{zh ? '生成跟进草稿' : 'Draft follow-up'}</Button>
                      <Button variant="primary" onClick={() => store.openCase('SP-002')}>{zh ? '打开交易室' : 'Open Trade Room'}</Button>
                    </div>
                  </div>
                </Panel>

                <button className="assistant-work-row" onClick={() => store.openCase('SP-005')}>
                  <span className="exception-line" />
                  <strong>SP-005</strong><span>·</span><strong>Basket Note</strong>
                  <Tag tone="critical">{zh ? '需关注' : 'Attention'}</Tag>
                  <Tag>{zh ? 'AI 分类：文档错误' : 'AI classified: Documentation Error'}</Tag>
                  <span className="work-row-spacer" />
                  <FileText size={14} />14:15<ChevronRight size={16} />
                </button>
              </section>
            </>
          ) : (
            <section className="assistant-conversation" aria-label="Assistant conversation">
              {assistantQA.map((qa, i) => (
                <div className="qa-item" key={i}>
                  <div className="qa-q">{qa.q}</div>
                  <div className="qa-a">
                    <div className="qa-tag">AI · 基于 Case State</div>
                    {qa.a.map((line, j) => <div key={j}>{line}</div>)}
                  </div>
                </div>
              ))}
              <div ref={conversationEndRef} />
            </section>
          )}
        </div>

        <div className={`assistant-compose-area ${assistantMode}`}>
          {isEmptyChat ? (
            <div className="assistant-chat-welcome">
              <Sparkles size={26} />
              <h1>下午好，{me.name}</h1>
            </div>
          ) : null}

          <Panel className={`assistant-composer ${assistantMode === 'chat' ? 'chat-mode' : ''}`}>
            <label className="assistant-composer-label" htmlFor="assistant-input">
              {assistantMode === 'today' ? zh ? '询问或指示你的助手' : 'Ask or instruct your assistant' : zh ? '给助手发送消息' : 'Message your assistant'}
            </label>
            <div className="composer-editor">
              <textarea
                id="assistant-input"
                value={input}
                rows={2}
                placeholder={assistantMode === 'today'
                  ? zh ? '根据 Mr. Chan 的邮件创建案例并提取客户需求' : 'Create a new case from Mr. Chan’s email and extract the client need'
                  : zh ? '询问案例状态，或向助手下达工作指令' : 'Ask about a case or give your assistant an instruction'}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    ask(input)
                  }
                }}
              />
            </div>
            <div className="composer-tools">
              <IconButton icon={Paperclip} label={zh ? '添加附件' : 'Attach file'} />
              <IconButton icon={Mail} label={zh ? '选择邮件' : 'Select email'} />
              <IconButton icon={AtSign} label={zh ? '提及' : 'Mention'} />
              <Button icon={WandSparkles} onClick={() => store.openDrawer({ type: 'skills' })}>{zh ? '技能' : 'Skills'}</Button>
              <span className="composer-spacer" />
              <IconButton icon={Send} label={zh ? '发送指令' : 'Send instruction'} className="send" onClick={() => ask(input)} />
              <IconButton icon={ChevronDown} label={zh ? '更多发送选项' : 'More send options'} />
            </div>
            {assistantMode === 'today' ? (
              <div className="composer-preview">
                <Eye size={14} />
                <span><strong>{zh ? '预览：' : 'Preview:'}</strong> {zh ? `创建案例草稿 · 使用已选邮件 · 需要 ${me.name} 确认` : `create draft case · use selected email · needs ${me.name} confirmation`}</span>
                <Button>{zh ? '创建前核对' : 'Review before creating'}</Button>
              </div>
            ) : null}
          </Panel>

          {assistantMode === 'today' ? (
            <div className="composer-suggestions">
              {ASSISTANT_CHIPS.filter((c) => joined || !c.includes('SP-001')).map((c) => (
                <button key={c} onClick={() => ask(c)}>{c}</button>
              ))}
            </div>
          ) : isEmptyChat ? (
            <div className="assistant-chat-starters">
              <span>{zh ? '建议提问' : 'Suggested'}</span>
              {ASSISTANT_CHIPS.filter((c) => joined || !c.includes('SP-001')).map((c) => (
                <button key={c} onClick={() => ask(c)}>
                  <Sparkles size={13} />
                  <span>{c}</span>
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}

export function TasksView() {
  const { role, truth, participants } = useEngine()
  const joined = participants.some((p) => p.person.role === role)
  const rows = [
    ...(joined
      ? [
          {
            caseId: 'SP-001',
            caseName: 'Tencent FCN',
            action: truth.nextAction,
            reason: `${truth.statusLabel} · ${truth.status}`,
            owner: truth.currentOwner ? `${truth.currentOwner.name} · ${ROLE_SHORT[truth.currentOwner.role]}` : '—',
            deadline: truth.waitingOn ? `等待 ${truth.waitingOn}` : '进行中',
            priority: (truth.statusTone === 'critical' ? 'high' : truth.currentOwner?.role === role ? 'high' : 'medium') as
              | 'high'
              | 'medium'
              | 'low',
            status: truth.statusLabel,
          },
        ]
      : []),
    ...OTHER_CASES.map((c) => ({
      caseId: c.caseId,
      caseName: c.name,
      action: c.nextAction,
      reason: c.reason,
      owner: `${c.ownerName} · ${c.ownerRole ? ROLE_SHORT[c.ownerRole] : '—'}`,
      deadline: c.deadline,
      priority: c.priority,
      status: c.statusLabel,
    })),
  ].sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.priority] - ({ high: 0, medium: 1, low: 2 })[b.priority])

  return (
    <main className="main">
      <div className="tasks-inner">
        <h1>My Tasks</h1>
        <p className="sub">Case State 的结构化投影 · 点击任务打开对应 Trade Room 并聚焦相关 Artifact</p>
        <div className="task-table-wrap">
          <table className="task-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Case</th>
                <th>Required Action</th>
                <th>Reason</th>
                <th>Owner</th>
                <th>Deadline / Freshness</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.caseId} onClick={() => store.openCase(r.caseId)}>
                  <td>
                    <span className={`pri-chip ${r.priority}`}>{{ high: 'High', medium: 'Medium', low: 'Low' }[r.priority]}</span>
                  </td>
                  <td>
                    <span className="cid">{r.caseId}</span>
                    <div style={{ fontWeight: 600 }}>{r.caseName}</div>
                  </td>
                  <td className="action-cell">{r.action}</td>
                  <td style={{ color: 'var(--text-2)' }}>{r.reason}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.owner}</td>
                  <td style={{ color: 'var(--text-2)' }}>{r.deadline}</td>
                  <td>
                    <span className="badge neutral">{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
