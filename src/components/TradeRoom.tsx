import { useEffect, useRef, useState } from 'react'
import { AtSign, ChevronDown, MessageSquare, Paperclip, Pin, Send, Table2, WandSparkles } from 'lucide-react'
import { OTHER_CASES, PEOPLE } from '../data'
import { store, useEngine } from '../hooks'
import type { Artifact, RoleKey, TimelineItem } from '../types'
import { ArtifactCard, NeedReviewWorkspace } from './Artifacts'
import { confirmThen } from './confirm'
import { IconButton } from './primitives'
import {
  ClientQuoteWorkspace,
  ExecutionWorkspace,
  InstructionReviewWorkspace,
  QuoteMatrixWorkspace,
  RFQWorkspace,
  StructureWorkspace,
  TermsheetWorkspace,
  TransitionWorkspace,
} from './StageWorkspaces'
import { ActionBtn } from './ui'

const SYS_ICON: Record<string, string> = {
  check: '✓',
  arrow: '→',
  alert: '⚠',
  flag: '⛳',
  send: '↗',
}

// ── Progressive participation: per-role visibility (§5.4 Layer A/B/C) ────
// Settled artifacts are public case history (Layer A); in-flight work is
// visible only to the roles working on it (Layer B); raw human messages
// stay with their author's role (Layer C).
const PUBLIC_STATUS = new Set(['APPROVED', 'ACCEPTED', 'SENT', 'CONFIRMED', 'VALIDATED', 'EXECUTED', 'EXPIRED', 'STALE', 'SUPERSEDED'])
const WORKING_VIEWERS: Record<Artifact['data']['type'], RoleKey[]> = {
  needBrief: ['rm'],
  structureProposal: ['ps'],
  rfqPackage: ['dealer', 'ps'],
  quoteMatrix: ['dealer', 'ps'],
  clientQuote: ['rm', 'dealer'],
  instruction: ['rm'],
  executionTicket: ['dealer'],
  termsheetValidation: ['ops', 'dealer'],
  deviationProposal: ['rm', 'ps', 'dealer'],
}

function itemVisibleTo(item: TimelineItem, role: RoleKey, artifacts: Record<string, Artifact>): boolean {
  switch (item.kind) {
    case 'human':
      // Raw client communication belongs to the author's role only.
      return item.author.role === role
    case 'contextBrief':
      // A join brief is addressed to the joining role.
      return item.joiner.role === role
    case 'artifact': {
      const a = artifacts[item.artifactId]
      if (!a) return false
      if (PUBLIC_STATUS.has(a.status)) return true
      return WORKING_VIEWERS[a.data.type].includes(role)
    }
    case 'system':
      // Layer A by default; an explicit audience narrows it (e.g. the joiner
      // whose Context Brief restates the event, or working-process details).
      return !item.audience || item.audience.includes(role)
    default:
      // AI processing and blocking action cards are Layer A.
      return true
  }
}

const JOIN_EXPECTATION: Record<RoleKey, { when: string; task: string }> = {
  rm: { when: 'Case 创建时', task: '捕捉客户需求，确认 Client Need Brief' },
  ps: { when: 'RM 确认客户需求后（CLIENT_NEED_APPROVED）', task: '复核已确认需求，设计并审批结构' },
  dealer: { when: '结构审批、RFQ Package 生成后（RFQ_READY）', task: '复核 RFQ，发起市场询价' },
  ops: { when: '交易执行后收到条款书（TERMSHEET_REVIEW）', task: '核对执行单与最终条款书，处理 mismatch 和归档前确认' },
}

