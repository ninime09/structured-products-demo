import { useEffect, useState } from 'react'
import {
  Database,
  Archive,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Clock3,
  Command,
  FileText,
  Folder,
  FolderOpen,
  History,
  LockKeyhole,
  Mail,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PlayCircle,
  RotateCcw,
  Pin,
  Plus,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  WandSparkles,
  Zap,
} from 'lucide-react'
import { INVITABLE, OTHER_CASES, PEOPLE } from '../data'
import { ACTIVE_CLIENT_ID, CLIENTS } from '../config/mock-data/clients'
import { store, useEngine } from '../hooks'
import { startDemo } from '../demo'
import type { RoleKey, StageKey } from '../types'
import { IconButton, Tag } from './primitives'
import { gatewayHealth, gatewayTrace, getAiMode, setAiMode } from '../ai/gateway'
import type { AiMode, GatewayHealth, GatewayTrace } from '../ai/gateway'

// ── Workflow tracker ─────────────────────────────────────────────────────
const STAGES: { key: StageKey; en: string; zh: string }[] = [
  { key: 'need', en: 'Need', zh: '需求' },
  { key: 'structure', en: 'Structure', zh: '结构' },
  { key: 'rfq', en: 'RFQ', zh: '询价' },
  { key: 'pricing', en: 'Pricing', zh: '定价' },
  { key: 'client', en: 'Client', zh: '客户' },
  { key: 'execution', en: 'Execution', zh: '执行' },
  { key: 'termsheet', en: 'Term Sheet', zh: '条款书' },
]
const STAGE_ORDER: StageKey[] = ['need', 'structure', 'rfq', 'pricing', 'client', 'execution', 'termsheet', 'done']
const STAGE_ANCHOR: Record<string, string> = {
  need: 'art-need',
  structure: 'art-structure',
  rfq: 'art-rfq',
  pricing: 'art-matrix-r0',
  client: 'art-cq',
  execution: 'art-ticket',
  termsheet: 'art-tv',
}

