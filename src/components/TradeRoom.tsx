import { useCallback, useEffect, useRef, useState } from 'react'
import { AtSign, BookOpen, Building2, Calculator, Check, ChevronDown, ChevronRight, ClipboardList, Coins, Copy, ListFilter, MessageSquare, ShieldCheck, SlidersHorizontal, Paperclip, Send, Sparkles, Table2, Wallet, WandSparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { OTHER_CASES, PEOPLE } from '../data'
import { store, useEngine } from '../hooks'
import type { Artifact, RoleKey, TimelineItem } from '../types'
import type { AgentStep } from '../ai/agent'
import { toolBrief } from '../ai/tools'
import { buildNeedFields, originLabel } from '../config/fcn-pack/need-view'
import { ArtifactCard, NeedReviewWorkspace } from './Artifacts'
import { confirmThen } from './confirm'
import { MiniMarkdown } from './markdown'
import { IconButton } from './primitives'
import {
  ClientOutreachWorkspace,
  ClientQuoteWorkspace,
  ExecutionWorkspace,
  TradeRecordWorkspace,
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
  mail: '✉',
}

// ── Progressive participation: per-role visibility (§5.4 Layer A/B/C) ────
// Settled artifacts are public case history (Layer A); in-flight work is
// visible only to the roles working on it (Layer B); raw human messages
// stay with their author's role (Layer C).
const PUBLIC_STATUS = new Set(['APPROVED', 'ACCEPTED', 'SENT', 'CONFIRMED', 'VALIDATED', 'EXECUTED', 'EXPIRED', 'STALE', 'SUPERSEDED'])
const WORKING_VIEWERS: Record<Artifact['data']['type'], RoleKey[]> = {
  needBrief: ['rm', 'ps'],
  structureProposal: ['ps'],
  rfqPackage: ['dealer', 'ps'],
  quoteMatrix: ['dealer', 'ps'],
  clientQuote: ['rm', 'dealer'],
  clientEmail: ['rm'],
  callTranscript: ['rm'],
  instruction: ['rm'],
  executionTicket: ['dealer'],
  tradeRecord: ['dealer', 'ops'],
  termsheetValidation: ['ops', 'dealer'],
  deviationProposal: ['rm', 'ps', 'dealer'],
}

function itemVisibleTo(item: TimelineItem, role: RoleKey, artifacts: Record<string, Artifact>): boolean {
  switch (item.kind) {
    case 'human':
      // 房间发言公开（Layer A）；转述客户的原始话术仍按作者角色隔离（Layer C）。
      if (item.author.guest) return true
      if (!item.quote) return true
      return item.author.role === role
    case 'preAnalysis':
      // 分层可见：仅提问者与被 @ 者可见，未确认不进公共层
      return !item.superseded && (item.asker === role || item.target === role)
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
  ps: { when: '需求阶段，由 RM 拉入共创（CLIENT_NEED_JOINT_REVIEW）', task: '和 RM 一起与客户界定标的与结构方向，需求确认后设计并审批结构' },
  dealer: { when: '结构审批、RFQ Package 生成后（RFQ_READY）', task: '复核 RFQ，发起市场询价' },
  ops: { when: '代客下单并收到成交回报后（BOOKING_REVIEW）', task: '从交易登记记录录入簿记，再与发行商条款书三方核对' },
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
  const { truth, language } = useEngine()
  const zh = language === 'zh'
  const owner = truth.currentOwner
  return (
    // 只回答三件事：谁负责、到哪一步、接下来做什么。
    //
    // 原来左半边还并排列着交易要素（名义本金 / 期限 / 行权价 / KI），去掉了——
    // 那些字段在下面的产物卡里就是全文，置顶条再抄一遍只是把同一句话说两遍，
    // 而且栏一窄就折行错位。要看完整条款走「下一步」点进案例详情。
    //
    // 也不再是卡片：剩三件事之后，那个白底方框只是给一行状态套了个盒子。
    // 「负责人」「状态」两个标签一并去掉——头像和徽章本身就说明了是谁、什么状态。
    <div className="truth-strip">
      <span className="ts-owner">
        {owner ? <><em className={`np-avatar r-${owner.role}`}>{owner.initials}</em>{owner.name} · {owner.roleLabel}</> : zh ? '案例已完成' : 'Case complete'}
      </span>
      <span className="ts-sep" />
      <span className={`badge ${truth.statusTone}`}>{truth.statusLabel}</span>
      <button className="next-pill" onClick={() => store.openDrawer({ type: 'case' })} title={zh ? '查看案例详情' : 'Open case details'}>
        <span>{zh ? '下一步' : 'Next'}</span>
        <b>{truth.nextAction}</b>
        <ChevronRight size={13} />
      </button>
    </div>
  )
}


// 过滤版时间线：只呈现"人的发言 + 协作类事件 + 分层可见的预分析"。
// 产物与流程推进由阶段工作台承载，不在此重复。

/** 产物正文的极简 markdown 渲染，与私区 agent 回话共用同一套 → ./markdown */
const DraftBody = MiniMarkdown

/** 一键复制原文（markdown 原样），发给客户前自己再排版也方便 */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className={`md-copy${done ? ' ok' : ''}`}
      title="复制全文"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1600)
        })
      }}
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
      {done ? '已复制' : '复制'}
    </button>
  )
}

