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
  CircleAlert,
  Clock3,
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
import { store, useEngine } from '../hooks'
import type { RoleKey } from '../types'
import { IconButton, Tag } from './primitives'

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
  ops: '簿记 / 核对',
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
  const modalTitle = drawer.type === 'source'
    ? drawer.payload?.title ?? (zh ? '来源证据' : 'Source Evidence')
    : drawer.type === 'archive'
      ? zh ? '已归档案例' : 'Archived Cases'
      : drawer.type === 'skills'
        ? selectedSkill ? zh ? '技能详情' : 'Skill Details' : zh ? '技能' : 'Skills'
        : drawer.type === 'data'
          ? zh ? '数据权限' : 'Data Access'
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
    { caseId: 'SP-001', name: 'Tencent FCN', status: truth.statusLabel, completed: truth.status === 'COMPLETED' },
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
          {drawer.type === 'archive' ? (
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
              <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                AI 结论均可追溯到原始输入。此处显示 AI 提取该 Artifact 时引用的原始消息（Layer C 来源以摘要形式提供，不默认展示完整原文）。
              </p>
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
                      <div><h3>{skill.name}</h3><p>{skill.description}</p></div>
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
                      <div><h3>{skill.name}</h3><p>{skill.description}</p></div>
                      <div className="skill-card-actions"><button onClick={() => setSelectedSkillId(skill.id)}>{zh ? '详情' : 'Details'}</button>{!installed ? <button onClick={() => installSkill(skill.id)}><Download size={14} />{zh ? '安装' : 'Install'}</button> : null}<button className="primary" onClick={() => trySkill(skill)}><Play size={14} />{zh ? '立即体验' : 'Try now'}</button></div>
                    </article>
                  })}
                </div>
              </div>
            )
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
  if (!confirm) return null
  const execution = confirm.key === 'executeTrade'
  const needHandoff = confirm.key === 'confirmNeed'
  const standardAction = !execution && !needHandoff
  const acknowledged = acknowledgedKey === confirm.key
  const acceptedGap = acknowledgedKey !== 'need-gap-off'
  const actionMeta: Record<string, { current: string; next: string; owner: string; label: string }> = {
    approveStructure: { current: 'STRUCTURE_REVIEW', next: 'STRUCTURE_APPROVED', owner: 'Ken · Dealer', label: 'Structure approval' },
    returnRFQ: { current: 'RFQ_READY', next: 'STRUCTURE_MODIFICATION_REQUIRED', owner: 'David · Product Specialist', label: 'Return for modification' },
    acceptPricing: { current: 'RFQ_READY', next: 'PRICING_IN_PROGRESS', owner: 'Ken · Dealer', label: 'Release market RFQ' },
    modifyFromPricing: { current: 'PRICING_IN_PROGRESS', next: 'STRUCTURE_MODIFICATION_REQUIRED', owner: 'David · Product Specialist', label: 'Modify structure' },
    requestRequote: { current: 'PRICING_IN_PROGRESS', next: 'REQUOTE_REQUIRED', owner: 'Ken · Dealer', label: 'Request refreshed quotes' },
    prepareClientQuote: { current: 'PRICING_IN_PROGRESS', next: 'CLIENT_QUOTE_READY', owner: 'Alice · RM', label: 'Prepare client communication' },
    sendClientQuote: { current: 'CLIENT_QUOTE_READY', next: 'WAITING_FOR_CLIENT', owner: 'Alice · RM', label: 'External client communication' },
    rejectInstruction: { current: 'CLIENT_INSTRUCTION_PENDING_CONFIRMATION', next: 'WAITING_FOR_CLIENT', owner: 'Alice · RM', label: 'Reject AI detection' },
    confirmInstruction: { current: 'CLIENT_INSTRUCTION_PENDING_CONFIRMATION', next: 'CLIENT_INSTRUCTION_CONFIRMED', owner: 'Ken · Dealer', label: 'Formal client instruction' },
    requestLiveRequote: { current: 'LIVE_REQUOTE_REQUIRED', next: 'LIVE_REQUOTE_REQUIRED', owner: 'Ken · Dealer', label: 'Request live executable quote' },
    raiseException: { current: 'TERMSHEET_REVIEW', next: 'EXCEPTION', owner: 'MS Documentation / Trade Support', label: 'Route documentation exception' },
    resolveException: { current: 'EXCEPTION', next: 'TERMSHEET_REVIEW', owner: 'Mia · Operations', label: 'Resolve exception' },
    approveTermsheet: { current: 'TERMSHEET_REVIEW', next: 'COMPLETED', owner: 'No further owner', label: 'Final term sheet approval' },
  }
  const meta = actionMeta[confirm.key] ?? { current: 'CURRENT_STATE', next: 'NEXT_STATE', owner: 'Current case owner', label: 'Formal workflow action' }
  return (
    <div className="modal-mask" onClick={() => store.cancelConfirm()}>
      <div className={`modal${execution ? ' execution-confirm' : needHandoff ? ' need-confirm' : standardAction ? ' standard-confirm' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title-row">
          <div>
            <div className="m-title">{confirm.title}</div>
            {execution ? <div className="confirm-subtitle">{zh ? '创建正式执行事件前，由交易员进行最终审核。' : 'Final dealer review before a formal execution event is created.'}</div> : null}
            {needHandoff ? <div className="confirm-subtitle">{zh ? '这将批准客户需求摘要，并把结构设计移交给 David。' : 'This will approve the Client Need Brief and hand off structuring to David.'}</div> : null}
            {standardAction ? <div className="confirm-subtitle">{zh ? '确认前请检查准备执行的操作及其案例状态变化。' : 'Review the prepared action and resulting case state before confirming.'}</div> : null}
          </div>
          {execution ? <Tag tone="critical">{zh ? '正式操作' : 'Formal action'}</Tag> : null}
          {needHandoff ? <Tag tone="primary">{zh ? '状态流转' : 'State transition'}</Tag> : null}
          {standardAction ? <Tag tone={confirm.danger ? 'warning' : 'primary'}>{zh ? '正式流程操作' : 'Formal workflow action'}</Tag> : null}
          <IconButton icon={X} label={zh ? '关闭确认弹窗' : 'Close confirmation'} onClick={() => store.cancelConfirm()} />
        </div>
        {execution ? (
          <div className="execution-confirm-validity">
            <Clock3 size={17} />
            <span><strong>Issuer quote still valid</strong>Morgan Stanley live quote · received 14:41</span>
            <strong className="confirm-countdown">01:42</strong>
          </div>
        ) : null}
        {needHandoff ? (
          <>
            <div className="need-confirm-section-label">{zh ? '待批准摘要' : 'Approved summary'}</div>
            <div className="need-confirm-summary">
              <div><span>{zh ? '标的' : 'Underlying'}</span><strong>Tencent / 0700.HK</strong></div><div><span>{zh ? '名义本金' : 'Notional'}</span><strong>USD 1,000,000</strong></div><div><span>{zh ? '期限' : 'Horizon'}</span><strong>~6M</strong></div><div><span>{zh ? '目标收益' : 'Target'}</span><strong>&gt;10% p.a.</strong></div><div><span>{zh ? '风险' : 'Risk'}</span><strong>{zh ? '中等' : 'Moderate'}</strong></div><div><span>{zh ? '观点' : 'View'}</span><strong>{zh ? '看好' : 'Bullish'}</strong></div><div><span>{zh ? '客户分级' : 'Classification'}</span><strong>{zh ? '个人 PI · C4' : 'Individual PI · C4'}</strong></div>
            </div>
            <div className="need-confirm-evidence"><CheckCircle2 size={16} /><strong>{zh ? '5 个字段经邮件证据核实 · 客户分级来自 CRM 档案 · 适当性预检通过（FCN·R4 ≤ C4）' : '5 fields verified from email · classification from CRM profile · suitability pre-check passed (FCN R4 ≤ C4)'}</strong><button>{zh ? '查看字段证据' : 'View field evidence'}</button></div>
            <div className="need-confirm-gap">
              <CircleAlert size={17} /><div><strong>{zh ? '流动性偏好缺失' : 'Liquidity Preference Missing'}</strong><span>{zh ? '客户未说明流动性偏好，确认后将记录为已接受的缺失项。' : 'Client did not specify liquidity preference. Confirming will record this as an accepted gap.'}</span><label><input type="checkbox" checked={acceptedGap} onChange={(event) => setAcknowledgedKey(event.target.checked ? null : 'need-gap-off')} />{zh ? '记录为已接受的缺失项' : 'Record as accepted gap'} <small>({zh ? '必选' : 'Required'})</small></label></div>
            </div>
            <div className="need-confirm-coverage"><span><CheckCircle2 size={14} />{zh ? '已提取 7 项' : '7 extracted'}</span><span><CheckCircle2 size={14} />{zh ? '已核实 6 项' : '6 verified'}</span><span className="warning"><CircleAlert size={14} />{zh ? '1 项待处理缺失' : '1 unresolved gap'}</span><small>{zh ? '来源：Mr. Chan 的邮件 · 14:02 + CRM 客户档案' : 'Source: Email from Mr. Chan · 14:02 + CRM profile'}</small></div>
            <div className="need-next-state"><div className="need-confirm-section-label">{zh ? '下一状态预览' : 'Next state preview'}</div><div><Tag>CLIENT_NEED_DRAFT</Tag><b>→</b><Tag tone="primary">CLIENT_NEED_APPROVED</Tag></div><p><span>{zh ? '下一负责人' : 'Next owner'}</span><strong>David · Product Specialist</strong></p><p><span>{zh ? '下一步操作' : 'Next action'}</span><strong>{zh ? '设计结构方案' : 'Design structure proposal'}</strong></p></div>
          </>
        ) : execution ? <div className="m-summary">
          <div className="ms-head">你正在确认</div>
          {confirm.summary.map((s) => (
            <div className="ms-row" key={s}>
              {s}
            </div>
          ))}
        </div> : (
          <div className="standard-confirm-body">
            <div className="standard-action-overview"><span>Prepared action</span><strong>{meta.label}</strong><p>{confirm.consequence}</p></div>
            <div className="standard-confirm-section"><span>Review summary</span><div>{confirm.summary.map((item) => <p key={item}><CheckCircle2 size={14} /><strong>{item}</strong></p>)}</div></div>
            <div className={`standard-impact ${confirm.danger ? 'warning' : ''}`}><CircleAlert size={16} /><div><span>Workflow impact</span><strong>{confirm.danger ? 'This action changes or routes the current workflow.' : 'This action creates an auditable state transition.'}</strong></div></div>
            <div className="standard-state-preview"><div><span>Current state</span><strong>{meta.current}</strong></div><b>→</b><div><span>Next state</span><strong>{meta.next}</strong></div><div><span>Next owner</span><strong>{meta.owner}</strong></div></div>
          </div>
        )}
        {execution ? (
          <div className="confirm-checks">
            <div><CheckCircle2 size={15} /><span><strong>Client instruction confirmed</strong>Alice · RM · 14:38</span></div>
            <div><CheckCircle2 size={15} /><span><strong>Ticket matches approved terms</strong>Notional, issuer, strike, KI and coupon aligned</span></div>
            <div><CheckCircle2 size={15} /><span><strong>Booking fields complete</strong>Settlement and account routing ready</span></div>
          </div>
        ) : null}
        {execution ? <div className="m-consequence"><CircleAlert size={16} /><span>{confirm.consequence}</span></div> : null}
        {execution ? (
          <label className="execution-ack">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledgedKey(event.target.checked ? confirm.key : null)} />
            <span>I have reviewed the final live terms and intend to execute this trade.</span>
          </label>
        ) : null}
        {execution ? (
          <div className="confirm-state-preview">
            <div><span>Current state</span><strong>EXECUTION_READY</strong></div>
            <span className="confirm-state-arrow">→</span>
            <div><span>After execution</span><strong>EXECUTED</strong></div>
            <div className="confirm-state-owner"><span>Next owner</span><strong>Operations · Term sheet validation</strong></div>
          </div>
        ) : null}
        <div className="m-actions">
          <button className="btn btn-ghost" onClick={() => store.cancelConfirm()}>
            {execution ? zh ? '返回执行单' : 'Back to Ticket' : needHandoff || standardAction ? zh ? '返回审核' : 'Back to Review' : '取消'}
          </button>
          {needHandoff ? <button className="btn btn-secondary" onClick={() => store.cancelConfirm()}>{zh ? '编辑摘要' : 'Edit Brief'}</button> : null}
          {execution ? (
            <button className="btn btn-secondary" onClick={() => {
              store.cancelConfirm()
              requestAnimationFrame(() => store.requestConfirm({
                key: 'requestLiveRequote',
                title: 'Request Live Requote',
                summary: ['Request a fresh executable quote from Morgan Stanley', 'Refresh the execution ticket before submission'],
                consequence: 'The trade remains blocked until Dealer reviews a valid live quote.',
                confirmLabel: 'Request live requote',
              }))
            }}>Request Live Requote</button>
          ) : null}
          <button
            className={`btn ${confirm.danger ? 'btn-danger-ghost' : 'btn-primary'}`}
            disabled={(execution && !acknowledged) || (needHandoff && !acceptedGap)}
            onClick={() => store.executeConfirmed()}
          >
            {needHandoff ? zh ? '确认并移交' : 'Confirm & Hand Off' : confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