function PreJoinView({ role }: { role: RoleKey }) {
  const { truth } = useEngine()
  const exp = JOIN_EXPECTATION[role]
  const me = PEOPLE[role]
  return (
    <main className="main">
      <div className="prejoin">
        <span className={`avatar r-${role}`}>{me.initials}</span>
        <div className="pj-title">你尚未加入此 Case</div>
        <div className="pj-sub">
          Trade Room 按阶段开放上下文：流程到达你的工作阶段时，你会作为 active participant 加入。
        </div>
        <div className="pj-facts">
          <span className="pj-k">当前阶段</span>
          <span className="pj-v">
            <span className={`badge ${truth.statusTone}`}>{truth.statusLabel}</span>
          </span>
          <span className="pj-k">当前负责人</span>
          <span className="pj-v">{truth.currentOwner ? `${truth.currentOwner.name} · ${truth.currentOwner.roleLabel}` : '—'}</span>
          <span className="pj-k">你的加入时机</span>
          <span className="pj-v">{exp.when}</span>
          <span className="pj-k">届时的任务</span>
          <span className="pj-v">{exp.task}</span>
        </div>
        <div className="pj-note">加入时你将看到 Context Brief 与已确认的结构化产物，而不是他人的完整聊天记录与修改过程。</div>
      </div>
    </main>
  )
}

function CurrentTruthStrip() {
  const { truth, artifacts, language } = useEngine()
  const zh = language === 'zh'
  const need = artifacts['art-need']
  const needFields = need?.data.type === 'needBrief' ? need.data.fields : []
  const source = truth.approvedTerms ?? needFields
  const value = (label: string, fallback = '—') => source.find((row) => row.label === label)?.value ?? fallback
  const product = truth.approvedTerms ? value('Product', 'FCN · 6M') : `Tencent / ${value('Underlying', '0700.HK').split('/').pop()?.trim()}`
  const items = truth.approvedTerms
    ? [
        [zh ? '已批准结构' : 'Approved Structure', product],
        [zh ? '名义本金' : 'Notional', value('Notional')],
        [zh ? '期限' : 'Tenor', value('Product').split('·').pop()?.trim() ?? '6M'],
        [zh ? '行权价' : 'Strike', value('Strike')],
        ['KI', value('KI')],
      ]
    : [
        [zh ? '客户需求' : 'Client Need', product],
        [zh ? '名义本金' : 'Notional', value('Notional')],
        [zh ? '投资期限' : 'Horizon', value('Investment Horizon')],
        [zh ? '目标收益' : 'Target', value('Target Yield')],
      ]

  return (
    <div className="truth-strip">
      <div className="truth-strip-head"><Pin size={14} />{zh ? '当前事实' : 'Current Truth'}</div>
      <div className="truth-strip-grid">
        {items.map(([label, itemValue]) => (
          <div className="truth-strip-item" key={label}>
            <span>{label}</span><strong>{itemValue}</strong>
          </div>
        ))}
        <div className="truth-strip-item status">
          <span>{zh ? '状态' : 'Status'}</span><strong className={`badge ${truth.statusTone}`}>{truth.statusLabel}</strong>
        </div>
      </div>
    </div>
  )
}

function StageWorkspace() {
  const { truth, artifacts } = useEngine()
  switch (truth.status) {
    case 'STRUCTURE_REVIEW':
    case 'STRUCTURE_MODIFICATION_REQUIRED': return <StructureWorkspace />
    case 'RFQ_READY': return <RFQWorkspace />
    case 'PRICING_IN_PROGRESS': {
      const hasActiveMatrix = Object.values(artifacts).some((artifact) => artifact.data.type === 'quoteMatrix' && artifact.status === 'ACTIVE')
      return hasActiveMatrix ? <QuoteMatrixWorkspace /> : <TransitionWorkspace />
    }
    case 'CLIENT_QUOTE_READY': return <ClientQuoteWorkspace />
    case 'CLIENT_INSTRUCTION_PENDING_CONFIRMATION': return <InstructionReviewWorkspace />
    case 'EXECUTION_READY': return <ExecutionWorkspace />
    case 'TERMSHEET_REVIEW':
    case 'EXCEPTION': return <TermsheetWorkspace />
    default: return <TransitionWorkspace />
  }
}