/**
 * 划词批注：在自己的 agent 初稿上圈一段，浮出一个输入框写一句话。
 * 发送后自动打开私区，并把原文片段一起带过去——不用再复述上下文。
 */
function AnnotatableDraft({ text, footer }: { text: string; footer: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [sel, setSel] = useState<{ quote: string; top: number; left: number } | null>(null)
  const [comment, setComment] = useState('')

  useEffect(() => { if (sel) inputRef.current?.focus() }, [sel])

  useEffect(() => {
    // 除了浮层本身，点哪儿都关——包括初稿正文，因为点正文就是在取消选中。
    // 新的一次划选会在 mouseup 时重新打开。
    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.annot-pop')) return
      setSel(null); setComment('')
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const onSelect = () => {
    const s = window.getSelection()
    const quote = s?.toString().trim() ?? ''
    if (!s || s.rangeCount === 0 || quote.length < 2 || !ref.current) return
    // 只接受完全落在本段初稿内的选区
    if (!ref.current.contains(s.anchorNode) || !ref.current.contains(s.focusNode)) return
    const r = s.getRangeAt(0).getBoundingClientRect()
    // 默认浮在选区上方——正文往下延续，压住上面已读过的内容影响更小；
    // 上方放不下才翻到下方。
    const H = 46
    const above = r.top - H - 6
    setSel({
      quote,
      top: above > 96 ? above : r.bottom + 6,
      left: Math.max(16, Math.min(r.left, window.innerWidth - 360)),
    })
  }

  const cancel = () => { setSel(null); setComment(''); window.getSelection()?.removeAllRanges() }
  const send = () => {
    if (!sel || !comment.trim()) return
    store.annotateDraft(sel.quote, comment)
    cancel()
  }

  return (
    <>
      <div ref={ref} className="annot-body" onMouseUp={onSelect}><DraftBody text={text} /></div>
      {sel ? (
        <div className="annot-pop" style={{ top: sel.top, left: sel.left }}>
          <input
            ref={inputRef}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); if (e.key === 'Escape') cancel() }}
            placeholder="对这段说点什么，回车发给你的 agent…"
          />
          <button onClick={send} disabled={!comment.trim()} aria-label="发送批注"><Send size={14} /></button>
        </div>
      ) : null}
      {footer}
    </>
  )
}


/**
 * 叙述里模型偶尔会带 **粗体** 之类的 markdown，最小化渲染一下。
 * 流式的关键：一对 ** 会跨两个分片到达，中间那一拍只有前半个，
 * 正则配不上就把星号原样吐到界面上——所以先把落单的标记吃掉再渲染。
 */
function Narration({ text }: { text: string }) {
  const clean = text.replace(/^#{1,6}\s*/gm, '').replace(/`{1,3}/g, '')
  // 先配对，再把落单的星号从普通段里抹掉——
  // 开标记可能在很前面、闭标记还没流到，只处理"结尾未闭合"是不够的
  const parts = clean.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((t, i) => (i % 2 ? <b key={i}>{t}</b> : t.replace(/\*+/g, '')))}
    </>
  )
}

