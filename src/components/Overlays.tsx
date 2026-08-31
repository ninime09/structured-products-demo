import { useEffect, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Database,
  Download,
  FileSearch,
  GitCompareArrows,
  Languages,
  LockKeyhole,
  Mail,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { OTHER_CASES, PEOPLE } from '../data'
import { CaseDetailsPanel } from './Shell'
import { QuoteMatrixBody } from './StageWorkspaces'
import { SKILL_MANIFESTS } from '../config/fcn-pack/skills'
import { dataSourceInventory, inventorySummary, PLANE_LABEL, SYSTEMS } from '../config/fcn-pack/data-sources'
import type { DataSourceSystem, PlaneUsage } from '../config/fcn-pack/data-sources'
import { availablePlanes } from '../config/mock-data/planes'
import { store, useEngine } from '../hooks'
import type { RoleKey } from '../types'
import { IconButton, Tag } from './primitives'

/**
 * 数据源清单。
 *
 * 跑完整条流程之后，"真做这个产品要接哪些库"就有答案了——答案不在这一页里手写，
 * 而是从所有技能的 manifest reads 汇总出来的。改一处声明，这一页跟着变。
 */
function DataSourceInventory({ zh }: { zh: boolean }) {
  const items = dataSourceInventory()
  const sum = inventorySummary(items)
  const bySystem = SYSTEMS
    .map((sys) => ({ sys, planes: items.filter((i) => i.system === sys.key) }))
    .filter((g) => g.planes.length > 0)
  const external = bySystem.filter((g) => !g.sys.internal)
  const internal = bySystem.filter((g) => g.sys.internal)

  const group = (g: { sys: DataSourceSystem; planes: PlaneUsage[] }) => (
    <section className="dsi-system" key={g.sys.key}>
      <div className="dsi-system-head">
        <strong>{g.sys.name}</strong>
        <span>{g.sys.realWorld}</span>
      </div>
      {g.planes.map((p) => (
        <div className="dsi-plane" key={p.plane}>
          <code>{p.plane}</code>
          <span className="dsi-desc">{PLANE_LABEL[p.plane] ?? ''}</span>
          <span className="dsi-users" title={p.skills.join('、')}>{p.skills.length} 个环节依赖</span>
          <span className={`dsi-state${p.wired ? ' wired' : ''}`}>{p.wired ? '已接（假数据）' : '未接'}</span>
        </div>
      ))}
    </section>
  )

  return (
    <div className="dsi">
      <div className="dsi-intro">
        <span><Database size={19} /></span>
        <div>
          <strong>{zh ? '真做这个产品，要接哪些数据源' : 'Data sources a real build needs'}</strong>
          <p>{zh
            ? 'demo 用的是假数据库。但流程跑通之后，每个环节需要读什么已经明确——下面这份清单由各技能的数据面声明自动汇总，不是手写的。'
            : 'The demo runs on mock data. What each step needs is now explicit; this list is derived from the skill manifests.'}</p>
        </div>
      </div>
      <div className="dsi-stats">
        <div><b>{sum.externalSystems}</b><span>{zh ? '个外部系统待对接' : 'external systems'}</span></div>
        <div><b>{sum.externalPlanes}</b><span>{zh ? '个外部数据面' : 'external planes'}</span></div>
        <div><b>{sum.totalPlanes - sum.externalPlanes}</b><span>{zh ? '个本系统自产' : 'produced in-house'}</span></div>
        <div><b>{sum.wired}</b><span>{zh ? '个已接假数据' : 'wired to mock'}</span></div>
      </div>
      <div className="dsi-sec">{zh ? '需要对接的外部系统' : 'External systems to integrate'}</div>
      {external.map(group)}
      <div className="dsi-sec">{zh ? '本系统自己产出（不需要对接）' : 'Produced by this system'}</div>
      {internal.map(group)}
      <div className="dsi-note">
        {zh
          ? 'CRM 的客户档案与持仓被最多环节依赖——集中度、历史偏好、拒绝记录都从这里来，是真做时最该先接的两个面。'
          : 'CRM profile and holdings are the most depended-on planes.'}
      </div>
    </div>
  )
}

interface SkillDefinition {
  id: string
  name: string
  description: string
  example: string
  dataUsed: string
  icon: LucideIcon
}

const ROLE_LABEL: Record<RoleKey, string> = {
  rm: '客户经理',
  ps: '产品专家',
  dealer: '交易员',
  ops: 'Trade Support',
}

const ROLE_SKILLS: Record<RoleKey, SkillDefinition[]> = {
  rm: [
    { id: 'client-need-extraction', name: 'Client Need Extraction', description: 'Turn selected client emails into evidence-linked case briefs.', example: 'Create a case from Mr. Chan\'s email and extract the client need.', dataUsed: 'Selected email, client profile and accessible case state', icon: Mail },
    { id: 'client-follow-up', name: 'Client Follow-up Draft', description: 'Prepare context-aware follow-ups for RM review before sending.', example: 'Draft a follow-up for SP-002 based on the latest quote.', dataUsed: 'Case timeline, selected client correspondence and approved terms', icon: Sparkles },
    { id: 'case-prioritization', name: 'Case Prioritization', description: 'Rank active cases using deadlines, quote freshness and exceptions.', example: 'Which cases need my attention before noon?', dataUsed: 'Accessible case states, ownership and deadlines', icon: BriefcaseBusiness },
  ],
  ps: [
    { id: 'structure-comparator', name: 'Structure Comparator', description: 'Compare candidate structures against client needs and risk limits.', example: 'Compare three FCN structures for SP-001.', dataUsed: 'Approved client need, product catalogue and suitability policy', icon: GitCompareArrows },
    { id: 'suitability-review', name: 'Suitability Review', description: 'Surface suitability gaps before a structure enters RFQ.', example: 'Review SP-001 for suitability gaps.', dataUsed: 'Client profile, product terms and company policy', icon: ShieldCheck },
    { id: 'structure-stress-test', name: 'Structure Stress Test', description: 'Stress-test selected structures against market and suitability scenarios.', example: 'Stress test the selected Tencent FCN structure.', dataUsed: 'Approved terms, product limits and market scenarios', icon: FileSearch },
  ],
  dealer: [
    { id: 'rfq-packager', name: 'RFQ Packager', description: 'Prepare complete, issuer-ready RFQ packages from approved structures.', example: 'Prepare an RFQ package for SP-001.', dataUsed: 'Approved structure, issuer coverage and settlement standards', icon: BriefcaseBusiness },
    { id: 'quote-normalizer', name: 'Quote Normalizer', description: 'Normalize issuer responses and separate comparable market quotes.', example: 'Normalize today\'s responses for SP-001.', dataUsed: 'Issuer quotes, RFQ terms and market timestamps', icon: GitCompareArrows },
    { id: 'execution-precheck', name: 'Execution Pre-check', description: 'Run freshness and final pre-trade controls before execution.', example: 'Run final checks for the SP-001 execution ticket.', dataUsed: 'Live quote, client instruction and execution ticket', icon: ShieldCheck },
  ],
  ops: [
    { id: 'termsheet-validation', name: 'Term Sheet Validation', description: 'Compare final term sheets against executed tickets and classify mismatches.', example: 'Validate the latest issuer term sheet for SP-005.', dataUsed: 'Execution record, client instruction and issuer documents', icon: FileSearch },
    { id: 'booking-readiness', name: 'Booking Readiness Check', description: 'Check booking and settlement fields before completion.', example: 'Check whether SP-001 is ready for booking.', dataUsed: 'Execution ticket, final terms and operational rules', icon: ShieldCheck },
    { id: 'exception-routing', name: 'Exception Routing', description: 'Route documentation exceptions to issuer support and track resolution evidence.', example: 'Route the settlement mismatch to MS documentation.', dataUsed: 'Mismatch evidence, issuer contacts and case audit trail', icon: BriefcaseBusiness },
  ],
}

const COMPANY_SKILLS: SkillDefinition[] = [
  { id: 'document-translation', name: 'Document Translation', description: 'Translate business documents while preserving financial terminology.', example: 'Translate the issuer confirmation into Chinese.', dataUsed: 'Documents explicitly attached or selected by the employee', icon: Languages },
  { id: 'knowledge-search', name: 'Company Knowledge Search', description: 'Answer questions from approved product, policy and process sources.', example: 'Find the current FCN suitability policy.', dataUsed: 'Company-approved knowledge bases', icon: Search },
  { id: 'meeting-brief', name: 'Meeting Brief', description: 'Prepare a concise brief from accessible cases and calendar context.', example: 'Prepare my brief for tomorrow\'s client meeting.', dataUsed: 'Authorized calendar events and accessible case state', icon: CalendarDays },
]

const SKILL_ZH: Record<string, Partial<SkillDefinition>> = {
  'client-need-extraction': { name: '客户需求提取', description: '将选中的客户邮件转换为可核对、带来源证据的案例摘要。', example: '根据 Mr. Chan 的邮件创建案例并提取客户需求。', dataUsed: '选中的邮件、客户资料与可访问的案例状态' },
  'client-follow-up': { name: '客户跟进草稿', description: '结合案例上下文生成跟进内容，供 RM 审核后发送。', example: '根据最新报价为 SP-002 起草跟进邮件。', dataUsed: '案例时间线、选中的客户往来与已批准条款' },
  'case-prioritization': { name: '案例优先级排序', description: '根据截止时间、报价时效和异常对进行中案例排序。', example: '中午前有哪些案例需要我处理？', dataUsed: '可访问的案例状态、负责人和截止时间' },
  'structure-comparator': { name: '结构方案比较', description: '根据客户需求和风险限制比较候选结构。' },
  'suitability-review': { name: '适当性审核', description: '在结构进入 RFQ 前识别适当性缺口。' },
  'structure-stress-test': { name: '结构压力测试', description: '根据市场和适当性场景压力测试已选结构。' },
  'termsheet-validation': { name: '条款书校验', description: '分类条款书异常并分派给正确负责人。' },
  'rfq-packager': { name: 'RFQ 打包', description: '从已批准结构生成完整、可发送给发行商的 RFQ 包。' },
  'quote-normalizer': { name: '报价标准化', description: '标准化发行商回复并区分可比市场报价。' },
  'execution-precheck': { name: '执行前检查', description: '执行前检查报价时效与最终交易控制项。' },
  'booking-readiness': { name: '入账准备检查', description: '完成前检查入账、结算和操作字段。' },
  'exception-routing': { name: '异常路由', description: '将文档异常分派给发行商支持并跟踪解决证据。' },
  'document-translation': { name: '文档翻译', description: '在保留金融术语的前提下翻译业务文档。' },
  'knowledge-search': { name: '公司知识搜索', description: '从已批准的产品、政策和流程知识库中回答问题。' },
  'meeting-brief': { name: '会议简报', description: '结合可访问案例和日历上下文生成简洁会议简报。' },
}

function localizeSkill(skill: SkillDefinition, zh: boolean): SkillDefinition {
  return zh ? { ...skill, ...SKILL_ZH[skill.id] } : skill
}

// ── Handoff toast: the case "arrives" for the current role ──────────────
export function HandoffToast() {
  const { notifications, role, view, activeCaseId } = useEngine()
  const n = notifications.find((x) => x.role === role && !x.read)
  const alreadyThere = !!n && view === 'room' && activeCaseId === n.caseId
  useEffect(() => {
    // Already looking at the case — the handoff is self-evident, no toast.
    if (alreadyThere && n) store.markNotificationRead(n.id)
  }, [alreadyThere, n])
  if (!n || alreadyThere) return null
  return (
    <div className="toast" role="status">
      <div className="toast-head">
        <span className="toast-dot" />
        {n.title}
        <span className="toast-time">{n.time}</span>
      </div>
      <div className="toast-body">{n.body}</div>
      <div className="toast-actions">
        <button
          className="btn btn-ghost"
          onClick={() => store.markNotificationRead(n.id)}
        >
          稍后处理
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            store.markNotificationRead(n.id)
            store.openCase(n.caseId)
          }}
        >
          打开 Trade Room
        </button>
      </div>
    </div>
  )
}