function TradeComposer() {
  const { language } = useEngine()
  const zh = language === 'zh'
  const [message, setMessage] = useState('')
  const send = () => {
    if (!message.trim()) return
    store.postTradeRoomMessage(message)
    setMessage('')
  }
  return (
    <div className="trade-composer">
      <div className="trade-composer-tools">
        <IconButton icon={Paperclip} label={zh ? '添加附件' : 'Attach file'} />
        <IconButton icon={Table2} label={zh ? '插入表格' : 'Insert table'} />
        <IconButton icon={AtSign} label={zh ? '提及参与者' : 'Mention participant'} />
        <IconButton icon={WandSparkles} label={zh ? '使用技能' : 'Use skill'} />
      </div>
      <input
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && send()}
        placeholder={zh ? '给交易室发送消息...' : 'Message Trade Room...'}
        aria-label={zh ? '给交易室发送消息' : 'Message Trade Room'}
      />
      <IconButton icon={Send} label={zh ? '发送消息' : 'Send message'} className="trade-send" onClick={send} />
      <IconButton icon={ChevronDown} label={zh ? '更多发送选项' : 'More send options'} />
    </div>
  )
}

export function TradeRoom() {
  const { timeline, activeCaseId, truth, role, focusArtifactId, artifacts, participants, language } = useEngine()
  const zh = language === 'zh'
  const endRef = useRef<HTMLDivElement>(null)
  const lastLen = useRef(timeline.length)

  useEffect(() => {
    // New timeline items scroll into view — but never fight an explicit
    // artifact focus (ArtifactFrame handles its own scroll for that).
    if (timeline.length > lastLen.current && !focusArtifactId) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
    lastLen.current = timeline.length
  }, [timeline.length, focusArtifactId])

  if (activeCaseId !== 'SP-001') {
    const c = OTHER_CASES.find((x) => x.caseId === activeCaseId)
    return (
      <main className="main">
        <div className="placeholder">
          <div className="ph-title">
            {c?.caseId} · {c?.name}
          </div>
          {zh ? '此案例为演示占位' : 'This case is a demo placeholder'}（{c?.stageLabel} · {c?.statusLabel}）。
          <br />
          {zh ? '完整可交互主线请打开' : 'Open the complete interactive flow at'} SP-001 · Tencent FCN。
        </div>
      </main>
    )
  }

  if (!participants.some((p) => p.person.role === role)) {
    return <PreJoinView role={role} />
  }

  const sourceReview = truth.status === 'CLIENT_NEED_DRAFT'
  const dedicatedStage = [
    'CLIENT_NEED_APPROVED', 'STRUCTURE_REVIEW', 'STRUCTURE_APPROVED', 'STRUCTURE_MODIFICATION_REQUIRED',
    'RFQ_READY', 'PRICING_IN_PROGRESS', 'REQUOTE_REQUIRED', 'CLIENT_QUOTE_READY', 'WAITING_FOR_CLIENT',
    'CLIENT_RESPONSE_RECEIVED', 'CLIENT_INSTRUCTION_PENDING_CONFIRMATION', 'CLIENT_INSTRUCTION_CONFIRMED',
    'LIVE_REQUOTE_REQUIRED', 'EXECUTION_READY', 'EXECUTED', 'TERMSHEET_REVIEW', 'EXCEPTION', 'COMPLETED',
  ].includes(truth.status)

  return (
    <main className="main trade-main">
      <div className="main-inner">
        <div className="trade-scroll-content">
        <div className="trade-room-heading"><MessageSquare size={16} /><strong>{zh ? '交易室' : 'Trade Room'}</strong><ChevronDown size={15} />{sourceReview ? <span className="room-mode">{zh ? '来源核对' : 'Source Review'}</span> : null}</div>
        {sourceReview ? <NeedReviewWorkspace /> : dedicatedStage ? (
          <>
            <CurrentTruthStrip />
            <StageWorkspace />
          </>
        ) : (
          <>
          <CurrentTruthStrip />
          <div className="timeline">
          {timeline.filter((item) => itemVisibleTo(item, role, artifacts)).map((item) => {
            switch (item.kind) {
              case 'human':
                return (
                  <div className="tl-human" key={item.id}>
                    <span className={`avatar r-${item.author.role}`}>{item.author.initials}</span>
                    <div>
                      <div className="msg-head">
                        <span className="name">{item.author.name}</span>
                        <span className="role">{item.author.roleLabel}</span>
                        <span className="time">{item.time}</span>
                        {item.quote && <span className="client-tag">转述客户</span>}
                      </div>
                      <div className={`msg-body${item.quote ? ' quote' : ''}`}>{item.text}</div>
                    </div>
                  </div>
                )
              case 'system':
                return (
                  <div className={`tl-system ${item.tone ?? ''}`} key={item.id}>
                    <span className="sys-icon">{SYS_ICON[item.icon]}</span>
                    <span className="sys-text">{item.text}</span>
                    <span className="sys-meta">{item.meta}</span>
                    <span className="sys-line" />
                  </div>
                )
              case 'processing':
                return (
                  <div className="tl-processing" key={item.id}>
                    {item.lines.map((l, i) => (
                      <div className={`pline${i < item.doneCount ? ' done' : ''}`} key={l}>
                        <span className="spin" />
                        {l}
                      </div>
                    ))}
                  </div>
                )
              case 'contextBrief':
                return (
                  <div className="tl-brief" key={item.id}>
                    <div className="brief-head">
                      <span className={`avatar r-${item.joiner.role}`}>{item.joiner.initials}</span>
                      <span className="brief-title">
                        {item.joiner.name} · {item.joiner.roleLabel} 加入 Case
                      </span>
                      <span className="brief-stage">{item.stageLabel}</span>
                      <span className="time">{item.time}</span>
                    </div>
                    <div className="brief-kicker">Context Brief · 你需要知道（结构化上下文，非完整聊天记录）</div>
                    <ul className="brief-lines">
                      {item.lines.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                    <div className="brief-foot">
                      <span className="brief-label">可查看依据</span>
                      {item.evidence.map((e) => (
                        <button
                          key={e.artifactId}
                          className="evidence-chip"
                          onClick={() => {
                            store.clearFocus()
                            requestAnimationFrame(() => {
                              document
                                .getElementById(`anchor-${e.artifactId}`)
                                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                            })
                          }}
                        >
                          {e.label}
                        </button>
                      ))}
                      <span className="brief-next">下一步：{item.nextAction}</span>
                    </div>
                  </div>
                )
              case 'action':
                return (
                  <div className={`tl-action${item.done ? ' done' : ''}`} key={item.id}>
                    <div className="ta-head">
                      <span className="ta-icon">{item.done ? '✓' : '⚠'}</span>
                      <span className="ta-title">{item.title}</span>
                      <span className="time">{item.time}</span>
                    </div>
                    <div className="ta-detail">{item.detail}</div>
                    <div className="ta-foot">
                      {item.done ? (
                        <span className="ta-done-meta">✓ {item.doneMeta}</span>
                      ) : (
                        <ActionBtn
                          label={item.actionLabel}
                          kind="primary"
                          allowed={item.allowed}
                          role={role}
                          onClick={() =>
                            confirmThen({
                              key: item.actionKey,
                              title: `${item.actionLabel} Request Live Requote`,
                              summary: ['向 Morgan Stanley 请求实时最终价格', '按最新价格更新执行单草稿'],
                              consequence: '过期报价不能用于成交。收到最终价格后，AI 将更新执行单，由 Dealer 复核执行。',
                              confirmLabel: item.actionLabel,
                            })
                          }
                        />
                      )}
                    </div>
                  </div>
                )
              case 'artifact':
                return (
                  <div key={item.id} id={`anchor-${item.artifactId}`}>
                    <ArtifactCard artifactId={item.artifactId} />
                  </div>
                )
            }
          })}
          {truth.status === 'COMPLETED' && (
            <div className="done-banner">
              ✓ Case 已完成 · COMPLETED
              <div className="db-sub">全流程 audit 记录可在右上角 History 查看。点击「重置 Demo」可重新演示。</div>
            </div>
          )}
          </div>
          <div ref={endRef} />
          </>
        )}
        </div>
        <TradeComposer />
      </div>
    </main>
  )
}