/** 折叠行的摘要：把调过的工具翻成动词，"读取档案、计算集中度、试算票息" */
const TOOL_VERB: Record<string, string> = {
  get_client_profile: '读取客户档案',
  get_holdings: '读取持仓',
  compute_exposure: '计算集中度',
  price_indicative: '试算票息',
  issuer_coverage: '查可报价发行商',
  list_underlyings: '列可选标的',
  structure_template: '读产品参数域',
  check_suitability: '适当性预检',
}

/** 每个动作配一个图标——扫一眼就知道它在读资料还是在算数 */
const TOOL_ICON: Record<string, LucideIcon> = {
  get_client_profile: BookOpen,
  get_holdings: Wallet,
  compute_exposure: Calculator,
  price_indicative: Coins,
  issuer_coverage: Building2,
  list_underlyings: ListFilter,
  structure_template: SlidersHorizontal,
  check_suitability: ShieldCheck,
}

/**
 * 一段叙述。
 * 流式期间也保持 2 行高，但滚到底——像终端那样只跟最新的两行，
 * 而不是让一整片文字铺开把工具行挤到屏幕外。写完收起，点开看全文。
 */
function ThoughtLine({
  step, open, onToggle,
}: {
  step: Extract<AgentStep, { kind: 'thought' | 'answer' }>
  open: boolean
  onToggle: () => void
}) {
  const ref = useRef<HTMLParagraphElement>(null)
  const live = step.kind === 'thought' && !!step.streaming
  useEffect(() => {
    if (live && ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [step.text, live])
  return (
    <div className="at-step">
      <p
        ref={ref}
        className={`at-thought${open ? '' : ' clamp'}${live ? ' live' : ''}`}
        onClick={onToggle}
      >
        <Narration text={step.text} />
      </p>
    </div>
  )
}

type ToolStep = Extract<AgentStep, { kind: 'tool' }>
type TraceGroup =
  | { kind: 'text'; at: number; step: Extract<AgentStep, { kind: 'thought' | 'answer' }> }
  | { kind: 'error'; at: number; step: Extract<AgentStep, { kind: 'error' }> }
  | { kind: 'tools'; at: number; name: string; steps: ToolStep[] }

/**
 * 相邻的同名工具调用并成一组。
 * 只并相邻的——中间隔了一段叙述就是新的一轮判断，合并会把顺序讲乱。
 */
function groupSteps(steps: AgentStep[]): TraceGroup[] {
  const out: TraceGroup[] = []
  steps.forEach((st, i) => {
    if (st.kind === 'error') return void out.push({ kind: 'error', at: i, step: st })
    if (st.kind !== 'tool') return void out.push({ kind: 'text', at: i, step: st })
    const last = out[out.length - 1]
    if (last?.kind === 'tools' && last.name === st.name) last.steps.push(st)
    else out.push({ kind: 'tools', at: i, name: st.name, steps: [st] })
  })
  return out
}

function traceSummary(steps: AgentStep[]): string {
  const verbs: string[] = []
  for (const s of steps) {
    if (s.kind !== 'tool') continue
    const v = TOOL_VERB[s.name] ?? s.name
    if (!verbs.includes(v)) verbs.push(v)
  }
  if (!verbs.length) return ''
  return verbs.slice(0, 3).join('、') + (verbs.length > 3 ? '…' : '')
}

/**
 * Agent 运行轨迹：叙述 + 工具调用 + 结果。
 * 运行时展开（边跑边长），出终稿后自动折叠成一行——
 * 过程可回看，但不占版面。参照 Codex 的处理方式。
 */
function AgentTrace({ item }: { item: Extract<TimelineItem, { kind: 'agentTrace' }> }) {
  // 展开状态是派生的：跑的时候展开，出终稿后自动收起；
  // 手动点过就以手动为准（和产物卡的折叠逻辑一致）
  const [override, setOverride] = useState<boolean | null>(null)
  const [openStep, setOpenStep] = useState<number | null>(null)
  const open = override ?? !item.done
  const setOpen = (v: boolean | ((p: boolean) => boolean)) =>
    setOverride(typeof v === 'function' ? v(open) : v)

  const secs = Math.round((item.ms ?? 0) / 100) / 10
  const summary = traceSummary(item.steps)
  // 回退脚本时 rounds/toolCalls 是空的，就从轨迹本身数——别让它一直显示"思考中"
  const calls = item.toolCalls ?? item.steps.filter((s) => s.kind === 'tool').length
  const meta = item.done
    ? item.rounds
      ? `${item.rounds} 轮 · 调用工具 ${calls} 次`
      : `调用工具 ${calls} 次`
    : '思考中…'

  return (
    <div className={`agent-trace${item.done ? ' done' : ''}${open ? '' : ' collapsed'}`}>
      <button className="at-head" onClick={() => setOpen((v) => !v)}>
        <span className="at-spark">{item.done ? <Check size={12} /> : <span className="at-dot" />}</span>
        {item.done && !open ? (
          <>
            <strong>已完成思考</strong>
            {summary ? <span className="at-sum">{summary}</span> : null}
            <span className="at-meta">{secs}s</span>
          </>
        ) : (
          <>
            <strong>{item.done ? '已完成思考' : item.title}</strong>
            <span className="at-meta">{item.done ? `${secs}s · ${meta}` : meta}</span>
          </>
        )}
        <ChevronDown size={13} className={`at-chev${open ? ' flip' : ''}`} />
      </button>
      {open ? (
        <div className="at-panel">
          <div className="at-steps">
            {groupSteps(item.steps).map((g) => {
              const i = g.at
              if (g.kind === 'error') return <p className="at-error" key={i}>{g.step.text}</p>
              if (g.kind === 'text') {
                return (
                  <ThoughtLine
                    key={i}
                    step={g.step}
                    open={openStep === i}
                    onToggle={() => setOpenStep(openStep === i ? null : i)}
                  />
                )
              }
              // 只说它做了什么，不露函数名、入参和返回值。
              // 连着调同一个工具的，默认并成一条——它试算 6 组条款是一件事，不是 6 件
              const { steps: calls, name } = g
              const Icon = TOOL_ICON[name] ?? BookOpen
              const pending = calls.some((c) => c.result === undefined)
              const denied = calls.some((c) => c.denied)
              const many = calls.length > 1
              const expanded = openStep === i
              return (
                <div key={i}>
                  <div
                    className={`at-tool${denied ? ' denied' : ''}${pending ? ' pending' : ''}${many ? ' many' : ''}`}
                    onClick={many ? () => setOpenStep(expanded ? null : i) : undefined}
                  >
                    <Icon size={13} strokeWidth={1.75} />
                    <span>
                      {many ? `${toolBrief(name)} · ${calls.length} 次` : calls[0].label || '执行中…'}
                    </span>
                    {denied ? <b className="at-denied">权限不足，未取到</b> : null}
                  </div>
                  {many && expanded ? (
                    <div className="at-sub">
                      {calls.map((c, k) => <span key={k}>{c.label || '执行中…'}</span>)}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * 需求摘要的实时置顶条。
 *
 * 讨论一长，需求卡就被刷上去了——可它恰恰是这个阶段所有人要盯的东西。
 * 所以钉在当前阶段对话的顶部：平时一行，有更新时亮一下，点开看全部字段。
 */
function NeedPin({ stuck }: { stuck: boolean }) {
  const { truth, needSettled, specialistProposalPublished, needFieldUpdates, artifacts, language } = useEngine()
  const zh = language === 'zh'
  const [open, setOpen] = useState(false)
  const [flash, setFlash] = useState(false)
  const lastCount = useRef(needFieldUpdates.length)

  const latest = needFieldUpdates[needFieldUpdates.length - 1]
  useEffect(() => {
    if (needFieldUpdates.length > lastCount.current) {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 4000)
      lastCount.current = needFieldUpdates.length
      return () => clearTimeout(t)
    }
    lastCount.current = needFieldUpdates.length
  }, [needFieldUpdates.length])

  const need = artifacts['art-need']
  if (truth.stage !== 'need' || !need || need.data.type !== 'needBrief') return null
  // 没被讨论刷上去就不用出现——短对话里它只是噪音。
  // 有新更新时例外：那一下要让人看见。
  if (!stuck && !flash) return null

  const fields = buildNeedFields({
    needSettled,
    hasProposal: specialistProposalPublished,
    updates: needFieldUpdates,
    fields: need.data.fields,
    zh,
  })
  const openCount = fields.filter((f) => f.open).length
  const latestLabel = latest ? fields.find((f) => f.key === latest.key)?.label : null

  return (
    <div className={`need-pin${open ? ' open' : ''}${flash ? ' flash' : ''}`}>
      <button className="np-head" onClick={() => setOpen((v) => !v)}>
        <ClipboardList size={13} />
        <strong>{zh ? '客户需求摘要' : 'Client Need Brief'}</strong>
        <span className="np-count">{fields.length - openCount}/{fields.length} {zh ? '已定' : 'set'}</span>
        {flash && latestLabel ? (
          <span className="np-flash">{zh ? `已更新 ${latestLabel}` : `Updated ${latestLabel}`}</span>
        ) : openCount ? (
          <span className="np-open">{zh ? `${openCount} 项待定` : `${openCount} open`}</span>
        ) : null}
        <ChevronDown size={13} className={`at-chev${open ? ' flip' : ''}`} />
      </button>
      {open ? (
        <div className="np-body">
          {fields.map((f) => (
            <div className={`np-row${f.open ? ' pending' : ''}`} key={f.key}>
              <span>{f.label}</span>
              <strong>{f.value}</strong>
              <em>{f.edited ? zh ? '人工填写' : 'Manual' : originLabel(f.origin, f.fromDiscussion, zh)}</em>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function RoomFeed() {
  const { timeline, role, artifacts, truth, language } = useEngine()
  const zh = language === 'zh'
  const [showEarlier, setShowEarlier] = useState(false)
  // 顶部哨兵滚出视野 = 需求摘要已经被讨论顶上去了
  const [top, setTop] = useState<HTMLDivElement | null>(null)
  const topRef = useCallback((el: HTMLDivElement | null) => setTop(el), [])
  const [scrolledPast, setScrolledPast] = useState(false)
  useEffect(() => {
    // 用 callback ref 而不是 useRef：feed 为空时这个组件返回 null，
    // 挂载时拿不到节点，[] 依赖的 effect 就再也不会重挂了。
    const el = top
    if (!el) return
    const sc = scrollParent(el)
    if (!sc) return
    // 不用 IntersectionObserver：哨兵从"视口下方"一跳到"视口上方"时，
    // 交叉状态是 false → false，中间那一帧没被采样到，回调压根不触发。
    // 直接量位置反而可靠：被顶到容器上沿之上，才算被讨论刷上去了。
    const check = () => setScrolledPast(el.getBoundingClientRect().top < sc.getBoundingClientRect().top)
    check()
    sc.addEventListener('scroll', check, { passive: true })
    return () => sc.removeEventListener('scroll', check)
  }, [top])
  const items = timeline.filter((i) => {
    if (i.kind === 'human') return itemVisibleTo(i, role, artifacts)
    if (i.kind === 'system') return !!i.feed
    // 自己的 agent 永远可见；别人的只有在你 @ 出来时才可见——
    // 自动触发的那些（比如 David 自己细化交易要素）产物只进他私区，过程也不该外泄。
    // 另外：产物已经落到界面上之后，跑完的思考过程就收进「此前阶段」，
    // 别在等待屏上跟结果并排占位。
    if (i.kind === 'agentTrace') {
      if (i.owner !== role && i.asker !== role) return false
      return !(i.done && !i.asker)
    }
    if (i.kind === 'preAnalysis') return !i.superseded && (i.asker === role || i.target === role)
    return false
  })
  if (items.length === 0) return null
  // 按阶段折叠：当前阶段展开，此前阶段收起、按需展开
  const current = items.filter((i) => !('stage' in i) || i.stage === undefined || i.stage === truth.stage)
  const earlier = items.filter((i) => 'stage' in i && i.stage !== undefined && i.stage !== truth.stage)
  const shown = showEarlier ? items : current
  const renderItem = (item: (typeof items)[number]) => {
    if (item.kind === 'human') {
      return (
        <div className="feed-msg" key={item.id}>
          <time className="feed-time">{item.time}</time>
          <span className={`avatar r-${item.author.role}`}>{item.author.initials}</span>
          <div className="feed-msg-body">
            <div className="feed-msg-head">
              <b>{item.author.name}</b>
              <span className="feed-role">{item.author.roleLabel}</span>
              {item.via ? <span className="feed-via">{item.via}</span> : null}
              {item.quote ? <span className="feed-via quote">{zh ? '转述客户' : 'Client relay'}</span> : null}
            </div>
            <p>{item.text}</p>
          </div>
        </div>
      )
    }
    if (item.kind === 'system') {
      return (
        <div className={`feed-sys ${item.tone ?? ''}`} key={item.id}>
          <time className="feed-time">{item.meta.match(/\d{1,2}:\d{2}/)?.[0] ?? ''}</time>
          <span className="feed-sys-dot" />
          <span className="feed-sys-text">{item.text}</span>
        </div>
      )
    }
    if (item.kind === 'agentTrace') return <AgentTrace item={item} key={item.id} />
    if (item.kind === 'preAnalysis') {
      // 被 @ 的本人才有处置权：初稿要改要确认都在他的私区，
      // 入口就放在他看到初稿的地方，不用先去顶栏找「私有工作区」。
      const mine = item.target === role
      return (
        <div className={`feed-pre-row${mine ? ' mine' : ''}`} key={item.id}>
          <time className="feed-time">{item.time}</time>
          <div className="feed-pre">
            <div className="feed-pre-head">
              <span className="feed-pre-badge">AI</span>
              <b>{mine ? zh ? '你的 agent · 初稿' : 'Your agent · draft' : `${item.targetName}${zh ? ' 的 agent · 预分析' : "'s agent · pre-analysis"}`}</b>
              <span className="feed-pre-vis">{mine ? '待你确认' : '未确认'}</span>
              {/* 这一版是真模型还是脚本，现场要看得出来 */}
              {item.source ? (
                <span className={`feed-pre-src ${item.source}`} title={item.source === 'live' ? '由模型网关实时生成，已过结构化校验' : item.source === 'fallback' ? '尝试调用模型但失败，已回退脚本' : '脚本模式'}>
                  {item.source === 'live' ? '真模型' : item.source === 'fallback' ? '已回退脚本' : '脚本'}
                </span>
              ) : null}
              <CopyButton text={item.text} />
            </div>
            {mine ? (
              <AnnotatableDraft
                text={item.text}
                footer={
                  <div className="feed-pre-actions">
                    <span className="fpa-tip"><Sparkles size={12} />划选任意一段批注，或在私区与 agent 讨论</span>
                    <span className="fpa-hint">未经你确认，这份初稿不进审计、不能转发给客户</span>
                  </div>
                }
              />
            ) : <DraftBody text={item.text} />}
          </div>
        </div>
      )
    }
    return null
  }
  return (
    <div className="room-feed">
      {/* 哨兵：它滚出视野了，才说明摘要被讨论刷上去了 */}
      <div ref={topRef} className="feed-top-sentinel" />
      <NeedPin stuck={scrolledPast} />
      {earlier.length > 0 ? (
        <button className="feed-more" onClick={() => setShowEarlier((v) => !v)}>
          {showEarlier
            ? zh ? '收起此前阶段的讨论' : 'Collapse earlier stages'
            : zh ? `此前阶段的 ${earlier.length} 条讨论 ⌄` : `${earlier.length} messages from earlier stages ⌄`}
        </button>
      ) : null}
      {shown.map(renderItem)}
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
    case 'WAITING_FOR_CLIENT': return <ClientOutreachWorkspace />
    case 'CLIENT_INSTRUCTION_PENDING_CONFIRMATION': return <InstructionReviewWorkspace />
    case 'EXECUTION_READY': return <ExecutionWorkspace />
    case 'TRADE_RECORD_REVIEW':
    case 'BOOKING_REVIEW': return <TradeRecordWorkspace />
    case 'TERMSHEET_REVIEW':
    case 'EXCEPTION': return <TermsheetWorkspace />
    default: return <TransitionWorkspace />
  }
}

function TradeComposer() {
  const { language, role, invited } = useEngine()
  const zh = language === 'zh'
  const [message, setMessage] = useState('')
  const [pop, setPop] = useState<'mention' | 'attach' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const send = () => {
    if (!message.trim()) return
    store.postTradeRoomMessage(message)
    setMessage('')
    setPop(null)
  }
  const insert = (text: string) => {
    setMessage((m) => (m ? m.replace(/\s*$/, ' ') : '') + text)
    setPop(null)
    inputRef.current?.focus()
  }
  // 可 @ 的人：四个正式角色（除自己）+ 已拉入的协作者
  const mentionables = [
    ...Object.values(PEOPLE).filter((p) => p.role !== role),
    ...invited.map((i) => i.person),
  ]
  const DEMO_ATTACHMENTS = [
    { name: '客户邮件 email-20250516-1402.eml', note: zh ? '需求来源' : 'source email' },
    { name: '电话录音 rec-20260525-1436.mp3', note: zh ? '客户确认留痕' : 'confirmation record' },
    { name: '发行商 Final Termsheet.pdf', note: zh ? '待核对' : 'to validate' },
  ]
  return (
    <div className="trade-composer">
      <div className="trade-composer-tools">
        <IconButton icon={Paperclip} label={zh ? '添加附件' : 'Attach file'} onClick={() => setPop(pop === 'attach' ? null : 'attach')} />
        <IconButton icon={Table2} label={zh ? '插入已批准条款表' : 'Insert approved terms'} onClick={() => insert(zh ? '[表格 · 已批准条款 Strike 80% / KI 70% / 6M] ' : '[Table · Approved terms 80%/70%/6M] ')} />
        <IconButton icon={AtSign} label={zh ? '提及参与者' : 'Mention participant'} onClick={() => setPop(pop === 'mention' ? null : 'mention')} />
        <IconButton icon={WandSparkles} label={zh ? '使用技能' : 'Use skill'} onClick={() => store.openDrawer({ type: 'skills' })} />
        {pop === 'mention' ? (
          <div className="composer-pop" onMouseLeave={() => setPop(null)}>
            <div className="composer-pop-head">{zh ? '提及参与者（对方 agent 会先预分析）' : 'Mention (their agent pre-analyzes first)'}</div>
            {mentionables.map((p) => (
              <button key={p.name} onClick={() => insert(`@${p.name} `)}>
                <span className={`avatar r-${p.role}`}>{p.initials}</span>
                <span className="cp-name">{p.name}<small>{p.roleLabel}</small></span>
              </button>
            ))}
          </div>
        ) : null}
        {pop === 'attach' ? (
          <div className="composer-pop" onMouseLeave={() => setPop(null)}>
            <div className="composer-pop-head">{zh ? '添加附件（演示）' : 'Attach (demo)'}</div>
            {DEMO_ATTACHMENTS.map((a) => (
              <button key={a.name} onClick={() => insert(`[附件 · ${a.name}] `)}>
                <Paperclip size={13} />
                <span className="cp-name">{a.name}<small>{a.note}</small></span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <input
        ref={inputRef}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && send()}
        placeholder={zh ? '给交易室发送消息，@ 某人可让其 agent 先预分析...' : 'Message Trade Room, @someone for agent pre-analysis...'}
        aria-label={zh ? '给交易室发送消息' : 'Message Trade Room'}
      />
      <IconButton icon={Send} label={zh ? '发送消息' : 'Send message'} className="trade-send" onClick={send} />
      <IconButton icon={ChevronDown} label={zh ? '更多发送选项' : 'More send options'} />
    </div>
  )
}

/** 找到真正在滚的那个祖先容器 */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let p = el?.parentElement ?? null
  while (p) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p
    p = p.parentElement
  }
  return null
}

export function TradeRoom() {
  const { timeline, activeCaseId, truth, role, focusArtifactId, artifacts, participants, language, dragging } = useEngine()
  const zh = language === 'zh'
  const endRef = useRef<HTMLDivElement>(null)
  const lastLen = useRef(timeline.length)
  // 是否跟随底部。只有用户自己滚轮/触摸往上翻才会关掉——
  // 不能用"当前是否贴底"来判断：平滑滚动动画期间距底很远，会把跟随一直挡在门外。
  const follow = useRef(true)

  useEffect(() => {
    // 挂在 document 上、每次事件再解析容器：挂载那一刻内容往往还不够高，
    // 提前解析会拿到 null，监听器就永远挂不上。
    const onUserScroll = () => {
      requestAnimationFrame(() => {
        const sc = scrollParent(endRef.current)
        if (sc) follow.current = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 220
      })
    }
    document.addEventListener('wheel', onUserScroll, { passive: true, capture: true })
    document.addEventListener('touchmove', onUserScroll, { passive: true, capture: true })
    return () => {
      document.removeEventListener('wheel', onUserScroll, true)
      document.removeEventListener('touchmove', onUserScroll, true)
    }
  }, [])

  useEffect(() => {
    // New timeline items scroll into view. Chat-like items (发言/回执/预分析)
    // always scroll; artifact pushes still defer to an explicit artifact focus.
    if (timeline.length > lastLen.current) {
      const last = timeline[timeline.length - 1]
      const chatLike = last && (last.kind === 'human' || last.kind === 'preAnalysis' || (last.kind === 'system' && last.feed))
      if (chatLike || !focusArtifactId) {
        // 有新条目就重新跟随——@ 完人之后 agent 的轨迹要自己滚出来
        follow.current = true
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      }
    }
    lastLen.current = timeline.length
  }, [timeline, focusArtifactId])

  // agent 跑的时候轨迹是**原地长**的，timeline.length 不变，上面那个 effect 不会触发。
  // 步数和文字长度都要跟：加一行会长高，一段话从一行写到两行也会长高。
  const liveGrowth = timeline.reduce((n, i) => {
    if (i.kind !== 'agentTrace' || i.done) return n
    // +1 让"轨迹刚出现、还没有步骤"这一刻也触发一次，否则开头会差半屏
    return n + 1 + i.steps.length * 1e6 + i.steps.reduce((m, s) => m + ('text' in s ? s.text.length : 0), 0)
  }, 0)
  const lastGrowth = useRef(liveGrowth)
  useEffect(() => {
    if (liveGrowth > lastGrowth.current && follow.current) {
      // 直接置 scrollTop 比 scrollIntoView 稳：后者在布局还没定下来时会欠一截
      const sc = scrollParent(endRef.current)
      if (sc) sc.scrollTop = sc.scrollHeight
    }
    lastGrowth.current = liveGrowth
  }, [liveGrowth])

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

  const sourceReview = truth.status === 'CLIENT_NEED_DRAFT' || truth.status === 'CLIENT_NEED_JOINT_REVIEW'
  const dedicatedStage = [
    'CLIENT_NEED_APPROVED', 'STRUCTURE_REVIEW', 'STRUCTURE_APPROVED', 'STRUCTURE_MODIFICATION_REQUIRED',
    'RFQ_READY', 'PRICING_IN_PROGRESS', 'REQUOTE_REQUIRED', 'CLIENT_QUOTE_READY', 'WAITING_FOR_CLIENT',
    'CLIENT_RESPONSE_RECEIVED', 'CLIENT_INSTRUCTION_PENDING_CONFIRMATION', 'CLIENT_INSTRUCTION_CONFIRMED',
    'EXECUTION_READY', 'EXECUTED', 'TRADE_RECORD_REVIEW', 'BOOKING_REVIEW', 'TERMSHEET_REVIEW', 'EXCEPTION', 'COMPLETED',
  ].includes(truth.status)

  return (
    <main className="main trade-main">
      {dragging?.kind === 'draft' ? (
        <div
          className="drop-zone room-drop"
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
          onDrop={(e) => { e.preventDefault(); store.dropDraftToRoom(dragging.id) }}
        >
          <span>松手发布到交易室（需确认）</span>
        </div>
      ) : null}
      <div className="main-inner">
        <div className="trade-scroll-content">
        <div className="trade-room-heading"><MessageSquare size={16} /><strong>{zh ? '交易室' : 'Trade Room'}</strong><ChevronDown size={15} />{sourceReview ? <span className="room-mode">{zh ? '来源核对' : 'Source Review'}</span> : null}</div>
        {sourceReview ? <><NeedReviewWorkspace /><RoomFeed /></> : dedicatedStage ? (
          <>
            <CurrentTruthStrip />
            <RoomFeed />
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
              case 'preAnalysis':
                return null
            }
          })}
          {truth.status === 'COMPLETED' && (
            <div className="done-banner">
              ✓ Case 已完成 · COMPLETED
              <div className="db-sub">全流程 audit 记录可在右上角 History 查看。点击「重置 Demo」可重新演示。</div>
            </div>
          )}
          </div>
          </>
        )}
        <div ref={endRef} />
        </div>
        <TradeComposer />
      </div>
    </main>
  )
}
