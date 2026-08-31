import { useEffect, useRef, useState } from 'react'
import {
  AtSign,
  ChevronDown,
  ChevronRight,
  Mail,
  Paperclip,
  Send,
  Sparkles,
  WandSparkles,
} from 'lucide-react'
import { ASSISTANT_CHIPS, OTHER_CASES, PEOPLE, ROLE_SHORT, assistantReply } from '../data'
import { store, useEngine } from '../hooks'
import { MiniMarkdown } from './markdown'
import { AnswerActions, Button, IconButton, Panel } from './primitives'

export function AssistantView() {
  const { role, truth, assistantQA, participants, language } = useEngine()
  const [input, setInput] = useState('')
  const conversationEndRef = useRef<HTMLDivElement>(null)
  const me = PEOPLE[role]

  const joined = participants.some((p) => p.person.role === role)
  // 「今日」那一屏（工作卡片 + 建议 chips + 创建前核对预览）整个撤掉了：
  // 助手只剩对话这一件事，所以也不再需要 tab 和模式状态。
  const isEmptyChat = assistantQA.length === 0
  const zh = language === 'zh'

  useEffect(() => {
    if (assistantQA.length > 0) {
      conversationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [assistantQA.length])

  const ask = (q: string) => {
    if (!q.trim()) return
    store.askAssistant(q, assistantReply(q, `${truth.statusLabel}（${truth.status}）`, truth.nextAction))
    setInput('')
  }

  return (
    <main className="main assistant-main">
      <div className={`assistant-inner ${isEmptyChat ? 'empty-chat' : ''}`}>
        <div className="assistant-scroll-content assistant-chat-scroll">
            <section className="assistant-conversation" aria-label="助手对话">
              {assistantQA.map((qa, i) => (
                // 回话不套气泡：一问一答里，只有"我说的"需要被框起来区分，
                // agent 的回答就是这一页的正文——和 Codex / iOS 那类对话一样。
                <div className="qa-item" key={i}>
                  <div className="qa-q">{qa.q}</div>
                  <div className="qa-a">
                    <MiniMarkdown text={qa.a.join('\n')} />
                    <div className="qa-foot">
                      <span className="qa-src">{zh ? '基于 Case State' : 'From case state'}</span>
                      <AnswerActions text={qa.a.join('\n')} zh={zh} />
                    </div>
                  </div>
                </div>
              ))}
            <div ref={conversationEndRef} />
          </section>
        </div>

        <div className="assistant-compose-area chat">
          {isEmptyChat ? (
            <div className="assistant-chat-welcome">
              <Sparkles size={26} />
              <h1>下午好，{me.name}</h1>
            </div>
          ) : null}

          <Panel className="assistant-composer chat-mode">
            <label className="assistant-composer-label" htmlFor="assistant-input">
              {zh ? '给助手发送消息' : 'Message your assistant'}
            </label>
            <div className="composer-editor">
              <textarea
                id="assistant-input"
                value={input}
                rows={2}
                placeholder={zh ? '询问案例状态，或向助手下达工作指令' : 'Ask about a case or give your assistant an instruction'}
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
          </Panel>

          {isEmptyChat ? (
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
            caseName: truth.caseName,
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
        <h1>我的任务</h1>
        <p className="sub">Case State 的结构化投影 · 点击任务打开对应 Trade Room 并聚焦相关 Artifact</p>
        <div className="task-table-wrap">
          <table className="task-table">
            <thead>
              <tr>
                <th>优先级</th>
                <th>Case</th>
                <th>需要处理</th>
                <th>原因</th>
                <th>负责人</th>
                <th>截止 / 时效</th>
                <th>状态</th>
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