export function Drawer() {
  const { drawer, audit, participants, archivedCaseIds, truth, role, language } = useEngine()
  const zh = language === 'zh'
  const [archiveQuery, setArchiveQuery] = useState('')
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [installedSkillsByRole, setInstalledSkillsByRole] = useState<Record<RoleKey, string[]>>({
    rm: ['client-need-extraction'],
    ps: ['structure-comparator'],
    dealer: ['rfq-packager'],
    ops: ['termsheet-validation'],
  })
  const [personalAccessByRole, setPersonalAccessByRole] = useState<Record<RoleKey, string[]>>({ rm: [], ps: [], dealer: [], ops: [] })
  useEffect(() => {
    if (!drawer) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedSkillId(null)
        setArchiveQuery('')
        store.closeDrawer()
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [drawer])
  if (!drawer) return null

  const recommendedSkills = ROLE_SKILLS[role].map((skill) => localizeSkill(skill, zh))
  const companySkills = COMPANY_SKILLS.map((skill) => localizeSkill(skill, zh))
  const allSkills = [...recommendedSkills, ...companySkills]
  const selectedSkill = allSkills.find((skill) => skill.id === selectedSkillId)
  const installedSkillIds = installedSkillsByRole[role]
  const authorizedPersonalDataIds = personalAccessByRole[role]
  const installSkill = (skillId: string) => setInstalledSkillsByRole((byRole) => ({ ...byRole, [role]: [...new Set([...byRole[role], skillId])] }))
  const togglePersonalAccess = (sourceId: string) => setPersonalAccessByRole((byRole) => {
    const current = byRole[role]
    return { ...byRole, [role]: current.includes(sourceId) ? current.filter((id) => id !== sourceId) : [...current, sourceId] }
  })
  const modalTitle = drawer.type === 'matrix'
    ? zh ? '报价矩阵' : 'Quote Matrix'
    : drawer.type === 'source'
    ? drawer.payload?.title ?? (zh ? '来源证据' : 'Source Evidence')
    : drawer.type === 'case'
      ? zh ? '案例详情' : 'Case Details'
      : drawer.type === 'archive'
      ? zh ? '已归档案例' : 'Archived Cases'
      : drawer.type === 'skills'
        ? selectedSkill ? zh ? '技能详情' : 'Skill Details' : zh ? '技能' : 'Skills'
        : drawer.type === 'data'
          ? zh ? '数据权限' : 'Data Access'
          : drawer.type === 'inventory'
            ? zh ? '数据源清单' : 'Data Sources'
            : zh ? '结构化历史' : 'Structured History'

  const trySkill = (skill: SkillDefinition) => {
    setSelectedSkillId(null)
    store.setView('assistant')
    store.askAssistant(`Try ${skill.name}`, [
      `${skill.name} is ready in this conversation.`,
      `Try asking: “${skill.example}”`,
    ])
  }

  const allCases = [
    { caseId: 'SP-001', name: truth.caseName, status: truth.statusLabel, completed: truth.status === 'COMPLETED' },
    ...OTHER_CASES.map((item) => ({ caseId: item.caseId, name: item.name, status: item.statusLabel, completed: false })),
  ]
  const archivedCases = archivedCaseIds
    .map((caseId) => allCases.find((item) => item.caseId === caseId))
    .filter((item): item is { caseId: string; name: string; status: string; completed: boolean } => Boolean(item))
  const query = archiveQuery.trim().toLowerCase()
  const filteredArchivedCases = archivedCases.filter((item) => !query || `${item.caseId} ${item.name}`.toLowerCase().includes(query))
  return (
    <>
      <div className="drawer-mask" onClick={() => { setSelectedSkillId(null); setArchiveQuery(''); store.closeDrawer() }} />
      <section className={`drawer drawer-${drawer.type}${selectedSkill ? ' skill-detail-modal' : ''}`} role="dialog" aria-modal="true" aria-label={modalTitle}>
        <div className="drawer-head">
          <span>{modalTitle}</span>
          <IconButton icon={X} label={`${zh ? '关闭' : 'Close'} ${modalTitle}`} onClick={() => { setSelectedSkillId(null); setArchiveQuery(''); store.closeDrawer() }} />
        </div>
        <div className="drawer-body">
          {drawer.type === 'matrix' ? (
            /* 上一步那张真矩阵搬进来，底下再挂一句选定依据 */
            <div className="drawer-matrix-body">
              <QuoteMatrixBody />
              {drawer.payload?.body ? (
                <div className="drawer-matrix-note"><span>{zh ? '选定依据' : 'Basis'}</span><p>{drawer.payload.body}</p></div>
              ) : null}
            </div>
          ) : drawer.type === 'case' ? (
            <div className="drawer-case"><CaseDetailsPanel /></div>
          ) : drawer.type === 'archive' ? (
            <div className="archive-manager">
              <div className="archive-manager-summary">
                <span className="archive-manager-icon"><Archive size={17} /></span>
                <span><strong>{zh ? `${archivedCases.length} 个已归档案例` : `${archivedCases.length} archived cases`}</strong><small>{zh ? '已完成案例会自动归档。' : 'Completed cases are archived automatically.'}</small></span>
              </div>
              <label className="archive-search">
                <Search size={15} />
                <input value={archiveQuery} onChange={(event) => setArchiveQuery(event.target.value)} placeholder={zh ? '搜索已归档案例' : 'Search archived cases'} />
              </label>
              <div className="archive-manager-list">
                {filteredArchivedCases.length === 0 ? (
                  <div className="archive-manager-empty"><Archive size={22} /><strong>{query ? zh ? '没有匹配的归档案例' : 'No matching archived cases' : zh ? '暂无归档案例' : 'No archived cases'}</strong><span>{query ? zh ? '请尝试案例 ID 或产品名称。' : 'Try a case ID or product name.' : zh ? '已完成案例会自动显示在这里。' : 'Completed cases will appear here automatically.'}</span></div>
                ) : filteredArchivedCases.map((item) => (
                  <div className="archive-manager-row" key={item.caseId}>
                    <button onClick={() => { store.openCase(item.caseId); store.closeDrawer() }}>
                      <span className="archive-case-id">{item.caseId}</span>
                      <span><strong>{item.name}</strong><small>{item.status}</small></span>
                    </button>
                    {item.completed ? <span className="archive-locked">{zh ? '已完成' : 'Completed'}</span> : <IconButton icon={ArchiveRestore} label={`${zh ? '恢复' : 'Restore'} ${item.name}`} onClick={() => store.restoreCase(item.caseId)} />}
                  </div>
                ))}
              </div>
            </div>
          ) : drawer.type === 'source' ? (
            <>
              <div className="evidence">
                <div className="emeta">{drawer.payload?.meta}</div>
                {drawer.payload?.body}
              </div>
              {/* 这句只对"来源证据"成立；简报之类的其他内容套上去就不对了 */}
              {drawer.payload?.title?.includes('简报') ? null : (
                <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                  AI 结论均可追溯到原始输入。此处显示 AI 提取该 Artifact 时引用的原始消息（Layer C 来源以摘要形式提供，不默认展示完整原文）。
                </p>
              )}
            </>
          ) : drawer.type === 'skills' ? (
            selectedSkill ? (
              <div className="skill-detail-view">
                <button className="modal-back" onClick={() => setSelectedSkillId(null)}><ArrowLeft size={15} />{zh ? '全部技能' : 'All skills'}</button>
                <div className="skill-detail-hero">
                  <span className="skill-icon large"><selectedSkill.icon size={22} /></span>
                  <div><span>{zh ? '技能' : 'Skill'}</span><h2>{selectedSkill.name}</h2><p>{selectedSkill.description}</p></div>
                  {installedSkillIds.includes(selectedSkill.id) ? <Tag tone="success">{zh ? '已安装' : 'Installed'}</Tag> : <Tag>{zh ? '可安装' : 'Available'}</Tag>}
                </div>
                <div className="skill-detail-grid">
                  <section><span>{zh ? '能做什么' : 'What it can do'}</span><strong>{selectedSkill.description}</strong></section>
                  <section><span>{zh ? '使用的数据' : 'Data it uses'}</span><strong>{selectedSkill.dataUsed}</strong></section>
                  <section className="skill-example"><span>{zh ? '示例指令' : 'Example instruction'}</span><strong>“{selectedSkill.example}”</strong></section>
                </div>
                {SKILL_MANIFESTS[selectedSkill.id] ? (
                  <details className="skill-manifest">
                    <summary>
                      {zh ? '治理信息' : 'Governance'} · v{SKILL_MANIFESTS[selectedSkill.id].version} · {zh ? '合规已审批' : 'compliance approved'}（{SKILL_MANIFESTS[selectedSkill.id].approvedBy}）
                    </summary>
                    <div className="skill-manifest-grid">
                      {/* 声明 vs 已接入：manifest 是约束不是说明，看得见才成立 */}
                      <div><span>reads</span><code className="plane-list">{availablePlanes(selectedSkill.id).map((p) => (
                        <span key={p.plane} className={p.wired ? 'plane wired' : 'plane'}>{p.plane}{p.wired ? <b title={zh ? '已接入数据面' : 'data plane wired'}>●</b> : <i title={zh ? '已声明，尚未接入' : 'declared, not wired'}>○</i>}</span>
                      ))}</code><small>{zh ? '默认拒绝，声明即上限；● 已接入 ○ 未接入' : 'deny by default; ● wired ○ declared only'}</small></div>
                      <div><span>writes</span><code>{SKILL_MANIFESTS[selectedSkill.id].writes.join('  ·  ')}</code><small>{zh ? '只出草稿' : 'drafts only'}</small></div>
                      <div><span>can_trigger_transition</span><code className="deny">false</code><small>{zh ? '正式流转必须人确认' : 'formal transitions need human confirmation'}</small></div>
                    </div>
                  </details>
                ) : null}
                <div className="skill-detail-actions">
                  {!installedSkillIds.includes(selectedSkill.id) ? (
                    <button className="btn btn-secondary" onClick={() => installSkill(selectedSkill.id)}><Download size={15} />{zh ? '安装技能' : 'Install skill'}</button>
                  ) : null}
                  <button className="btn btn-primary" onClick={() => trySkill(selectedSkill)}><Play size={15} />{zh ? '立即体验' : 'Try now'}</button>
                </div>
              </div>
            ) : (
              <div className="skills-library">
                <div className="skills-intro"><span className="skills-intro-icon"><BookOpen size={18} /></span><div><strong>{zh ? `${ROLE_LABEL[role]} 的技能` : `Skills for ${ROLE_LABEL[role]}`}</strong><p>{zh ? '优先展示适合当前职位的推荐技能，公司通用技能对所有员工开放。' : 'Recommended skills are ordered for the current role. Company skills remain available to everyone.'}</p></div></div>
                <div className="skills-section-head"><span>{zh ? `为 ${ROLE_LABEL[role]} 推荐` : `Recommended for ${ROLE_LABEL[role]}`}</span><small>{recommendedSkills.length} {zh ? '项技能' : 'skills'}</small></div>
                <div className="skill-grid">
                  {recommendedSkills.map((skill) => {
                    const installed = installedSkillIds.includes(skill.id)
                    return <article className="skill-card" key={skill.id}>
                      <div className="skill-card-top"><span className="skill-icon"><skill.icon size={18} /></span>{installed ? <Tag tone="success">{zh ? '已安装' : 'Installed'}</Tag> : <Tag tone="primary">{zh ? '推荐' : 'Recommended'}</Tag>}</div>
                      <div><h3>{skill.name}{SKILL_MANIFESTS[skill.id] ? <span className="skill-ver">v{SKILL_MANIFESTS[skill.id].version}</span> : null}</h3><p>{skill.description}</p></div>
                      <div className="skill-card-actions"><button onClick={() => setSelectedSkillId(skill.id)}>{zh ? '详情' : 'Details'}</button>{!installed ? <button onClick={() => installSkill(skill.id)}><Download size={14} />{zh ? '安装' : 'Install'}</button> : null}<button className="primary" onClick={() => trySkill(skill)}><Play size={14} />{zh ? '立即体验' : 'Try now'}</button></div>
                    </article>
                  })}
                </div>
                <div className="skills-section-head company"><span>{zh ? '公司通用技能' : 'Company skills'}</span><small>{zh ? '所有员工均可使用' : 'Available to all employees'}</small></div>
                <div className="skill-grid">
                  {companySkills.map((skill) => {
                    const installed = installedSkillIds.includes(skill.id)
                    return <article className="skill-card" key={skill.id}>
                      <div className="skill-card-top"><span className="skill-icon neutral"><skill.icon size={18} /></span>{installed ? <Tag tone="success">{zh ? '已安装' : 'Installed'}</Tag> : <Tag>{zh ? '公司通用' : 'Company'}</Tag>}</div>
                      <div><h3>{skill.name}{SKILL_MANIFESTS[skill.id] ? <span className="skill-ver">v{SKILL_MANIFESTS[skill.id].version}</span> : null}</h3><p>{skill.description}</p></div>
                      <div className="skill-card-actions"><button onClick={() => setSelectedSkillId(skill.id)}>{zh ? '详情' : 'Details'}</button>{!installed ? <button onClick={() => installSkill(skill.id)}><Download size={14} />{zh ? '安装' : 'Install'}</button> : null}<button className="primary" onClick={() => trySkill(skill)}><Play size={14} />{zh ? '立即体验' : 'Try now'}</button></div>
                    </article>
                  })}
                </div>
              </div>
            )
          ) : drawer.type === 'inventory' ? (
            <DataSourceInventory zh={zh} />
          ) : drawer.type === 'data' ? (
            <div className="data-access-view">
              <div className="data-access-intro"><span><ShieldCheck size={19} /></span><div><strong>{zh ? `${PEOPLE[role].name} 的助手权限` : `${PEOPLE[role].name}'s assistant access`}</strong><p>{zh ? '公司数据遵循职位权限；个人数据只有在员工授权后才会使用。' : 'Company sources follow role permissions. Personal sources are used only after the employee authorizes them.'}</p></div><Tag tone="primary">{ROLE_LABEL[role]}</Tag></div>
              <section className="access-section">
                <div className="access-section-head"><span><Building2 size={16} />{zh ? '公司授权' : 'Company authorized'}</span><small>{zh ? '由公司统一管理' : 'Managed by your organization'}</small></div>
                <div className="access-list">
                  <div className="access-row"><span className="access-source-icon"><Database size={17} /></span><div><strong>{zh ? '可访问的案例状态' : 'Accessible Case State'}</strong><p>{zh ? `${PEOPLE[role].name} 作为负责人或参与者的案例。` : `Cases where ${PEOPLE[role].name} is an owner or participant.`}</p></div><span className="access-status granted"><Check size={13} />{zh ? '已授权' : 'Granted'}</span></div>
                  <div className="access-row"><span className="access-source-icon"><BriefcaseBusiness size={17} /></span><div><strong>{zh ? '交易室产物' : 'Trade Room Artifacts'}</strong><p>{zh ? '可访问案例中的已批准产物和草稿。' : 'Approved and draft artifacts within accessible cases.'}</p></div><span className="access-status granted"><Check size={13} />{zh ? '已授权' : 'Granted'}</span></div>
                  <div className="access-row"><span className="access-source-icon"><BookOpen size={17} /></span><div><strong>{zh ? '产品与政策知识' : 'Product & Policy Knowledge'}</strong><p>{zh ? '公司批准的产品、适当性和流程资料。' : 'Company-approved product, suitability and process sources.'}</p></div><span className="access-status granted"><Check size={13} />{zh ? '已授权' : 'Granted'}</span></div>
                </div>
              </section>
              <section className="access-section personal-access">
                <div className="access-section-head"><span><LockKeyhole size={16} />{zh ? '个人授权' : 'Personal authorization'}</span><small>{zh ? `由 ${PEOPLE[role].name} 管理` : `Controlled by ${PEOPLE[role].name}`}</small></div>
                <div className="access-list">
                  {[
                    { id: 'work-email', name: zh ? '工作邮箱' : 'Work Email', detail: zh ? '搜索并使用员工工作邮箱中的邮件。' : 'Search and use messages from the employee work mailbox.', icon: Mail },
                    { id: 'calendar', name: zh ? '工作日历' : 'Work Calendar', detail: zh ? '在准备简报和跟进内容时使用会议上下文。' : 'Use meeting context when preparing briefs and follow-ups.', icon: CalendarDays },
                  ].map((source) => {
                    const authorized = authorizedPersonalDataIds.includes(source.id)
                    return <div className="access-row" key={source.id}><span className="access-source-icon"><source.icon size={17} /></span><div><strong>{source.name}</strong><p>{source.detail}</p></div>{authorized ? <span className="access-status granted"><Check size={13} />{zh ? `${PEOPLE[role].name} 已授权` : `Authorized by ${PEOPLE[role].name}`}</span> : <span className="access-status not-connected">{zh ? '未连接' : 'Not connected'}</span>}<button className={authorized ? 'access-manage' : 'access-authorize'} onClick={() => togglePersonalAccess(source.id)}>{authorized ? zh ? '移除' : 'Remove' : zh ? '授权' : 'Authorize'}</button></div>
                  })}
                </div>
              </section>
              <div className="access-privacy-note"><LockKeyhole size={14} /><span>{zh ? '个人数据授权可随时移除；正式操作仍须由指定员工审核。' : "Personal sources can be removed at any time. Formal actions still require the assigned employee's review."}</span></div>
            </div>
          ) : (
            <>
              <div className="drawer-sec">Participants · 参与者（按阶段加入）</div>
              <div className="participants">
                {participants.map((p) => (
                  <div className="prow" key={p.person.role}>
                    <span className={`avatar r-${p.person.role}`}>{p.person.initials}</span>
                    <span className="pname">
                      {p.person.name}
                      <span className="prole">{p.person.roleLabel}</span>
                    </span>
                    <span className="pjoin">
                      {p.joinedAt} 加入 · {p.joinStageLabel}
                    </span>
                  </div>
                ))}
              </div>
              <div className="drawer-sec">Formal Actions & AI Steps · 正式状态流转</div>
              {audit.map((e) => (
                <div key={e.id} className={`audit-row${e.actorRole === 'AI' ? '' : ' human'}`}>
                  <div className="aa">{e.action}</div>
                  <div className="am">
                    {e.actor} · {e.actorRole} · {e.time}
                    {e.detail ? ` · ${e.detail}` : ''}
                  </div>
                  <div className="astate">
                    {e.priorState} → {e.newState}
                  </div>
                </div>
              ))}
              <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                每个 formal action 都记录 actor、时间、prior state 和 new state。AI 步骤（浅色圆点）与人工正式动作（蓝色圆点）区分显示。新加入者以此为主要历史入口，而不是补读完整聊天记录。
              </p>
            </>
          )}
        </div>
      </section>
    </>
  )
}

export function ConfirmModal() {
  const { confirm, language } = useEngine()
  const zh = language === 'zh'
  const [acknowledgedKey, setAcknowledgedKey] = useState<string | null>(null)
  // 渠道选择：默认落在第一条（邮件），因为它自带留痕，是更省事的那条路
  const [channelKey, setChannelKey] = useState<string | null>(null)
  const channels = confirm?.channels
  const channel = channelKey ?? channels?.[0]?.key ?? undefined
  if (!confirm) return null
  const execution = confirm.key === 'executeTrade'
  const needHandoff = confirm.key === 'confirmNeed'
  // 这一步要不要人明确背书。只有这两处：需求共创的结论、代客下单。
  const mustAck = execution || needHandoff
  const acked = execution ? acknowledgedKey === confirm.key : acknowledgedKey !== 'need-gap-off'
  return (
    <div className="modal-mask" onClick={() => store.cancelConfirm()}>
      <div className="modal confirm-lite" onClick={(e) => e.stopPropagation()}>
        <div className="cl-head">
          <div className="m-title">{confirm.title}</div>
          <IconButton icon={X} label={zh ? '关闭确认弹窗' : 'Close confirmation'} onClick={() => store.cancelConfirm()} />
        </div>

        {/* 这一步做什么 —— 一句话，不重复卡面上已有的信息 */}
        <p className="cl-what">{confirm.consequence}</p>

        {/* 对外发出的文书：正文全文摆出来，人看到什么才算审过什么 */}
        {confirm.preview ? (
          <div className="cl-preview">
            <div className="cl-preview-label">{confirm.preview.label}</div>
            <pre>{confirm.preview.body}</pre>
          </div>
        ) : null}

        {/* 代客下单是最高风险的一步，执行前控制项保留 */}
        {execution ? (
          <ul className="cl-checks">
            <li><CheckCircle2 size={14} />{zh ? '客户指令已确认 · Alice · 14:38' : 'Client instruction confirmed'}</li>
            <li><CheckCircle2 size={14} />{zh ? '指令与已批准条款一致' : 'Instruction matches approved terms'}</li>
            <li><CheckCircle2 size={14} />{zh ? '对客票息已锁死，上手成交价回报时才定' : 'Client coupon locked'}</li>
          </ul>
        ) : null}

        {/* 走哪条渠道给客户——决定了之后怎么留痕 */}
        {channels?.length ? (
          <div className="cl-channels">
            {channels.map((c) => (
              <button
                key={c.key}
                className={`cl-channel${channel === c.key ? ' on' : ''}`}
                onClick={() => setChannelKey(c.key)}
              >
                <span className="cl-channel-mark" />
                <div><strong>{c.label}</strong><small>{c.detail}</small></div>
              </button>
            ))}
          </div>
        ) : null}

        {/* 必须由人背书的那一条 */}
        {mustAck ? (
          <label className={`cl-ack${acked ? ' on' : ''}`}>
            <input
              type="checkbox"
              checked={acked}
              onChange={(e) => {
                if (execution) setAcknowledgedKey(e.target.checked ? confirm.key : null)
                else setAcknowledgedKey(e.target.checked ? null : 'need-gap-off')
              }}
            />
            <span>{confirm.ack ?? (execution
              ? zh ? '我已复核最终条款，确认代客下单' : 'I have reviewed the final terms'
              : zh ? '标的与流动性是共创结论、非客户邮件原文，已与客户核对' : 'Joint conclusion checked with the client')}</span>
          </label>
        ) : null}

        <div className="m-actions">
          <button className="btn btn-ghost" onClick={() => store.cancelConfirm()}>{zh ? '取消' : 'Cancel'}</button>
          <button
            className={`btn ${confirm.danger ? 'btn-danger-ghost' : 'btn-primary'}`}
            disabled={mustAck && !acked}
            onClick={() => store.executeConfirmed(channel)}
          >
            {needHandoff ? zh ? '确认并移交' : 'Confirm & Hand Off' : channels?.length
              ? channels.find((c) => c.key === channel)?.label ?? confirm.confirmLabel
              : confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