export function WorkflowTracker() {
  const { truth, artifacts, language } = useEngine()
  const currentIdx = STAGE_ORDER.indexOf(truth.stage)
  return (
    <div className="tracker">
      {STAGES.map((s, i) => {
        const idx = STAGE_ORDER.indexOf(s.key)
        const isCurrent = truth.stage === s.key
        const done = idx < currentIdx
        const exception = isCurrent && truth.stageException
        const cls = exception ? 'exception' : isCurrent ? 'current' : done ? 'done' : ''
        const anchor = STAGE_ANCHOR[s.key]
        return (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            {i > 0 && <span className="connector" />}
            <button
              className={`step ${cls}`}
              onClick={() => {
                if (anchor && artifacts[anchor]) {
                  store.setView('room')
                  store.openCase('SP-001')
                  requestAnimationFrame(() => {
                    document.getElementById(`anchor-${anchor}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  })
                }
              }}
              title={anchor && artifacts[anchor]
                ? language === 'zh' ? '跳转到对应产物' : 'Open stage artifact'
                : language === 'zh' ? '该阶段尚未开始' : 'This stage has not started'}
            >
              <span className="dot" />
              {exception ? '✕ ' : ''}
              {language === 'zh' ? s.zh : s.en}
            </button>
          </span>
        )
      })}
    </div>
  )
}


/**
 * Kill switch + 网关状态。
 * 默认脚本模式；打开"真模型"后所有 AI 接缝走网关，任何失败自动回退脚本。
 * 现场网络抽风或模型说错话，切回来就是。
 */
function AiModePanel() {
  const [mode, setMode] = useState<AiMode>(() => getAiMode())
  const [health, setHealth] = useState<GatewayHealth | null>(null)
  const [trace, setTrace] = useState<GatewayTrace | null>(null)

  useEffect(() => {
    gatewayHealth().then(setHealth)
  }, [])
  useEffect(() => {
    if (mode !== 'live') return
    const tick = () => gatewayTrace().then(setTrace)
    tick()
    const t = setInterval(tick, 4000)
    return () => clearInterval(t)
  }, [mode])

  const active = health?.providers.find((p) => p.id === health.active)
  const ready = Boolean(active?.keyConfigured)

  return (
    <div className="ai-mode-panel">
      <div className="ai-mode-head">
        <span className="personal-entry-icon"><Zap size={15} /></span>
        <span><strong>AI 模式</strong><small>{ready ? `${active?.id} · ${active?.model}` : '未配置 key，仅脚本模式'}</small></span>
        <div className="language-switch" role="group" aria-label="选择 AI 模式">
          <button className={mode === 'script' ? 'active' : ''} onClick={() => { setAiMode('script'); setMode('script') }}>脚本</button>
          <button
            className={mode === 'live' ? 'active' : ''}
            disabled={!ready}
            title={ready ? '所有 AI 接缝走模型网关；失败自动回退脚本' : '未配置 API key，无法切到真模型'}
            onClick={() => { setAiMode('live'); setMode('live') }}
          >真模型</button>
        </div>
      </div>
      {mode === 'live' && trace ? (
        <div className="ai-mode-trace">
          调用 {trace.count} 次 · 成功率 {trace.okRate === null ? '—' : `${Math.round(trace.okRate * 100)}%`} · 平均 {trace.avgMs ?? '—'}ms
        </div>
      ) : null}
      {!ready ? <div className="ai-mode-hint">在 <code>.env</code> 里设置 <code>{active?.keyEnv ?? 'DEEPSEEK_API_KEY'}</code> 后重启 dev server</div> : null}
    </div>
  )
}

// ── Header ───────────────────────────────────────────────────────────────
export function AppHeader() {
  const { view, activeCaseId, truth, role, language, privateOpen } = useEngine()
  const zh = language === 'zh'
  const showCase = view === 'room' && activeCaseId === 'SP-001'
  return (
    <header className={`header${view === 'assistant' ? ' assistant-header' : view === 'room' ? ' room-header' : ''}`}>
      <span className="brand">
        <span className="logo-mark"><Zap size={22} fill="currentColor" /></span>
        Structured Products
      </span>
      <div className="header-main">
        {showCase ? (
          <span className="case-title">
            <span className="case-id">{truth.caseId}</span>
            <span className="sep">·</span>
            <strong>{truth.caseName}</strong>
          </span>
        ) : view === 'room' ? (
          <span className="case-title">{activeCaseId}</span>
        ) : view === 'assistant' ? (
          <span className="assistant-title">
            <WandSparkles size={17} strokeWidth={1.8} />
            <strong>{zh ? `${PEOPLE[role].name} 的助手` : `${PEOPLE[role].name}’s Assistant`}</strong>
            <span className="assistant-private-state">
              <LockKeyhole size={11} strokeWidth={1.8} /> {zh ? '私密' : 'Private'}
            </span>
          </span>
        ) : (
          <span className="case-title">My Tasks</span>
        )}
        {showCase && <WorkflowTracker />}
        <div className="header-right">
          {view === 'assistant' ? (
            <>
              <button className="header-tool" onClick={() => store.openDrawer({ type: 'history' })}>
                <History size={16} /> {zh ? '历史' : 'History'}
              </button>
              <button className="header-tool" onClick={() => store.openDrawer({ type: 'skills' })}>
                <BookOpen size={16} /> {zh ? '技能' : 'Skills'}
              </button>
              <button className="header-tool" onClick={() => store.openDrawer({ type: 'data' })}>
                <ShieldCheck size={16} /> {zh ? '数据权限' : 'Data Access'}
              </button>
              <button className="header-tool" onClick={() => store.openDrawer({ type: 'inventory' })}>
                <Database size={16} /> {zh ? '数据源清单' : 'Data Sources'}
              </button>
              <span className="assistant-tool-divider" />
              <IconButton icon={MoreHorizontal} label={zh ? '更多操作' : 'More actions'} className="assistant-more-tool" />
            </>
          ) : (
            <>
              {showCase ? <ParticipantsStack /> : null}
              {/* 这颗按钮原来开的是案例状态面板 —— 那些内容已经压进交易室置顶条了，
                  再开一整块侧栏只是把同一句话说第二遍。改成私区入口：
                  顶栏这个位置本来就是"右侧要开什么"，而右侧现在只留给私有工作区。
                  案例详情仍可从置顶条的「下一步」进去。 */}
              {showCase ? (
                <IconButton
                  icon={Sparkles}
                  className={privateOpen ? 'private-entry active' : 'private-entry'}
                  label={zh ? '私有工作区 · 和你的 agent 私下讨论' : 'Private workspace'}
                  onClick={() => store.togglePrivate()}
                />
              ) : null}
              <HeaderMoreMenu zh={zh} />
            </>
          )}
        </div>
      </div>
    </header>
  )
}

// ── 顶栏参与者头像组：最多显示 4 位，溢出折叠 +N；随时拉同事加入协作 ──────
function ParticipantsStack() {
  const { participants, invited, language } = useEngine()
  const zh = language === 'zh'
  const [open, setOpen] = useState(false)
  const all = [...participants.map((p) => p.person), ...invited.map((i) => i.person)]
  const shown = all.slice(0, 3)
  const extra = all.length - shown.length
  return (
    <div className="participants-tool">
      <div className="avatar-stack">
        {shown.map((p) => (
          <span key={p.name} className={`avatar r-${p.role}`} title={`${p.name} · ${p.roleLabel}${p.guest ? (zh ? '（协作者）' : ' (collaborator)') : ''}`}>{p.initials}</span>
        ))}
        {extra > 0 ? <span className="avatar more">+{extra}</span> : null}
      </div>
      <button className="invite-btn" title={zh ? '拉同事加入协作' : 'Invite a colleague'} onClick={() => setOpen((o) => !o)}>
        <Plus size={14} />
      </button>
      <span className="participants-count" title={zh ? `共 ${all.length} 位参与者` : `${all.length} participants`}>
        <Users size={15} /> {all.length}
      </span>
      {open ? (
        <div className="invite-pop" onMouseLeave={() => setOpen(false)}>
          <div className="invite-pop-head">
            {zh ? '拉同事加入协作' : 'Invite to collaborate'}
            <span>{zh ? '可参与讨论 · 不占审批角色' : 'Can join discussion · no approval role'}</span>
          </div>
          {INVITABLE.map((c) => {
            const joined = invited.some((i) => i.person.name === c.person.name)
            return (
              <button key={c.person.name} disabled={joined} onClick={() => { store.invitePerson(c.person.name); setOpen(false) }}>
                <span className={`avatar r-${c.person.role} guest`}>{c.person.initials}</span>
                <span className="invite-name">
                  {c.person.name} · {c.person.roleLabel}
                  <small>{c.note}</small>
                </span>
                {joined ? <small className="joined">{zh ? '已加入' : 'Joined'}</small> : <Plus size={12} />}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

// ── 顶栏 ⋯ 菜单：低频取证与演示工具收纳于此 ─────────────────────────────
function HeaderMoreMenu({ zh }: { zh: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="header-more">
      <IconButton icon={MoreHorizontal} label={zh ? '更多操作' : 'More actions'} onClick={() => setOpen((o) => !o)} />
      {open ? (
        <div className="header-menu" onMouseLeave={() => setOpen(false)}>
          <button onClick={() => { store.openDrawer({ type: 'history' }); setOpen(false) }}>
            <History size={14} /> {zh ? '历史' : 'History'}
          </button>
          <button onClick={() => { store.openDrawer({ type: 'source', payload: { title: 'Source Evidence', body: 'Client email from Mr. Chan and linked case evidence.', meta: 'Source review' } }); setOpen(false) }}>
            <FileText size={14} /> {zh ? '来源' : 'Sources'}
          </button>
          <hr />
          <button onClick={() => { startDemo(); setOpen(false) }}>
            <PlayCircle size={14} /> {zh ? '自动演示' : 'Auto demo'}
          </button>
          <button onClick={() => { store.reset(); setOpen(false) }}>
            <RotateCcw size={14} /> {zh ? '重置演示' : 'Reset demo'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

// ── Bottom-left user / demo-role menu ────────────────────────────────────
const ROLE_TAG: Record<RoleKey, { en: string; zh: string }> = {
  rm: { en: 'RM', zh: '客户经理' },
  ps: { en: 'Product', zh: '产品专家' },
  dealer: { en: 'Dealer', zh: '交易员' },
  ops: { en: 'Trade Support', zh: 'Trade Support' },
}

// compact = 折叠态的左侧栏：只剩一颗圆头像，菜单从右边弹出。
// 之前折叠态是另写的一颗按钮，没挂任何 onClick——看着能点，点了没反应。
// 现在两个形态共用同一个菜单，行为不会再分叉。
function UserMenu({ compact = false }: { compact?: boolean }) {
  const { role, archivedCaseIds, language } = useEngine()
  const [open, setOpen] = useState(false)
  const me = PEOPLE[role]
  return (
    <div className={`user-area${compact ? ' compact' : ''}`}>
      {open && <div className="menu-mask" onClick={() => setOpen(false)} />}
      {open && (
        <div className="role-menu">
          <div className="personal-menu-head">
            <span className={`avatar sm r-${role}`}>{me.initials}</span>
            <span><strong>{me.name} · {ROLE_TAG[role][language]}</strong><small>{language === 'zh' ? '个人中心' : 'Personal center'}</small></span>
          </div>
          <button className="personal-archive-entry" onClick={() => { store.openDrawer({ type: 'archive' }); setOpen(false) }}>
            <span className="personal-entry-icon"><Archive size={15} /></span>
            <span><strong>{language === 'zh' ? '已归档案例' : 'Archived Cases'}</strong><small>{language === 'zh' ? '查看和管理已完成案例' : 'View and manage completed cases'}</small></span>
            <b>{archivedCaseIds.length}</b>
            <ChevronRight size={14} />
          </button>
          {/* 语言切换暂时收起：界面已统一为中文，英文侧只覆盖了一部分，
              放出来会出现半中半英，看着像 bug。setLanguage 与既有的
              zh ? ... : ... 分支都保留着，补齐英文后把这块放回来即可。 */}
          <div className="rm-divider" />
          <AiModePanel />
          <div className="rm-divider" />
          <div className="rm-head">{language === 'zh' ? '演示视图 · 切换角色' : 'Demo view · switch role'}</div>
          {(['rm', 'ps', 'dealer', 'ops'] as RoleKey[]).map((r) => (
            <button
              key={r}
              className={`rm-item${role === r ? ' active' : ''}`}
              onClick={() => {
                store.setRole(r)
                setOpen(false)
              }}
            >
              <span className={`avatar sm r-${r}`}>{PEOPLE[r].initials}</span>
              <span className="rm-name">
                {PEOPLE[r].name}
                <span className="rm-role">{PEOPLE[r].roleLabel}</span>
              </span>
              {role === r && <span className="rm-check">✓</span>}
            </button>
          ))}
        </div>
      )}
      <button
        className={`user-chip${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title={compact ? `${me.name} · ${ROLE_TAG[role][language]}` : undefined}
        aria-label={compact ? `${me.name} · ${language === 'zh' ? '个人中心' : 'Personal center'}` : undefined}
        aria-expanded={open}
      >
        <span className={`avatar sm r-${role}`}>{me.initials}</span>
        {compact ? null : (
          <>
            <span className="uc-name">
              {me.name} · {ROLE_TAG[role][language]}
              <span className="uc-sub">{me.roleLabel}</span>
            </span>
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </>
        )}
      </button>
    </div>
  )
}

// ── Left navigation ──────────────────────────────────────────────────────
type NavCase = {
  caseId: string
  name: string
  attention: 'excl' | 'warning' | 'dot' | 'live' | null
  ownerRole: RoleKey | null
  stageLabel: string
  statusLabel: string
  clientId: string
  clientName: string
  clientMeta: string
}
type NavMode = 'client' | 'work'

// 客户文件夹直接读 crm 客户库，不再维护第二份名单
const CASE_CLIENT: Record<string, string> = {
  'SP-001': ACTIVE_CLIENT_ID,
  'SP-002': 'lau-hk-0207',
  'SP-003': ACTIVE_CLIENT_ID,
  'SP-004': 'ng-hk-0450',
  'SP-005': 'wong-hk-0311',
}

function withClient(item: Omit<NavCase, 'clientId' | 'clientName' | 'clientMeta'>): NavCase {
  const clientId = CASE_CLIENT[item.caseId] ?? ACTIVE_CLIENT_ID
  const c = CLIENTS[clientId] ?? CLIENTS[ACTIVE_CLIENT_ID]
  return {
    ...item,
    clientId,
    clientName: c.name,
    clientMeta: `${c.classification} · ${c.riskGrade} · RM ${c.rmName}`,
  }
}

function roleSortScore(role: RoleKey, item: NavCase) {
  const text = `${item.stageLabel} ${item.statusLabel}`
  const owner = item.ownerRole === role ? 40 : 0
  const exception = item.attention === 'excl' || text.includes('异常') ? 28 : 0
  const warning = item.attention === 'warning' ? 18 : 0
  if (role === 'rm') {
    return owner
      + (text.includes('客户') || text.includes('等待客户') ? 35 : 0)
      + (text.includes('确认') || text.includes('回复') ? 24 : 0)
      + warning
      + (item.clientId === 'mr-chan' ? 4 : 0)
  }
  if (role === 'ps') {
    return owner
      + (text.includes('结构') || text.includes('产品') ? 35 : 0)
      + (text.includes('审批') || text.includes('修改') ? 24 : 0)
      + exception
  }
  if (role === 'dealer') {
    return owner
      + warning
      + (text.includes('报价') || text.includes('定价') ? 36 : 0)
      + (text.includes('执行') || text.includes('重报') ? 30 : 0)
  }
  return owner
    + exception
    + (text.includes('条款') || text.includes('核对') ? 36 : 0)
    + (text.includes('已执行') || text.includes('完成') ? 22 : 0)
}

function makeRoleSortedWork(role: RoleKey, cases: NavCase[], zh: boolean) {
  const config = role === 'rm'
    ? { title: zh ? '按客户紧急度排序' : 'Sorted by client urgency', icon: Mail }
    : role === 'ps'
      ? { title: zh ? '按产品决策阻塞排序' : 'Sorted by product decision blockers', icon: Route }
      : role === 'dealer'
        ? { title: zh ? '按当日决策紧迫度排序' : 'Sorted by same-day urgency', icon: Clock3 }
        : { title: zh ? '按成交后风险排序' : 'Sorted by post-trade risk', icon: CircleAlert }
  return {
    ...config,
    cases: [...cases].sort((a, b) => {
      const scoreDiff = roleSortScore(role, b) - roleSortScore(role, a)
      return scoreDiff || a.caseId.localeCompare(b.caseId)
    }),
  }
}

function CaseNavRow({ item, active, pinned, language }: { item: NavCase; active: boolean; pinned: boolean; language: 'en' | 'zh' }) {
  return (
    <div className={`case-nav-item${active ? ' active' : ''}${pinned ? ' pinned' : ''}`}>
      <button className="case-row" onClick={() => store.openCase(item.caseId)}>
        <span className="cid">{item.caseId}</span>
        <span className="cname">{item.name}</span>
        <span className="ind">
          {item.attention === 'excl' ? <span className="excl">!</span> : item.attention === 'warning' ? (
            <span className="dot-warn" />
          ) : item.attention === 'dot' ? (
            <span className="dot-live muted" />
          ) : item.attention === 'live' ? <span className="dot-live" /> : null}
        </span>
      </button>
      <button
        className="case-row-action pin-action"
        title={language === 'zh' ? `${pinned ? '取消置顶' : '置顶'} ${item.name}` : `${pinned ? 'Unpin' : 'Pin'} ${item.name}`}
        aria-label={language === 'zh' ? `${pinned ? '取消置顶' : '置顶'} ${item.name}` : `${pinned ? 'Unpin' : 'Pin'} ${item.name}`}
        aria-pressed={pinned}
        onClick={() => store.toggleCasePinned(item.caseId)}
      >
        <Pin size={13} fill={pinned ? 'currentColor' : 'none'} />
      </button>
      <button
        className="case-row-action archive-action"
        title={language === 'zh' ? `归档 ${item.name}` : `Archive ${item.name}`}
        aria-label={language === 'zh' ? `归档 ${item.name}` : `Archive ${item.name}`}
        onClick={() => store.archiveCase(item.caseId)}
      >
        <Archive size={13} />
      </button>
    </div>
  )
}

export function LeftNav({ collapsed = false, onToggleCollapse }: { collapsed?: boolean; onToggleCollapse?: () => void }) {
  const { view, activeCaseId, truth, role, participants, notifications, pinnedCaseIds, archivedCaseIds, language } = useEngine()
  const [expandedClientIds, setExpandedClientIds] = useState<Set<string>>(() => new Set(['mr-chan']))
  const [navMode, setNavMode] = useState<NavMode>(role === 'rm' ? 'client' : 'work')
  useEffect(() => {
    setNavMode(role === 'rm' ? 'client' : 'work')
  }, [role])
  const zh = language === 'zh'
  const joined = participants.some((p) => p.person.role === role)
  const hasUnread = notifications.some((n) => n.role === role && n.caseId === 'SP-001' && !n.read)
  const sp1Attention =
    truth.statusTone === 'critical' ? 'excl' : hasUnread || truth.currentOwner?.role === role ? 'live' : null
  const activeCases: NavCase[] = [
    ...(joined ? [withClient({
      caseId: 'SP-001',
      name: truth.caseName,
      attention: sp1Attention as NavCase['attention'],
      ownerRole: truth.currentOwner?.role ?? null,
      stageLabel: truth.statusLabel,
      statusLabel: truth.statusLabel,
    })] : []),
    ...OTHER_CASES.map((c) => ({
      caseId: c.caseId,
      name: c.name,
      attention: c.attention === 'exception' ? 'excl' as const : c.attention,
      ownerRole: c.ownerRole,
      stageLabel: c.stageLabel,
      statusLabel: c.statusLabel,
    })).map(withClient),
  ]
    .filter((c) => !archivedCaseIds.includes(c.caseId))
  const pinnedCases = activeCases.filter((c) => pinnedCaseIds.includes(c.caseId))
  const ongoingCases = activeCases.filter((c) => !pinnedCaseIds.includes(c.caseId))
  const clientGroups = ongoingCases.reduce<NavCase[][]>((groups, item) => {
    const existing = groups.find((group) => group[0]?.clientId === item.clientId)
    if (existing) existing.push(item)
    else groups.push([item])
    return groups
  }, [])
  const toggleClient = (clientId: string) => {
    setExpandedClientIds((prev) => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }
  const roleSortedWork = makeRoleSortedWork(role, ongoingCases, zh)
  const RoleSortIcon = roleSortedWork.icon
  if (collapsed) {
    return (
      <nav className="nav nav-collapsed-rail">
        <button
          className="nav-rail-btn"
          title={zh ? '展开侧边栏' : 'Expand sidebar'}
          aria-label={zh ? '展开侧边栏' : 'Expand sidebar'}
          onClick={onToggleCollapse}
        >
          <PanelLeftOpen size={18} />
        </button>
        <button
          className={`nav-rail-btn ${view === 'assistant' ? 'active' : ''}`}
          title={zh ? '我的助手' : 'My Assistant'}
          aria-label={zh ? '我的助手' : 'My Assistant'}
          onClick={() => store.setView('assistant')}
        >
          <WandSparkles size={18} />
        </button>
        {joined && (
          <button
            className={`nav-rail-case ${view === 'room' && activeCaseId === 'SP-001' ? 'active' : ''}`}
            title={`SP-001 · ${truth.caseName}`}
            aria-label="SP-001 · Tencent FCN"
            onClick={() => store.openCase('SP-001')}
          >
            <span>SP</span>
            {sp1Attention && <b />}
          </button>
        )}
        <button
          className="nav-rail-btn"
          title={zh ? '搜索案例' : 'Search cases'}
          aria-label={zh ? '搜索案例' : 'Search cases'}
        >
          <Search size={18} />
        </button>
        <div className="nav-rail-spacer" />
        <UserMenu compact />
      </nav>
    )
  }
  return (
    <nav className="nav">
      <div className="nav-top-row">
        <div className="nav-search-wrap">
          <Search size={15} />
          <input aria-label={language === 'zh' ? '搜索案例' : 'Search cases'} placeholder={language === 'zh' ? '搜索案例' : 'Search cases'} />
          <span className="shortcut"><Command size={11} />K</span>
        </div>
        <button
          className="nav-collapse-btn"
          title={language === 'zh' ? '折叠侧边栏' : 'Collapse sidebar'}
          aria-label={language === 'zh' ? '折叠侧边栏' : 'Collapse sidebar'}
          onClick={onToggleCollapse}
        >
          <PanelLeftClose size={16} />
        </button>
      </div>
      <div>
        <button className={`nav-item ${view === 'assistant' ? 'active' : ''}`} onClick={() => store.setView('assistant')}>
          <WandSparkles size={16} /> {language === 'zh' ? '我的助手' : 'My Assistant'}
        </button>
      </div>
      {pinnedCases.length > 0 && (
        <div className="case-group pinned-case-group">
          <div className="group-label cases-label">
            <span className="group-label-with-icon"><Pin size={11} fill="currentColor" />{language === 'zh' ? '置顶案例' : 'Pinned cases'} <b>{pinnedCases.length}</b></span>
          </div>
          {pinnedCases.map((c) => (
            <CaseNavRow
              key={c.caseId}
              item={c}
              active={view === 'room' && activeCaseId === c.caseId}
              pinned
              language={language}
            />
          ))}
        </div>
      )}
      <div className="case-group ongoing-case-group">
        <div className="group-label cases-label">
          <span>{navMode === 'client' ? language === 'zh' ? '客户文件夹' : 'Client folders' : language === 'zh' ? '角色默认排序' : 'Role sort'} <b>{ongoingCases.length}</b></span>
          <IconButton icon={Plus} label={language === 'zh' ? '添加案例' : 'Add case'} />
        </div>
        <div className="nav-mode-switch" role="group" aria-label={language === 'zh' ? '切换案例组织方式' : 'Switch case organization'}>
          <button className={navMode === 'work' ? 'active' : ''} onClick={() => setNavMode('work')}>
            {language === 'zh' ? '角色排序' : 'Role sort'}
          </button>
          <button className={navMode === 'client' ? 'active' : ''} onClick={() => setNavMode('client')}>
            {language === 'zh' ? '客户文件夹' : 'Client folders'}
          </button>
        </div>
        {navMode === 'client' ? (
          <div className="client-folder-list">
            {clientGroups.map((group) => {
              const folder = group[0]
              const open = expandedClientIds.has(folder.clientId) || group.some((c) => c.caseId === activeCaseId)
              return (
                <div className={`client-folder${open ? ' open' : ''}`} key={folder.clientId}>
                  <button className="client-folder-head" onClick={() => toggleClient(folder.clientId)}>
                    {open ? <FolderOpen size={15} /> : <Folder size={15} />}
                    <span className="client-folder-name">
                      <strong>{folder.clientName}</strong>
                      <small>{folder.clientMeta}</small>
                    </span>
                    <b>{group.length}</b>
                    {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                  {open && (
                    <div className="client-folder-cases">
                      {group.map((c) => (
                        <CaseNavRow
                          key={c.caseId}
                          item={c}
                          active={view === 'room' && activeCaseId === c.caseId}
                          pinned={false}
                          language={language}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="work-queue-list">
            <div className="work-queue role-sort-queue">
              <div className="work-queue-head">
                <RoleSortIcon size={14} />
                {/* 排序规则的那句说明和这里的计数都去掉了：上面「角色默认排序 N」
                    已经报过同一个数，说明文字也只是把标题又讲了一遍。 */}
                <span><strong>{roleSortedWork.title}</strong></span>
              </div>
              <div className="role-sort-cases">
                {roleSortedWork.cases.map((c, index) => (
                  <div className="role-sort-case" key={c.caseId}>
                    <span className="sort-rank">{index + 1}</span>
                    <CaseNavRow
                      item={c}
                      active={view === 'room' && activeCaseId === c.caseId}
                      pinned={false}
                      language={language}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="nav-spacer" />
      <UserMenu />
    </nav>
  )
}

// ── Case details panel (Current Truth) ───────────────────────────────────

/**
 * Collapsible panel section. Header always carries a one-line summary so the
 * collapsed state still answers the question; `revision` change clears any
 * manual toggle (e.g. a new alert re-opens the Alerts section).
 */
function Section({
  label,
  summary,
  defaultOpen = false,
  revision = '',
  tone,
  children,
}: {
  label: string
  summary?: React.ReactNode
  defaultOpen?: boolean
  revision?: string
  tone?: 'warning' | 'critical'
  children: React.ReactNode
}) {
  const [override, setOverride] = useState<boolean | null>(null)
  const [prevRev, setPrevRev] = useState(revision)
  if (prevRev !== revision) {
    setPrevRev(revision)
    setOverride(null)
  }
  const open = override ?? defaultOpen
  return (
    <div className={`dsec${open ? ' open' : ''}`}>
      <button className="dsec-head" onClick={() => setOverride(!open)}>
        <span className={`dsec-label${tone ? ` ${tone}` : ''}`}>{label}</span>
        {!open && summary ? <span className="dsec-summary">{summary}</span> : <span className="dsec-summary" />}
        <span className={`chev${open ? ' up' : ''}`}>⌄</span>
      </button>
      {open ? <div className="dsec-body">{children}</div> : null}
    </div>
  )
}

function NeedReviewDetails() {
  const { language, truth, participants, needSettled } = useEngine()
  const zh = language === 'zh'
  const joint = truth.status === 'CLIENT_NEED_JOINT_REVIEW'
  const specialistJoined = participants.some((p) => p.person.role === 'ps' && !p.person.guest)
  return (
    <aside className="details need-review-details">
      <div className="details-bar"><span className="db-label">{zh ? '案例详情' : 'Case Details'}</span><button className="rail-toggle" onClick={() => store.toggleDetails()} title={zh ? '折叠面板' : 'Collapse panel'}>⟩</button></div>
      <div className="review-next-action">
        <div className="dlabel">{zh ? '下一步操作' : 'Next Action'}</div>
        <div className="review-next-main">
          <span className="review-owner-icon">AL</span>
          <strong>
            {joint
              ? needSettled
                ? zh ? <>与产品专家共同<br />确认客户需求</> : <>Confirm the client need<br />jointly with the specialist</>
                : zh ? <>与产品专家一起<br />同客户界定标的与方向</> : <>Settle underlying and direction<br />with the client, together</>
              : zh ? <>核对 AI 提取结果<br />并请产品专家加入</> : <>Verify AI extraction<br />and invite the product specialist</>}
          </strong>
        </div>
        <div className="review-next-due"><span>{zh ? '截止' : 'Due'}</span><strong>{zh ? '今天' : 'Today'}</strong></div>
        <Tag tone="warning">● &nbsp;{zh ? '高优先级' : 'High Priority'}</Tag>
      </div>
      <div className="review-detail-rows">
        <div><span>{zh ? '负责人' : 'Owner'}</span><strong><span className="avatar sm r-rm">AL</span>Alice · RM</strong></div>
        <div><span>{zh ? '等待事项' : 'Waiting On'}</span><strong>{joint ? zh ? '客户回复方向' : 'Client direction' : zh ? '产品专家加入' : 'Product specialist'}</strong></div>
        <div><span>{zh ? '状态' : 'Status'}</span><Tag tone="primary">{truth.statusLabel}</Tag></div>
      </div>
      <Section label={zh ? '来源证据' : 'Source Evidence'} summary={needSettled ? '2' : '1'}>
        <button className="source-evidence-link" onClick={() => store.openDrawer({ type: 'source', payload: { title: 'Email from Mr. Chan', body: 'Client need email received at 14:02 — return range, horizon and sector theme only; no underlying named.', meta: 'Source ID: email-20250516-1402' } })}>
          <Mail size={14} />{zh ? 'Mr. Chan 的邮件' : 'Email from Mr. Chan'} <span>14:02</span>
        </button>
        {needSettled ? (
          <button className="source-evidence-link" onClick={() => store.openDrawer({ type: 'source', payload: { title: 'Joint need discovery', body: '客户回复：就做腾讯单一标的这个方向，集中度我能接受，但要有下行缓冲。资金 6 个月不用，可以持有到期，中间不需要流动性。', meta: 'Alice · RM + David · 产品专家 · 14:06–14:10' } })}>
            <Mail size={14} />{zh ? '需求共创 · 客户回复' : 'Joint discovery · client reply'} <span>14:10</span>
          </button>
        ) : null}
      </Section>
      <Section label={zh ? '参与者' : 'Participants'} summary={specialistJoined ? '2' : '1'} defaultOpen>
        <div className="review-participants">
          <span className="avatar sm r-rm">AL</span>
          {specialistJoined ? <span className="avatar sm r-ps">DV</span> : null}
          <button>+ {zh ? '添加' : 'Add'}</button>
        </div>
      </Section>
      <Section label={zh ? '结构化历史' : 'Structured History'} summary={needSettled ? '3' : specialistJoined ? '2' : '1'}>
        <div className="change-row"><div className="ct">{zh ? '已收到客户邮件' : 'Client email received'}</div><div className="cm">14:02 · Alice</div></div>
        {specialistJoined ? <div className="change-row"><div className="ct">{zh ? '产品专家加入需求共创' : 'Specialist joined need discovery'}</div><div className="cm">14:05 · Alice</div></div> : null}
        {needSettled ? <div className="change-row"><div className="ct">{zh ? '标的与流动性由共创确定' : 'Underlying and liquidity settled'}</div><div className="cm">14:10 · Alice + David</div></div> : null}
      </Section>
    </aside>
  )
}

type DetailConfig = {
  kicker: string
  action: string
  due: string
  priority: string
  tone: 'primary' | 'warning' | 'critical' | 'success'
  factsTitle: string
  facts: [string, string][]
}

function detailConfig(status: string, fallbackAction: string): DetailConfig {
  switch (status) {
    case 'CLIENT_NEED_JOINT_REVIEW': return { kicker: 'Joint need discovery', action: 'Alice and David settle underlying and direction with the client', due: 'Now', priority: 'In progress', tone: 'primary', factsTitle: 'Need Discovery', facts: [['From email', '5 fields · no underlying'], ['Open', 'Underlying · liquidity'], ['Working on it', 'Alice + David']] }
    case 'CLIENT_NEED_APPROVED': return { kicker: 'Structure detailing', action: 'AI detail the agreed direction into comparable structures', due: 'Now', priority: 'In progress', tone: 'primary', factsTitle: 'Approved Need', facts: [['Evidence', '5 from email · 2 jointly defined'], ['Risk profile', 'Moderate · Bullish'], ['Owner', 'Alice → David (already on case)']] }
    case 'STRUCTURE_REVIEW':
    case 'STRUCTURE_MODIFICATION_REQUIRED': return { kicker: 'Product decision', action: status === 'STRUCTURE_REVIEW' ? 'David review and approve structure' : 'David revise structure using market feedback', due: 'Today', priority: status === 'STRUCTURE_REVIEW' ? 'Review required' : 'Returned', tone: 'warning', factsTitle: 'Structure Review', facts: [['Candidates', '3 comparable options'], ['Selected', 'Option B · Balanced'], ['Client fit', 'Moderate risk · >10% target']] }
    case 'STRUCTURE_APPROVED': return { kicker: 'RFQ preparation', action: 'AI prepare dealer-ready RFQ package', due: 'Now', priority: 'In progress', tone: 'primary', factsTitle: 'Approved Structure', facts: [['Product', 'Tencent FCN · 6M'], ['Terms', 'Strike 80% · KI 70%'], ['Next owner', 'Ken · Dealer']] }
    case 'RFQ_READY': return { kicker: 'Dealer review', action: 'Ken review RFQ and accept pricing request', due: 'Today', priority: 'Review required', tone: 'warning', factsTitle: 'RFQ Readiness', facts: [['Critical terms', 'Complete'], ['Structure match', 'Verified'], ['Issuer coverage', '5 selected']] }
    case 'PRICING_IN_PROGRESS': return { kicker: 'Market pricing', action: 'Ken review quote paths and select next action', due: 'Before quotes expire', priority: 'Time sensitive', tone: 'primary', factsTitle: 'Market Snapshot', facts: [['Responses', '4 of 5 issuers'], ['Comparable', '3 quotes'], ['Different terms', '1 quote isolated']] }
    case 'REQUOTE_REQUIRED': return { kicker: 'Market refresh', action: 'Wait for refreshed issuer quotes', due: 'Now', priority: 'Quotes stale', tone: 'warning', factsTitle: 'Requote Status', facts: [['Prior matrix', 'Marked stale'], ['Issuer request', '5 issuers'], ['Next step', 'Normalize new responses']] }
    case 'CLIENT_QUOTE_READY': return { kicker: 'Client communication', action: 'Alice review client quote and send to Mr. Chan', due: 'Before quote expiry', priority: 'RM review required', tone: 'primary', factsTitle: 'Selected Quote', facts: [['Issuer', 'Morgan Stanley'], ['Indicative coupon', '10.62% p.a.'], ['Execution condition', 'Live recheck required']] }
    case 'WAITING_FOR_CLIENT': return { kicker: 'Client response', action: 'Monitor for reply or formal client instruction', due: 'Awaiting client', priority: 'Monitoring', tone: 'primary', factsTitle: 'Communication Status', facts: [['Message', 'Sent by Alice · 14:27'], ['Channel', 'Selected client email'], ['Instruction monitor', 'Active']] }
    case 'CLIENT_RESPONSE_RECEIVED': return { kicker: 'AI instruction detection', action: 'Link client reply to quoted terms and evidence', due: 'Now', priority: 'Processing', tone: 'primary', factsTitle: 'Source Review', facts: [['Reply', 'Received · 14:36'], ['Evidence', 'Source preserved'], ['RM approval', 'Required before execution']] }
    case 'CLIENT_INSTRUCTION_PENDING_CONFIRMATION': return { kicker: 'Instruction review', action: 'Alice confirm or reject detected instruction', due: 'Today', priority: 'Formal review', tone: 'warning', factsTitle: 'Instruction Assessment', facts: [['Confidence', 'High · 92%'], ['Evidence', 'Linked to source reply'], ['Quote check', 'Required before execution']] }
    case 'CLIENT_INSTRUCTION_CONFIRMED': return { kicker: 'Pre-execution control', action: 'AI check quote freshness before ticket creation', due: 'Now', priority: 'In progress', tone: 'primary', factsTitle: 'Confirmed Instruction', facts: [['Actor', 'Alice · RM'], ['Issuer', 'Morgan Stanley'], ['Notional', 'USD 1,000,000']] }
    case 'LIVE_REQUOTE_REQUIRED': return { kicker: 'Execution blocked', action: 'Ken request a live executable quote from MS', due: 'Immediately', priority: 'Critical control', tone: 'critical', factsTitle: 'Block Reason', facts: [['Selected quote', 'Expired'], ['Client instruction', 'Still confirmed'], ['Required action', 'Live requote']] }
    case 'EXECUTION_READY': return { kicker: 'Formal execution', action: 'Ken review final ticket and confirm execution', due: 'Before live quote expiry', priority: 'Time sensitive', tone: 'warning', factsTitle: 'Execution Readiness', facts: [['Live quote', 'Morgan Stanley · valid'], ['Pre-trade checks', '4 of 4 passed'], ['Formal actor', 'Ken · Dealer']] }
    case 'EXECUTED': return { kicker: 'Post-trade control', action: 'Wait for issuer fill confirmation', due: 'On receipt', priority: 'Monitoring', tone: 'success', factsTitle: 'Order Placed', facts: [['Channel', 'OTC instruction · not via API'], ['Client coupon', 'Locked at client confirmation'], ['Waiting on', 'Issuer fill report']] }
    case 'BOOKING_REVIEW': return { kicker: 'Booking entry', action: 'Trade Support books from the trade record', due: 'Now', priority: 'Review required', tone: 'warning', factsTitle: 'Trade Record', facts: [['Source', 'Generated from confirmed instruction + fill'], ['Replaces', "Trader's manual Excel log"], ['Next', 'Three-way check on term sheet']] }
    case 'TERMSHEET_REVIEW':
    case 'EXCEPTION': return { kicker: 'AI exception assessment', action: status === 'EXCEPTION' ? 'Resolve routed documentation exception' : 'Approve AI classification and request correction', due: 'Before client release', priority: 'Review required', tone: status === 'EXCEPTION' ? 'critical' : 'warning', factsTitle: 'Exception Routing', facts: [['Classification', 'Documentation Error'], ['Client impact', 'None if corrected'], ['Reconfirmation', 'No']] }
    case 'COMPLETED': return { kicker: 'Case complete', action: 'No further action required', due: 'Completed · 15:00', priority: 'Closed', tone: 'success', factsTitle: 'Completion', facts: [['Execution', 'Recorded'], ['Term sheet', 'Approved'], ['Audit trail', 'Available in History']] }
    default: return { kicker: 'Next action', action: fallbackAction, due: 'Today', priority: 'Active', tone: 'primary', factsTitle: 'Case Context', facts: [['State', status], ['Source of truth', 'Structured case state']] }
  }
}

const DETAIL_ZH: Record<string, string> = {
  'Joint need discovery': '需求共创', 'Structure detailing': '结构细化', 'Product decision': '产品决策', 'RFQ preparation': '询价准备',
  'Dealer review': '交易员审核', 'Market pricing': '市场定价', 'Market refresh': '刷新市场报价',
  'Client communication': '客户沟通', 'Client response': '客户回复', 'AI instruction detection': 'AI 指令识别',
  'Instruction review': '客户指令审核', 'Pre-execution control': '执行前控制', 'Execution blocked': '执行受阻',
  'Formal execution': '正式执行', 'Post-trade control': '交易后控制', 'AI exception assessment': 'AI 异常评估',
  'Case complete': '案例已完成', 'Next action': '下一步操作',
  'Now': '现在', 'Today': '今天', 'Immediately': '立即', 'Before quotes expire': '报价到期前',
  'Before quote expiry': '报价到期前', 'Awaiting client': '等待客户', 'Before live quote expiry': '实时报价到期前',
  'On receipt': '收到后', 'Before client release': '发送客户前', 'Completed · 15:00': '已完成 · 15:00',
  'In progress': '进行中', 'Review required': '需要审核', 'Returned': '已退回', 'Time sensitive': '时间敏感',
  'Quotes stale': '报价已失效', 'RM review required': '需要 RM 审核', 'Monitoring': '监控中', 'Processing': '处理中',
  'Formal review': '正式审核', 'Critical control': '关键控制', 'Closed': '已关闭', 'Active': '进行中',
  'Alice and David settle underlying and direction with the client': 'Alice 与 David 一起同客户确定标的与方向',
  'AI detail the agreed direction into comparable structures': 'AI 把共创确定的方向细化成可比结构方案',
  'Need Discovery': '需求共创', 'From email': '来自邮件', 'Open': '待确定', 'Working on it': '共同处理',
  'Owner': '负责人',
  '5 fields · no underlying': '5 个字段 · 标的未定', 'Underlying · liquidity': '标的 · 流动性偏好',
  'Alice + David': 'Alice + David',
  '5 from email · 2 jointly defined': '邮件 5 项 · 共创 2 项',
  'Alice → David (already on case)': 'Alice → David（已在场）',
  'AI prepare comparable structures for David': 'AI 为 David 准备可比结构方案',
  'David review and approve structure': 'David 审核并批准结构方案',
  'David revise structure using market feedback': 'David 根据市场反馈修改结构',
  'AI prepare dealer-ready RFQ package': 'AI 准备可供交易员审核的 RFQ 包',
  'Ken review RFQ and accept pricing request': 'Ken 审核 RFQ 并接受询价请求',
  'Ken review quote paths and select next action': 'Ken 审核报价并选择下一步操作',
  'Wait for refreshed issuer quotes': '等待发行商更新报价',
  'Alice review client quote and send to Mr. Chan': 'Alice 审核客户报价并发送给 Mr. Chan',
  'Monitor for reply or formal client instruction': '监控客户回复或正式指令',
  'Link client reply to quoted terms and evidence': '将客户回复与报价条款及证据关联',
  'Alice confirm or reject detected instruction': 'Alice 确认或驳回 AI 识别的客户指令',
  'AI check quote freshness before ticket creation': 'AI 在生成执行单前检查报价时效',
  'Ken request a live executable quote from MS': 'Ken 向 Morgan Stanley 请求可执行实时报价',
  'Ken review final ticket and confirm execution': 'Ken 审核最终执行单并确认执行',
  'Wait for issuer term sheet and run validation': '等待发行商条款书并执行校验',
  'Resolve routed documentation exception': '处理已分派的文件异常',
  'Approve AI classification and request correction': '批准 AI 分类并请求更正',
  'No further action required': '无需进一步操作',
  'Approved Need': '已批准需求', 'Structure Review': '结构审核', 'Approved Structure': '已批准结构',
  'RFQ Readiness': 'RFQ 就绪度', 'Market Snapshot': '市场快照', 'Requote Status': '重报价状态',
  'Selected Quote': '已选报价', 'Communication Status': '沟通状态', 'Source Review': '来源核对',
  'Instruction Assessment': '指令评估', 'Confirmed Instruction': '已确认指令', 'Block Reason': '阻断原因',
  'Execution Readiness': '执行就绪度', 'Execution Record': '执行记录', 'Exception Routing': '异常分派',
  'Completion': '完成情况', 'Case Context': '案例上下文',
  'Evidence': '证据', 'Risk profile': '风险画像', 'Handoff': '移交', 'Candidates': '候选方案',
  'Selected': '已选择', 'Client fit': '客户匹配度', 'Product': '产品', 'Terms': '条款', 'Next owner': '下一负责人',
  'Critical terms': '关键条款', 'Structure match': '结构一致性', 'Issuer coverage': '发行商覆盖',
  'Responses': '回复', 'Comparable': '可比报价', 'Different terms': '不同条款', 'Prior matrix': '上一版矩阵',
  'Issuer request': '发行商请求', 'Next step': '下一步', 'Issuer': '发行商', 'Indicative coupon': '指示票息',
  'Execution condition': '执行条件', 'Message': '消息', 'Channel': '渠道', 'Instruction monitor': '指令监控',
  'Reply': '回复', 'RM approval': 'RM 批准', 'Confidence': '置信度', 'Quote check': '报价检查',
  'Actor': '操作人', 'Notional': '名义本金', 'Selected quote': '已选报价', 'Client instruction': '客户指令',
  'Required action': '必要操作', 'Live quote': '实时报价', 'Pre-trade checks': '交易前检查',
  'Formal actor': '正式操作人', 'Status': '状态', 'Final coupon': '最终票息', 'Waiting on': '等待事项',
  'Classification': '分类', 'Client impact': '客户影响', 'Reconfirmation': '重新确认', 'Execution': '执行',
  'Term sheet': '条款书', 'Audit trail': '审计记录', 'State': '状态', 'Source of truth': '事实来源',
}

function localizeDetail(config: DetailConfig, zh: boolean): DetailConfig {
  if (!zh) return config
  const t = (value: string) => DETAIL_ZH[value] ?? value
  return { ...config, kicker: t(config.kicker), action: t(config.action), due: t(config.due), priority: t(config.priority), factsTitle: t(config.factsTitle), facts: config.facts.map(([label, value]) => [t(label), t(value)]) }
}

export function CaseDetailsPanel() {
  const { truth, participants, detailsCollapsed, language } = useEngine()
  const zh = language === 'zh'

  if (detailsCollapsed) {
    const critical = truth.alerts.some((a) => a.severity === 'critical')
    return (
      <aside className="details rail" onClick={() => store.toggleDetails()} title={zh ? '展开案例状态面板' : 'Expand case state panel'}>
        <span className="rail-icon">⟨</span>
        {truth.alerts.length > 0 && (
          <span className={`rail-badge ${critical ? 'critical' : 'warning'}`}>{truth.alerts.length}</span>
        )}
        <span className="rail-label">{zh ? '案例状态' : 'CASE STATE'}</span>
        <span className={`rail-dot ${truth.statusTone}`} title={truth.statusLabel} />
      </aside>
    )
  }

  if (truth.status === 'CLIENT_NEED_DRAFT' || truth.status === 'CLIENT_NEED_JOINT_REVIEW') return <NeedReviewDetails />

  const config = localizeDetail(detailConfig(truth.status, truth.nextAction), zh)
  const termsSummary = truth.approvedTerms
    ? `${truth.approvedTerms.find((t) => t.label === 'Strike')?.value ?? ''} / ${truth.approvedTerms.find((t) => t.label === 'KI')?.value ?? ''} · ${truth.approvedTerms.find((t) => t.label === 'Product')?.value?.split('·')[1]?.trim() ?? ''}`
    : '尚无 — 结构审批后显示'

  const alertIdsByStage: Record<string, string[]> = {
    need: ['al-underlying', 'al-missing'], structure: ['al-loop'], rfq: ['al-loop'], pricing: ['al-bnp'], client: [], execution: ['al-expired'], termsheet: ['al-ts', 'al-exc'], done: [],
  }
  const visibleAlerts = truth.alerts.filter((alert) => (alertIdsByStage[truth.stage] ?? []).includes(alert.id))

  return (
    <aside className="details stage-case-details">
      <div className="details-bar">
        <span className="db-label">{zh ? '案例详情' : 'Case Details'}</span>
        <button className="rail-toggle" onClick={() => store.toggleDetails()} title={zh ? '折叠面板' : 'Collapse panel'}>
          ⟩
        </button>
      </div>

      <div className={`stage-next-card ${config.tone}`}>
        <div className="stage-next-kicker">{config.kicker}</div>
        <div className="stage-next-action">
          <span className={`stage-owner-avatar r-${truth.currentOwner?.role ?? 'rm'}`}>{truth.currentOwner?.initials ?? <CheckCircle2 size={14} />}</span>
          <strong>{config.action}</strong>
        </div>
        <div className="stage-next-meta"><span><Clock3 size={12} />{config.due}</span><Tag tone={config.tone === 'critical' ? 'critical' : config.tone === 'warning' ? 'warning' : config.tone === 'success' ? 'success' : 'primary'}>{config.priority}</Tag></div>
      </div>

      <div className="stage-owner-status">
        <div><span>{zh ? '负责人' : 'Owner'}</span><strong>{truth.currentOwner ? <><span className={`avatar sm r-${truth.currentOwner.role}`}>{truth.currentOwner.initials}</span>{truth.currentOwner.name} · {truth.currentOwner.roleLabel}</> : zh ? '— 案例已完成' : '— Case complete'}</strong></div>
        <div><span>{zh ? '等待事项' : 'Waiting On'}</span><strong>{truth.waitingOn ?? '—'}</strong></div>
        <div><span>{zh ? '状态' : 'Status'}</span><strong><span className={`badge ${truth.statusTone}`}>{truth.statusLabel}</span><small>{truth.status}</small></strong></div>
      </div>

      {truth.stage === 'termsheet' ? (
        <div className="stage-ai-assessment">
          <div><Route size={15} /><span>{zh ? 'AI 评估' : 'AI Assessment'}</span><Tag tone="warning">{zh ? '中等' : 'Medium'}</Tag></div>
          <strong>{zh ? '文件错误' : 'Documentation Error'}</strong>
          <p>{zh ? '执行记录与客户指令一致，只有发行商文件中的结算条款不同。' : 'Execution and client instruction agree. The issuer document alone contains a different settlement term.'}</p>
          <div><span>{zh ? '负责人' : 'Owner'}</span><b>MS Documentation / Trade Support</b></div>
          <div><span>{zh ? '客户影响' : 'Client Impact'}</span><b>{zh ? '发送客户前更正则无影响' : 'None if corrected before release'}</b></div>
          <div className="recommended"><span>{zh ? '建议操作' : 'Recommended Action'}</span><b>{zh ? '请求更正条款书' : 'Request corrected term sheet'}</b></div>
        </div>
      ) : (
        <div className="stage-facts-card">
          <div className="stage-facts-title">{config.factsTitle}</div>
          {config.facts.map(([label, fact]) => <div key={label}><span>{label}</span><strong>{fact}</strong></div>)}
        </div>
      )}

      <div className="stage-control-note"><ShieldCheck size={14} /><span>{zh ? '正式操作须由指定负责人确认。' : 'Formal actions require the assigned owner’s confirmation.'}</span></div>

      {visibleAlerts.length > 0 && (
        <Section label={`${zh ? '当前风险提示' : 'Current Alerts'} (${visibleAlerts.length})`} tone={visibleAlerts.some((alert) => alert.severity === 'critical') ? 'critical' : 'warning'} summary={visibleAlerts[0].title} defaultOpen revision={visibleAlerts.map((alert) => alert.id).join(',')}>
          {visibleAlerts.map((alert) => <div key={alert.id} className={`stage-alert ${alert.severity}`}><CircleAlert size={14} /><div><strong>{alert.title}</strong><p>{alert.detail}</p><span>Owner · {alert.owner}</span></div></div>)}
        </Section>
      )}

      {truth.approvedTerms && (
        <Section label={zh ? '已批准条款' : 'Approved Terms'} summary={<span className="mono-sum">{termsSummary}</span>} revision={truth.approvedTerms.map((term) => term.value).join(',')}>
          <div className="terms-table">{truth.approvedTerms.map((term) => <span key={term.label} style={{ display: 'contents' }}><span className="tk">{term.label}</span><span className="tv">{term.value}</span></span>)}</div>
        </Section>
      )}

      {truth.recentChanges.length > 0 && (
        <Section label={`${zh ? '最近变更' : 'Recent Changes'} (${truth.recentChanges.length})`}>
          {truth.recentChanges.map((change) => <div key={change.id} className="change-row"><div className="ct">{change.text}</div><div className="cm">{change.meta}</div></div>)}
        </Section>
      )}

      <Section label={zh ? '参与者' : 'Participants'} summary={<span className="avatar-row">{participants.map((participant) => <span className={`avatar sm r-${participant.person.role}`} key={participant.person.role}>{participant.person.initials}</span>)}</span>}>
        <div className="pstack">{participants.map((participant) => <span className="pchip" key={participant.person.role}><span className={`avatar sm r-${participant.person.role}`}>{participant.person.initials}</span>{participant.person.name}<span className="pjoin-mini">{participant.joinedAt} {zh ? '加入' : 'joined'}</span></span>)}</div>
      </Section>

      <div className="dfoot">
        <button className="icon-btn" onClick={() => store.openDrawer({ type: 'history' })}>
          {zh ? '查看结构化历史' : 'View Structured History'}
        </button>
      </div>
    </aside>
  )
}
