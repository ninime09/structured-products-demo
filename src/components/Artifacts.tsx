import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileText,
  Mail,
  MessageSquare,
  PenLine,
  Route,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { store, useEngine } from '../hooks'
import { FCN_WORKFLOW } from '../config/fcn-pack/workflow'
import type { Artifact, RoleKey } from '../types'
import { Button, Panel, Tag } from './primitives'
import { confirmThen } from './confirm'
import { ActionBtn, Countdown, StatusBadge } from './ui'

// Statuses that mean "this card is settled history" — collapsed by default
// so the active artifact stays the visual protagonist of the room.
const SETTLED = new Set(['APPROVED', 'ACCEPTED', 'SUPERSEDED', 'STALE', 'SENT', 'EXECUTED', 'CONFIRMED', 'VALIDATED', 'EXPIRED'])

const CLIENT_SOURCE_BODY: Record<string, { title: string; body: string; meta: string }> = {
  'art-need': {
    title: 'Source Evidence',
    body: 'Hi Alice, I have around USD 1 million to invest. I remain positive on Tencent and would consider something around 6 months, targeting more than 10% p.a. I can accept moderate downside risk. Please let me know what may work.',
    meta: 'Mr. Chan · Client email · 14:02（原始客户邮件）',
  },
  'art-inst': {
    title: 'Source Evidence',
    body: '客户回复：OK，就按 Morgan Stanley 这个条款做，USD 1,000,000，请今天内帮我执行。',
    meta: 'Alice · RM 转述客户消息 · 14:36',
  },
}

function ArtifactFrame({
  artifact,
  children,
  actions,
  sourceRef,
  summary,
}: {
  artifact: Artifact
  children: React.ReactNode
  actions?: React.ReactNode
  sourceRef?: string
  summary?: string
}) {
  const { focusArtifactId } = useEngine()
  const ref = useRef<HTMLDivElement>(null)
  const settled = SETTLED.has(artifact.status)
  // Open state is derived: settled history collapses by default, a manual
  // toggle overrides it, and any status change discards the override.
  const [override, setOverride] = useState<boolean | null>(null)
  const [prevStatus, setPrevStatus] = useState(artifact.status)
  if (prevStatus !== artifact.status) {
    setPrevStatus(artifact.status)
    setOverride(null)
  }
  const open = override ?? (!settled || focusArtifactId === artifact.id)
  useEffect(() => {
    if (focusArtifactId === artifact.id) {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      const t = setTimeout(() => store.clearFocus(), 600)
      return () => clearTimeout(t)
    }
  }, [focusArtifactId, artifact.id])
  const dimmed = ['STALE', 'SUPERSEDED'].includes(artifact.status)
  const collapsed = settled && !open
  return (
    <div
      ref={ref}
      className={`artifact status-${artifact.status.replace(/\s/g, '-')}${dimmed ? ' dimmed' : ''}${collapsed ? ' collapsed' : ''}`}
    >
      <div
        className={`artifact-head${settled ? ' clickable' : ''}`}
        onClick={settled ? () => setOverride(!open) : undefined}
        title={settled ? (collapsed ? '展开' : '收起') : undefined}
      >
        <span className="ai-chip">AI</span>
        <span className="atitle">
          {artifact.title}
          <span className="zh">{artifact.titleZh}</span>
        </span>
        {collapsed && summary ? <span className="asummary">{summary}</span> : null}
        <span className="aright">
          <StatusBadge status={artifact.status} />
          <span className="ver">v{artifact.version}</span>
          {settled ? <span className={`chev${collapsed ? '' : ' up'}`}>⌄</span> : null}
        </span>
      </div>
      {collapsed ? null : <div className="artifact-body">{children}</div>}
      {!collapsed && (actions || sourceRef || artifact.approvedMeta) && (
        <div className="artifact-foot">
          {sourceRef ? (
            <button
              className="source"
              onClick={() =>
                store.openDrawer({
                  type: 'source',
                  payload: CLIENT_SOURCE_BODY[artifact.id] ?? {
                    title: 'Source Evidence',
                    body: sourceRef,
                    meta: '来源引用',
                  },
                })
              }
            >
              来源：{sourceRef}
            </button>
          ) : null}
          {artifact.approvedMeta ? <span className="approved-meta">✓ {artifact.approvedMeta}</span> : null}
          <span className="spacer" />
          {actions}
        </div>
      )}
    </div>
  )
}

function Fields({ rows, mono = true }: { rows: { label: string; value: string }[]; mono?: boolean }) {
  return (
    <div className="fgrid">
      {rows.map((r) => (
        <FieldRow key={r.label} label={r.label} value={r.value} mono={mono} />
      ))}
    </div>
  )
}
function FieldRow({ label, value, mono }: { label: string; value: string; mono: boolean }) {
  const numeric = /[%\d]/.test(value) && value !== '—'
  return (
    <>
      <span className="fl">{label}</span>
      <span className={`fv${mono && numeric ? ' num' : ''}${value === '—' ? ' missing' : ''}`}>{value}</span>
    </>
  )
}

function EvidencePanel({
  title,
  meta,
  children,
}: {
  title: string
  meta: string
  children: React.ReactNode
}) {
  return (
    <Panel className="source-evidence-panel">
      <div className="source-evidence-head">
        <span><Mail size={14} />{title}</span>
        <Tag>Source evidence</Tag>
      </div>
      <div className="source-evidence-meta">{meta}</div>
      <div className="source-evidence-body">{children}</div>
    </Panel>
  )
}

export function NeedReviewWorkspace() {
  const { artifacts, role, clarified, language } = useEngine()
  const zh = language === 'zh'
  const [linkedKey, setLinkedKey] = useState<string | null>('notional')
  const [pulseTarget, setPulseTarget] = useState<{ side: 'source' | 'field'; key: string } | null>(null)
  const pulseTimer = useRef<number | null>(null)
  useEffect(() => () => {
    if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current)
  }, [])
  const artifact = artifacts['art-need']
  if (!artifact || artifact.data.type !== 'needBrief') return null
  const d = artifact.data
  const fieldValue = (label: string) => d.fields.find((field) => field.label === label)?.value ?? '—'
  const confirmNeed = () =>
    confirmThen({
      key: 'confirmNeed',
      title: '确认客户需求 Confirm Client Need',
      summary: [
        'Underlying: Tencent / 0700.HK',
        'Notional: USD 1,000,000',
        'Horizon: ~6M · Target Yield: >10%',
        'Risk Tolerance: Moderate',
      ],
      consequence: clarified
        ? '确认后客户需求将成为 Approved 状态，Case 交给 David（产品专家）设计结构。'
        : '仍有缺失项（流动性偏好）。确认即表示接受缺失项。Case 将交给 David（产品专家）设计结构。',
      confirmLabel: '确认客户需求',
    })

  const activateEvidence = (key: string, origin: 'source' | 'field') => {
    setLinkedKey(key)
    setPulseTarget(null)
    const targetSide = origin === 'source' ? 'field' : 'source'
    requestAnimationFrame(() => {
      setPulseTarget({ side: targetSide, key })
      const targetId = targetSide === 'source' && key === 'liquidity' ? 'source-email-body' : `${targetSide}-evidence-${key}`
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    })
    if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current)
    pulseTimer.current = window.setTimeout(() => setPulseTarget(null), 850)
  }

  const evidenceKeyDown = (event: React.KeyboardEvent, key: string, origin: 'source' | 'field') => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    activateEvidence(key, origin)
  }

  const sourceClass = (key: string, color: string) => `evidence-mark ${color}${linkedKey === key ? ' linked-active' : ''}${pulseTarget?.side === 'source' && pulseTarget.key === key ? ' evidence-pulse' : ''}`

  const extracted: Array<{
    key: string
    label: string
    value: string
    source: string
    status: 'verified' | 'missing'
  }> = [
    { key: 'underlying', label: zh ? '标的' : 'Underlying', value: fieldValue('Underlying'), source: zh ? '邮件第 2 行' : 'Email line 2', status: 'verified' },
    { key: 'risk', label: zh ? '风险承受度' : 'Risk Tolerance', value: zh ? '中等' : 'Moderate', source: zh ? '邮件第 5 行' : 'Email line 5', status: 'verified' },
    { key: 'notional', label: zh ? '名义本金' : 'Notional', value: fieldValue('Notional'), source: zh ? '邮件第 3 行' : 'Email line 3', status: 'verified' },
    { key: 'view', label: zh ? '市场观点' : 'Directional View', value: zh ? '看好' : 'Bullish', source: zh ? '邮件第 6 行' : 'Email line 6', status: 'verified' },
    { key: 'suitability', label: zh ? '客户分级 · 适当性' : 'Client Classification', value: zh ? '个人 PI · 可承受 C4' : 'Individual PI · up to C4', source: zh ? 'CRM 客户档案（非邮件）' : 'CRM profile (not email)', status: 'verified' },
    { key: 'horizon', label: zh ? '投资期限' : 'Investment Horizon', value: fieldValue('Investment Horizon'), source: zh ? '邮件第 2 行' : 'Email line 2', status: 'verified' },
    { key: 'liquidity', label: zh ? '流动性偏好' : 'Liquidity Preference', value: clarified ? fieldValue('Liquidity Preference') : zh ? '缺失' : 'Missing', source: '—', status: clarified ? 'verified' : 'missing' },
    { key: 'target', label: zh ? '目标收益' : 'Target Yield', value: fieldValue('Target Yield'), source: zh ? '邮件第 4 行' : 'Email line 4', status: 'verified' },
  ]

  return (
    <div className="need-review-workspace">
      <Panel className="review-summary-banner">
        <span className="review-summary-icon"><ShieldCheck size={17} /></span>
        <strong>{zh ? '核对 AI 提取结果' : 'Review AI extraction'}</strong>
        <span>·</span><span>{zh ? '6 项已核实（含 1 项来自 CRM 档案）' : '6 verified (1 from CRM profile)'}</span><span>·</span><span>{zh ? '1 项缺失' : '1 missing'}</span><span>·</span>
        <span>{zh ? '确认后交由结构设计' : 'Confirm to hand off to Structuring'}</span>
      </Panel>

      <div className="need-review-grid">
        <Panel className="review-source-column">
          <div className="review-column-label">1. &nbsp;{zh ? '客户原始邮件' : 'Source Email (From Client)'}</div>
          <div className="review-email-card">
            <div className="review-email-sender">
              <span className="client-avatar">MC</span>
              <span><strong>Mr. Chan</strong><small>{zh ? '收件人' : 'To'}: &nbsp;Alice (RM)</small></span>
              <time>14:02</time>
            </div>
            <div className="review-email-subject">Tencent FCN idea</div>
            <div className={`review-email-body${pulseTarget?.side === 'source' && pulseTarget.key === 'liquidity' ? ' missing-evidence-pulse' : ''}`} id="source-email-body">
              <p>Hi Alice,</p>
              <p>We are interested in a <mark id="source-evidence-horizon" className={sourceClass('horizon', 'green')} role="button" tabIndex={0} aria-controls="field-evidence-horizon" aria-pressed={linkedKey === 'horizon'} onClick={() => activateEvidence('horizon', 'source')} onKeyDown={(event) => evidenceKeyDown(event, 'horizon', 'source')}>6-month</mark> FCN linked to <mark id="source-evidence-underlying" className={sourceClass('underlying', 'blue')} role="button" tabIndex={0} aria-controls="field-evidence-underlying" aria-pressed={linkedKey === 'underlying'} onClick={() => activateEvidence('underlying', 'source')} onKeyDown={(event) => evidenceKeyDown(event, 'underlying', 'source')}>Tencent (0700.HK)</mark>.</p>
              <p>Notional around <mark id="source-evidence-notional" className={sourceClass('notional', 'purple')} role="button" tabIndex={0} aria-controls="field-evidence-notional" aria-pressed={linkedKey === 'notional'} onClick={() => activateEvidence('notional', 'source')} onKeyDown={(event) => evidenceKeyDown(event, 'notional', 'source')}>USD 1 million</mark>.</p>
              <p>We are targeting a return of <mark id="source-evidence-target" className={sourceClass('target', 'orange')} role="button" tabIndex={0} aria-controls="field-evidence-target" aria-pressed={linkedKey === 'target'} onClick={() => activateEvidence('target', 'source')} onKeyDown={(event) => evidenceKeyDown(event, 'target', 'source')}>above 10% p.a.</mark>.</p>
              <p>Our risk tolerance is <mark id="source-evidence-risk" className={sourceClass('risk', 'blue')} role="button" tabIndex={0} aria-controls="field-evidence-risk" aria-pressed={linkedKey === 'risk'} onClick={() => activateEvidence('risk', 'source')} onKeyDown={(event) => evidenceKeyDown(event, 'risk', 'source')}>moderate</mark>.</p>
              <p>We are <mark id="source-evidence-view" className={sourceClass('view', 'green')} role="button" tabIndex={0} aria-controls="field-evidence-view" aria-pressed={linkedKey === 'view'} onClick={() => activateEvidence('view', 'source')} onKeyDown={(event) => evidenceKeyDown(event, 'view', 'source')}>bullish</mark> on Tencent over the next 6 months.</p>
              <p><mark className="orange">Please propose a suitable structure and share indicative terms.</mark></p>
              <p>Best regards,<br />Mr. Chan</p>
              {linkedKey === 'liquidity' ? <div className="source-missing-evidence"><CircleAlert size={13} /><span>{zh ? '原始邮件中未找到流动性偏好的依据。' : 'No source evidence found for Liquidity Preference.'}</span></div> : null}
              {linkedKey === 'suitability' ? <div className="source-missing-evidence"><CheckCircle2 size={13} /><span>{zh ? '该字段来自 CRM 客户档案，非邮件提取；下单前将再次校验适当性。' : 'This field comes from the CRM client profile, not the email; suitability is re-checked before execution.'}</span></div> : null}
            </div>
            <div className="review-email-foot"><Mail size={13} /><span>{zh ? '邮件 · 14:02 收到' : 'Email · Received 14:02'}</span><span>{zh ? '来源 ID' : 'Source ID'}: email-20250516-1402</span></div>
          </div>
        </Panel>

        <Panel className="review-extraction-column">
          <div className="review-column-label">2. &nbsp;{zh ? 'AI 提取的客户需求摘要（草稿）' : 'AI Extracted Client Need Brief (Draft)'}</div>
          <div className="review-brief-head"><strong>{zh ? '客户需求摘要' : 'Client Need Brief'}</strong><Button variant="ghost" icon={PenLine}>{zh ? '编辑草稿' : 'Edit Draft'}</Button></div>
          <div className="review-field-grid">
            {extracted.map((field) => (
              <div
                id={`field-evidence-${field.key}`}
                className={`review-field${linkedKey === field.key ? ' selected linked-active' : ''}${field.status === 'missing' ? ' missing' : ''}${pulseTarget?.side === 'field' && pulseTarget.key === field.key ? ' evidence-pulse' : ''}`}
                key={field.label}
                role="button"
                tabIndex={0}
                aria-controls={field.status === 'verified' ? `source-evidence-${field.key}` : 'source-email-body'}
                aria-pressed={linkedKey === field.key}
                onClick={() => activateEvidence(field.key, 'field')}
                onKeyDown={(event) => evidenceKeyDown(event, field.key, 'field')}
              >
                <div className="review-field-main"><span>{field.label}</span><strong>{field.value}</strong>{field.status === 'verified' ? <CheckCircle2 size={13} /> : <CircleAlert size={14} />}</div>
                <div className="review-field-source">
                  <span>{field.status === 'verified' ? zh ? '高置信度' : 'High confidence' : zh ? '信息缺失' : 'Missing information'}</span>
                  <span>·</span><span>{field.source}</span>{field.source !== '—' ? <ExternalLink size={11} /> : null}
                </div>
                {field.status === 'missing' ? (
                  <div className="missing-field-actions"><MessageSquare size={13} /><span>{zh ? '邮件中未提供流动性信息。' : 'Liquidity details not provided in email.'}</span><Button onClick={(event) => { event.stopPropagation(); store.addClarification() }}>{zh ? '询问客户' : 'Ask client'}</Button><Button onClick={(event) => { event.stopPropagation(); store.addClarification() }}>{zh ? '接受缺失' : 'Accept gap'}</Button></div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="review-verification-summary">
            <span><CheckCircle2 size={14} />{zh ? '6 项已核实' : '6 verified'}</span>
            <span className="missing"><CircleAlert size={14} />{zh ? '1 项缺失' : '1 missing'}</span>
            <span className="muted"><CheckCircle2 size={14} />{zh ? '适当性预检通过（FCN·R4 ≤ C4）' : 'Suitability pre-check passed (FCN·R4 ≤ C4)'}</span>
          </div>
        </Panel>
      </div>

      <Panel className="need-review-actions">
        <Button icon={PenLine} onClick={() => store.addClarification()}>{zh ? '编辑草稿' : 'Edit Draft'}</Button>
        <Button icon={MessageSquare} onClick={() => store.addClarification()}>{zh ? '请求澄清' : 'Ask for Clarification'}</Button>
        <Button variant="primary" icon={ShieldCheck} className="need-primary" disabled={role !== 'rm'} onClick={confirmNeed}>
          <span><strong>{zh ? '确认客户需求' : 'Confirm Client Need'}</strong><small>{zh ? '批准该客户需求并继续流程' : 'Approve this client need to proceed'}</small></span>
        </Button>
      </Panel>
    </div>
  )
}

// ── 8.1 Client Need Brief ────────────────────────────────────────────────
function NeedBrief({ artifact, role }: { artifact: Artifact; role: RoleKey }) {
  const { truth, clarified } = useEngine()
  if (artifact.data.type !== 'needBrief') return null
  const d = artifact.data
  const editable = artifact.status !== 'APPROVED' && truth.status === 'CLIENT_NEED_DRAFT'
  return (
    <ArtifactFrame
      artifact={artifact}
      sourceRef={d.sourceRef}
      summary="0700.HK · USD 1M · ~6M · >10%"
      actions={
        editable ? (
          <>
            <ActionBtn
              label="补充说明"
              kind="ghost"
              allowed={['rm']}
              role={role}
              onClick={() => store.addClarification()}
              disabledReason={clarified ? '已补充' : undefined}
            />
            <ActionBtn
              label="确认客户需求"
              kind="primary"
              allowed={FCN_WORKFLOW.confirmNeed.allowedRoles}
              role={role}
              onClick={() =>
                confirmThen({
                  key: 'confirmNeed',
                  title: '确认客户需求 Confirm Client Need',
                  summary: [
                    'Underlying: Tencent / 0700.HK',
                    'Notional: USD 1,000,000',
                    'Horizon: ~6M · Target Yield: >10%',
                    'Risk Tolerance: Moderate',
                  ],
                  consequence: clarified
                    ? '确认后客户需求将成为 Approved 状态，Case 交给 David（产品专家）设计结构。'
                    : '仍有缺失项（流动性偏好）。确认即表示接受缺失项。Case 将交给 David（产品专家）设计结构。',
                  confirmLabel: '确认客户需求',
                })
              }
            />
          </>
        ) : undefined
      }
    >
      <div className="extraction-layout">
        <EvidencePanel title="Client email" meta="Mr. Chan · 14:02 · Subject: Tencent idea">
          Hi Alice, I have around <mark>USD 1 million</mark> to invest. I remain positive on <mark>Tencent</mark> and would
          consider something around <mark>6 months</mark>, targeting <mark>more than 10% p.a.</mark> I can accept
          <mark> moderate downside risk</mark>. Please let me know what may work.
        </EvidencePanel>
        <Panel className="extracted-fields-panel">
          <div className="extracted-fields-head">
            <span><Sparkles size={14} />AI extracted client need</span>
            <Tag tone="success">6 fields verified</Tag>
          </div>
          <Fields rows={d.fields} />
        </Panel>
      </div>
      {d.missing.length > 0 && (
        <div className="inline-alert warning">
          <AlertTriangle size={15} />
          <span>
            <b>缺失信息：</b>
            {d.missing.join('、')} — AI 标记，可补充说明或在确认时接受缺失。
          </span>
        </div>
      )}
    </ArtifactFrame>
  )
}

// ── 8.2 Structure Proposal ───────────────────────────────────────────────
function StructureProposal({ artifact, role }: { artifact: Artifact; role: RoleKey }) {
  const { truth, kiModified } = useEngine()
  if (artifact.data.type !== 'structureProposal') return null
  const d = artifact.data
  const reviewable =
    artifact.status === 'PENDING APPROVAL' &&
    ['STRUCTURE_REVIEW', 'STRUCTURE_MODIFICATION_REQUIRED'].includes(truth.status)
  const selected = d.options.find((o) => o.optionId === d.selectedId)
  return (
    <ArtifactFrame
      artifact={artifact}
      sourceRef="Approved Client Need · 14:08"
      summary={selected ? `${selected.label} · ${selected.strike}/${selected.knockIn} · ${selected.couponTarget}` : undefined}
      actions={
        reviewable ? (
          <>
            {!kiModified && (
              <ActionBtn label="调整 KI 70% → 65%" kind="secondary" allowed={['ps']} role={role} onClick={() => store.modifyKI()} />
            )}
            <ActionBtn
              label="审批结构"
              kind="primary"
              allowed={FCN_WORKFLOW.approveStructure.allowedRoles}
              role={role}
              onClick={() =>
                confirmThen({
                  key: 'approveStructure',
                  title: '审批结构 Approve Structure',
                  summary: [
                    `${selected?.label ?? ''} · ${selected?.productType} ${selected?.tenor}`,
                    `Strike: ${selected?.strike} · KI: ${selected?.knockIn}`,
                    `Autocall: ${selected?.autocall}`,
                    `Coupon 目标: ${selected?.couponTarget}`,
                  ],
                  consequence: '确认后结构成为 Approved Terms，AI 将起草 RFQ包，Case 交给 Ken（Dealer）复核询价。',
                  confirmLabel: '审批结构',
                })
              }
            />
          </>
        ) : undefined
      }
    >
      <div className="artifact-insight">
        <Sparkles size={15} />
        <span><strong>AI prepared 3 comparable structures</strong>{d.comparisonNote}</span>
        <Tag tone="ai">Decision support</Tag>
      </div>
      {truth.status === 'STRUCTURE_MODIFICATION_REQUIRED' && (
        <div className="inline-alert warning">
          <span className="ic">⚠</span>
          <span>
            <b>已退回修改：</b>请调整参数后重新审批。
          </span>
        </div>
      )}
      <div className="opt-list">
        {d.options.map((o) => (
          <button
            key={o.optionId}
            className={`opt${d.selectedId === o.optionId ? ' selected' : ''}`}
            disabled={!reviewable || role !== 'ps'}
            onClick={() => store.selectOption(o.optionId)}
          >
            <span className="opt-head">
              <span className="radio" />
              <span className="oname">{o.label}</span>
              {d.recommendedId === o.optionId && <span className="rec">AI 建议比较起点</span>}
            </span>
            <span className="opt-params">
              <span>
                {o.productType} <b>{o.tenor}</b>
              </span>
              <span>
                Strike <b>{o.strike}</b>
              </span>
              <span>
                KI <b>{o.knockIn}</b>
              </span>
              <span>
                Coupon <b>{o.couponTarget}</b>
              </span>
            </span>
            <span className="opt-rationale">{o.rationale}</span>
            <span className="opt-risks">
              {o.risks.map((r) => (
                <span className="risk-chip" key={r}>
                  {r}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>
      {d.modifiedNote && (
        <div className="inline-alert warning">
          <span className="ic">✎</span>
          <span>{d.modifiedNote}</span>
        </div>
      )}
    </ArtifactFrame>
  )
}

// ── 8.3 RFQ Package ──────────────────────────────────────────────────────
function RFQPackage({ artifact, role }: { artifact: Artifact; role: RoleKey }) {
  const { truth } = useEngine()
  if (artifact.data.type !== 'rfqPackage') return null
  const d = artifact.data
  const reviewable = artifact.status === 'PENDING REVIEW' && truth.status === 'RFQ_READY'
  const fv = (label: string) => d.fields.find((f) => f.label === label)?.value ?? '—'
  return (
    <ArtifactFrame
      artifact={artifact}
      sourceRef="Approved Structure · 14:15"
      summary={`FCN · ${fv('Strike')}/${fv('Knock-In')} · ${d.issuers.length} 家发行商`}
      actions={
        reviewable ? (
          <>
            <ActionBtn
              label="退回修改"
              kind="danger-ghost"
              allowed={FCN_WORKFLOW.returnRFQ.allowedRoles}
              role={role}
              onClick={() =>
                confirmThen({
                  key: 'returnRFQ',
                  title: '退回修改 Return for Modification',
                  summary: ['RFQ Package 将标记为 Superseded', 'Case 交回 David（产品专家）修改结构'],
                  consequence: '这是正常的业务回路：Dealer 认为结构参数需要调整时，退回产品专家修改后重新审批。',
                  confirmLabel: '退回产品专家',
                  danger: true,
                })
              }
            />
            <ActionBtn
              label="接受询价请求"
              kind="primary"
              allowed={FCN_WORKFLOW.acceptPricing.allowedRoles}
              role={role}
              onClick={() =>
                confirmThen({
                  key: 'acceptPricing',
                  title: '接受询价请求 Accept Pricing Request',
                  summary: [
                    `FCN · 0700.HK · USD 1M · ${fv('Tenor')}`,
                    `Strike ${fv('Strike')} · KI ${fv('Knock-In')}`,
                    `发送至：${d.issuers.join(' · ')}`,
                  ],
                  consequence: '确认后将通过既有外部渠道向 5 家发行商发送询价，Case 进入定价阶段。',
                  confirmLabel: '接受并发送询价',
                })
              }
            />
          </>
        ) : undefined
      }
    >
      <div className="package-readiness">
        <span><ShieldCheck size={16} /><strong>RFQ package ready for dealer review</strong></span>
        <span>{d.issuers.length} issuers selected · critical terms aligned with approved structure</span>
      </div>
      <Fields rows={d.fields} />
      <div>
        <div className="cq-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          Issuer List · 询价对象
        </div>
        <div className="issuer-chips">
          {d.issuers.map((i) => (
            <span className="ichip" key={i}>
              {i}
            </span>
          ))}
        </div>
      </div>
      <div className="check-list">
        {d.checks.map((c) => (
          <span className="chk" key={c.label}>
            {c.label}
          </span>
        ))}
      </div>
    </ArtifactFrame>
  )
}

// ── 8.4 Quote Matrix ─────────────────────────────────────────────────────
function QuoteMatrix({ artifact, role }: { artifact: Artifact; role: RoleKey }) {
  const { truth, now } = useEngine()
  if (artifact.data.type !== 'quoteMatrix') return null
  const d = artifact.data
  const actionable = artifact.status === 'ACTIVE' && truth.status === 'PRICING_IN_PROGRESS'
  const comparable = d.quotes.filter((q) => q.comparable)
  const others = d.quotes.filter((q) => !q.comparable)
  const best = comparable.find((q) => q.best) ?? comparable[0]
  const bnp = others.find((q) => q.coupon !== null)
  const approvedKI = truth.approvedTerms?.find((t) => t.label === 'KI')?.value ?? best?.ki ?? '—'
  return (
    <ArtifactFrame
      artifact={artifact}
      sourceRef="原始报价 · JPM / GS / MS / BNP"
      summary={best ? `最优 ${best.issuer} ${best.coupon?.toFixed(2)}% · ${comparable.length} 可比${bnp ? ' · 1 不可比' : ''}` : undefined}
      actions={
        actionable ? (
          <>
            <ActionBtn
              label="修改结构"
              kind="ghost"
              allowed={FCN_WORKFLOW.modifyFromPricing.allowedRoles}
              role={role}
              onClick={() =>
                confirmThen({
                  key: 'modifyFromPricing',
                  title: '修改结构 Modify Structure',
                  summary: ['当前报价矩阵将标记为 Stale', 'Case 交回 David（产品专家）修改结构'],
                  consequence: '适用于市场反馈显示原结构经济性不足的情况。修改后需重新生成 RFQ 并询价。',
                  confirmLabel: '退回修改结构',
                  danger: true,
                })
              }
            />
            <ActionBtn
              label="请求重报"
              kind="secondary"
              allowed={FCN_WORKFLOW.requestRequote.allowedRoles}
              role={role}
              onClick={() =>
                confirmThen({
                  key: 'requestRequote',
                  title: '请求重报 Request Requote',
                  summary: ['向全部发行商请求新一轮报价', '现有报价矩阵将标记为 Stale'],
                  consequence: '适用于报价过期、报价不足或市场移动的情况。',
                  confirmLabel: '请求重报',
                })
              }
            />
            <ActionBtn
              label="准备客户报价"
              kind="primary"
              allowed={FCN_WORKFLOW.prepareClientQuote.allowedRoles}
              role={role}
              onClick={() =>
                confirmThen({
                  key: 'prepareClientQuote',
                  title: '准备客户报价 Prepare Client Quote',
                  summary: [
                    `选定：${best?.issuer ?? 'Morgan Stanley'} · Coupon ${best?.coupon?.toFixed(2)}%`,
                    `Strike ${best?.strike} · KI ${best?.ki} · ${best?.tenor}`,
                  ],
                  consequence: '确认后 AI 将生成面向客户的报价卡，Case 交给 Alice（RM）与客户沟通。',
                  confirmLabel: '准备客户报价',
                })
              }
            />
          </>
        ) : undefined
      }
    >
      <div className="market-overview">
        <div><span>Market response</span><strong>{d.quotes.filter((quote) => quote.coupon !== null).length} / {d.quotes.length} issuers</strong></div>
        <div><span>Best comparable</span><strong>{best?.issuer} · {best?.coupon?.toFixed(2)}%</strong></div>
        <div><span>Freshness</span><strong>{d.freshnessNote}</strong></div>
        <div className="market-recommendation"><Sparkles size={15} /><span><strong>AI recommendation</strong>{d.bestNote}</span></div>
      </div>
      <div className="qm-wrap">
        <table>
          <thead>
            <tr>
              <th>Issuer</th>
              <th>Coupon</th>
              <th>Strike</th>
              <th>KI</th>
              <th>Validity</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {comparable.map((q) => (
              <tr key={q.id} className={q.best ? 'best' : ''}>
                <td className="issuer">{q.issuer}</td>
                <td className="num">{q.coupon?.toFixed(2)}%</td>
                <td className="num">{q.strike}</td>
                <td className="num">{q.ki}</td>
                <td>
                  <Countdown until={q.expiresAt} now={now} />
                </td>
                <td>{q.best ? <span className="badge success">Best comparable</span> : <span className="badge neutral">Comparable</span>}</td>
              </tr>
            ))}
            <tr className="qm-divider">
              <td colSpan={6}>以下报价条款不可比或未回复 — 即使 coupon 更高，也不能直接用于客户报价</td>
            </tr>
            {others.map((q) => (
              <tr key={q.id} className={q.coupon === null ? 'noreply' : 'noncomp'}>
                <td className="issuer">{q.issuer}</td>
                <td className="num">{q.coupon === null ? '—' : `${q.coupon.toFixed(2)}%`}</td>
                <td className="num">{q.coupon === null ? '—' : q.strike}</td>
                <td className="num">
                  {q.ki}
                  {q.differences.length > 0 && <span className="diff"> ≠ {approvedKI}</span>}
                </td>
                <td>{q.expiresAt ? <Countdown until={q.expiresAt} now={now} /> : '—'}</td>
                <td>
                  {q.coupon === null ? (
                    <span className="badge neutral">未回复</span>
                  ) : (
                    <span className="badge warning">Different terms</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {bnp && (
        <div className="inline-alert warning">
          <span className="ic">⚠</span>
          <span>
            <b>{bnp.issuer} 条款不可比：</b>KI {bnp.ki} ≠ approved {approvedKI}。可选动作：排除该报价 · 修改结构 · 请求重报。
          </span>
        </div>
      )}
    </ArtifactFrame>
  )
}

// ── 8.5 Client Quote Card ────────────────────────────────────────────────
function ClientQuote({ artifact, role }: { artifact: Artifact; role: RoleKey }) {
  const { truth, now } = useEngine()
  if (artifact.data.type !== 'clientQuote') return null
  const d = artifact.data
  const sendable = artifact.status === 'PENDING REVIEW' && truth.status === 'CLIENT_QUOTE_READY'
  const tv = (label: string) => d.terms.find((t) => t.label === label)?.value ?? '—'
  return (
    <ArtifactFrame
      artifact={artifact}
      sourceRef="Quote Matrix · MS 最优可比报价"
      summary={`${d.issuer} · ${tv('Coupon').split(' ')[0]} · ${tv('Strike')}/${tv('Knock-In')}`}
      actions={
        sendable ? (
          <ActionBtn
            label="发送给客户"
            kind="primary"
            allowed={FCN_WORKFLOW.sendClientQuote.allowedRoles}
            role={role}
            onClick={() =>
              confirmThen({
                key: 'sendClientQuote',
                title: '与客户沟通报价 Communicate Quote',
                summary: [`${d.issuer} · Coupon ${tv('Coupon')}`, `FCN 0700.HK · 6M · Strike ${tv('Strike')} · KI ${tv('Knock-In')}`],
                consequence: '报价内容由 RM 复核后发出（AI 不会自动对外）。发送后 Case 进入等待客户状态。',
                confirmLabel: '确认已复核并发送',
              })
            }
          />
        ) : undefined
      }
    >
      <div className="quote-validity-band">
        <div><Clock3 size={15} /><span>Client quote validity</span></div>
        <Countdown until={d.validityUntil} now={now} />
        <span>Terms remain subject to issuer confirmation until execution.</span>
      </div>
      <Fields rows={d.terms} />
      <div className="client-quote-layout">
        <Panel className="client-facing-preview">
          <div className="cq-label">Client-facing quote summary</div>
          <h3>Tencent 6M Fixed Coupon Note</h3>
          <div className="client-coupon">{tv('Coupon').split(' ')[0]} <span>p.a.</span></div>
          <p>{d.summary}</p>
          <div className="cq-risk">
            <b>Risk explanation</b>
            <span>{d.riskSummary}</span>
          </div>
        </Panel>
        <Panel className="client-message-draft">
          <div className="cq-label">Draft client message · RM review</div>
          <p>Hi Mr. Chan, we have obtained an indicative quote for the Tencent idea discussed. The proposed coupon is {tv('Coupon').split(' ')[0]} p.a. for a 6-month FCN, with Strike {tv('Strike')} and Knock-In {tv('Knock-In')}.</p>
          <p>Please note that capital is at risk if Tencent falls below the knock-in level, and final execution remains subject to a live quote.</p>
        </Panel>
      </div>
      <div className="fgrid">
        <span className="fl">内部备注</span>
        <span className="fv" style={{ fontWeight: 400, color: 'var(--text-2)' }}>
          {d.internalNote}
        </span>
      </div>
    </ArtifactFrame>
  )
}

// ── 8.6 Client Instruction Card ──────────────────────────────────────────
function InstructionCard({ artifact, role }: { artifact: Artifact; role: RoleKey }) {
  const { truth, artifacts, now } = useEngine()
  if (artifact.data.type !== 'instruction') return null
  const d = artifact.data
  const confirmable = artifact.status === 'PENDING CONFIRMATION' && truth.status === 'CLIENT_INSTRUCTION_PENDING_CONFIRMATION'
  const iv = (label: string) => d.terms.find((t) => t.label === label)?.value ?? '—'
  return (
    <ArtifactFrame
      artifact={artifact}
      sourceRef={d.sourceRef}
      summary={`${d.intent} · ${iv('Issuer')} · ${iv('Notional')}`}
      actions={
        confirmable ? (
          <>
            <ActionBtn
              label="驳回"
              kind="danger-ghost"
              allowed={FCN_WORKFLOW.rejectInstruction.allowedRoles}
              role={role}
              onClick={() =>
                confirmThen({
                  key: 'rejectInstruction',
                  title: '驳回 AI 识别结果',
                  summary: ['该指令卡将标记为无效', 'Case 回到等待客户状态'],
                  consequence: '适用于 AI 识别有误或客户意图不明确的情况。',
                  confirmLabel: '驳回',
                  danger: true,
                })
              }
            />
            <ActionBtn
              label="确认客户指令"
              kind="primary"
              allowed={FCN_WORKFLOW.confirmInstruction.allowedRoles}
              role={role}
              onClick={() =>
                confirmThen({
                  key: 'confirmInstruction',
                  title: '确认正式客户指令 Confirm Client Instruction',
                  summary: [
                    `Issuer: ${iv('Issuer')}`,
                    `${iv('Product')} · ${iv('Notional')}`,
                    `Strike / KI ${iv('Strike / KI')} · ${iv('Timing')}`,
                  ],
                  consequence: '确认后将创建正式客户指令（audit 记录 actor 与时间），Case 交给 Ken（Dealer），执行前 AI 将检查报价时效。',
                  confirmLabel: '确认客户指令',
                })
              }
            />
          </>
        ) : undefined
      }
    >
      <div className="instruction-detection-banner">
        <span className="detection-icon"><Sparkles size={16} /></span>
        <span><strong>Possible formal client instruction detected</strong>AI confidence {d.confidence}. RM confirmation is required before an execution ticket can be created.</span>
        <Tag tone="warning">Pending confirmation</Tag>
      </div>
      <div className="instruction-layout">
        <EvidencePanel title="Client reply" meta="Mr. Chan · 14:36 · Re: Tencent FCN quote">
          Thanks Alice. <mark>Yes, please proceed with Morgan Stanley</mark> for <mark>USD 1,000,000</mark> on the terms shared.
          Please <mark>execute today</mark> and confirm once done.
        </EvidencePanel>
        <Panel className="instruction-summary-panel">
          <div className="extracted-fields-head"><span><ShieldCheck size={14} />Instruction summary</span><Tag tone="success">Evidence linked</Tag></div>
          <Fields rows={[{ label: 'Detected Intent', value: d.intent }, ...d.terms]} />
        </Panel>
      </div>
      {(() => {
        const quote = Object.values(artifacts).find((item) => item.data.type === 'clientQuote')
        const validUntil = quote?.data.type === 'clientQuote' ? quote.data.validityUntil : null
        return (
          <div className="freshness-check">
            <Clock3 size={15} />
            <span><strong>Quote freshness check</strong>Issuer quote must still be valid at execution. Current indication:</span>
            <Countdown until={validUntil} now={now} />
          </div>
        )
      })()}
    </ArtifactFrame>
  )
}

// ── 8.7 Execution Ticket ─────────────────────────────────────────────────
function ExecutionTicket({ artifact, role }: { artifact: Artifact; role: RoleKey }) {
  const { truth, now } = useEngine()
  if (artifact.data.type !== 'executionTicket') return null
  const d = artifact.data
  const executable = artifact.status === 'DRAFT' && truth.status === 'EXECUTION_READY'
  const ev = (label: string) => d.fields.find((f) => f.label === label)?.value ?? '—'
  return (
    <ArtifactFrame
      artifact={artifact}
      sourceRef="已确认客户指令 · 14:38 + MS 最终价 · 14:41"
      summary={`${ev('Issuer')} · ${ev('Coupon (Final)').split(' ')[0]} · ${ev('Strike')}/${ev('Knock-In')}`}
      actions={
        executable ? (
          <ActionBtn
            label="确认并执行"
            kind="primary"
            allowed={FCN_WORKFLOW.executeTrade.allowedRoles}
            role={role}
            onClick={() =>
              confirmThen({
                key: 'executeTrade',
                title: '确认并执行 Confirm & Execute',
                summary: [
                  `${ev('Issuer')} · FCN 0700.HK`,
                  `${ev('Notional')} · ${ev('Tenor')}`,
                  `Strike ${ev('Strike')} · KI ${ev('Knock-In')} · Coupon ${ev('Coupon (Final)')}`,
                  `Settlement ${ev('Settlement')}`,
                ],
                consequence: '这是正式执行动作，将按 MS 最终价格成交并生成 audit 记录。执行后等待条款书校验。',
                confirmLabel: '确认并执行',
              })
            }
          />
        ) : undefined
      }
    >
      <div className="execution-validity">
        <span><CheckCircle2 size={16} /><strong>Quote still valid</strong>Live Morgan Stanley quote received at {d.quoteTime}</span>
        <Countdown until={d.validityUntil} now={now} />
      </div>
      <Fields rows={d.fields} />
      <div className="fgrid">
        <span className="fl">Quote Timestamp</span>
        <span className="fv num">{d.quoteTime}</span>
        <span className="fl">价格有效期</span>
        <span className="fv num">
          <Countdown until={d.validityUntil} now={now} />
        </span>
      </div>
      <p className="ai-note">
        <span className="ai-verb">AI 已校验</span>
        {d.note}
      </p>
      <div className="pretrade-checks">
        <div><CheckCircle2 size={15} /><span><strong>Client instruction</strong>Confirmed by Alice · RM</span></div>
        <div><CheckCircle2 size={15} /><span><strong>Terms alignment</strong>Ticket matches approved structure</span></div>
        <div><CheckCircle2 size={15} /><span><strong>Operational readiness</strong>Settlement and booking fields complete</span></div>
      </div>
    </ArtifactFrame>
  )
}

// ── 8.8 Termsheet Validation ─────────────────────────────────────────────
function TermsheetValidation({ artifact, role }: { artifact: Artifact; role: RoleKey }) {
  const { truth } = useEngine()
  if (artifact.data.type !== 'termsheetValidation') return null
  const d = artifact.data
  const reviewable = artifact.status === 'PENDING APPROVAL' && truth.status === 'TERMSHEET_REVIEW'
  const inException = artifact.status === 'EXCEPTION' && truth.status === 'EXCEPTION'
  const mismatches = d.rows.filter((r) => r.status !== 'match').length
  return (
    <ArtifactFrame
      artifact={artifact}
      sourceRef="Execution Ticket · 14:41 + MS Final Termsheet · 14:52"
      summary={`${d.rows.length} 字段比对 · ${mismatches === 0 ? '全部一致' : `${mismatches} 项差异`}`}
      actions={
        reviewable ? (
          mismatches > 0 ? (
            <>
              <ActionBtn label="Review AI assessment" kind="ghost" allowed={['rm', 'ops', 'dealer']} role={role} onClick={() => store.openDrawer({ type: 'source', payload: CLIENT_SOURCE_BODY['art-inst'] })} />
              <ActionBtn
                label="Request Corrected Term Sheet"
                kind="primary"
                allowed={FCN_WORKFLOW.raiseException.allowedRoles}
                role={role}
                onClick={() =>
                  confirmThen({
                    key: 'raiseException',
                    title: 'Request Corrected Term Sheet',
                    summary: ['Classification: Documentation Error', 'Mismatch: Settlement T+2（执行单）≠ T+3（条款书）', 'Owner: Morgan Stanley · Documentation'],
                    consequence: 'AI 判断执行记录与客户指令一致，差异来自发行商条款书。请求更正版不会触发客户重新确认；Case 将进入 Documentation Exception。',
                    confirmLabel: 'Request correction',
                    danger: true,
                  })
                }
              />
            </>
          ) : (
            <ActionBtn
              label="审批条款书"
              kind="primary"
              allowed={FCN_WORKFLOW.approveTermsheet.allowedRoles}
              role={role}
              onClick={() =>
                confirmThen({
                  key: 'approveTermsheet',
                  title: '审批条款书 Approve Termsheet',
                  summary: ['全部字段与执行单一致', 'Notional / Strike / KI / Coupon / Settlement ✓'],
                  consequence: '审批后 Case 完成（COMPLETED），全流程 audit 记录可在 History 查看。',
                  confirmLabel: '审批条款书',
                })
              }
            />
          )
        ) : inException ? (
          <ActionBtn
            label="已与 MS 核实 · 恢复审批"
            kind="secondary"
            allowed={FCN_WORKFLOW.resolveException.allowedRoles}
            role={role}
            onClick={() =>
              confirmThen({
                key: 'resolveException',
                title: '标记异常已解决',
                summary: ['MS 确认条款书笔误：正确结算日为 T+2', '更正后的条款书已重发'],
                consequence: 'Case 将回到条款书待审批状态，由簿记 / 核对重新审批。',
                confirmLabel: '标记已解决',
              })
            }
          />
        ) : undefined
      }
    >
      <div className="exception-assessment">
        <div className="assessment-head">
          <span className="assessment-icon"><Route size={17} /></span>
          <span><strong>AI Exception Assessment</strong>Compared Client Instruction, Execution Record and Issuer Term Sheet</span>
          <Tag tone="warning">Review required</Tag>
        </div>
        <div className="assessment-grid">
          <div><span>Classification</span><strong>Documentation Error</strong></div>
          <div><span>Severity</span><strong>Medium</strong></div>
          <div><span>Root Cause</span><strong>Issuer term sheet differs from executed settlement</strong></div>
          <div><span>Owner</span><strong>MS Documentation / Trade Support</strong></div>
          <div><span>Client Impact</span><strong>None if corrected before release</strong></div>
          <div><span>Client Reconfirmation Required</span><strong>No</strong></div>
        </div>
        <div className="recommended-route"><strong>Recommended Action</strong><span>Request a corrected term sheet and re-run validation on receipt.</span></div>
      </div>
      <div className="validation-layout">
        <div className="tv-wrap">
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Execution Ticket</th>
                <th>Term Sheet</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.field} className={r.status !== 'match' ? 'warning' : ''}>
                  <td className="fieldname">{r.field}</td>
                  <td>{r.ticket}</td>
                  <td>{r.termsheet}</td>
                  <td><span className={`st ${r.status}`}>{r.status === 'match' ? '✓ Match' : '⚠ Mismatch'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Panel className="term-sheet-preview">
          <div className="document-preview-head"><FileText size={14} />MS Final Term Sheet <Tag>PDF · 14:52</Tag></div>
          <div className="document-paper">
            <strong>FINAL TERMS AND CONDITIONS</strong>
            <span>Issuer: Morgan Stanley</span><span>Underlying: Tencent Holdings 0700.HK</span><span>Notional: USD 1,000,000</span>
            <span>Strike: 80%</span><span>Knock-In: 70%</span><span>Coupon: 10.15% p.a.</span>
            <span className="document-mismatch">Settlement: T+3</span>
          </div>
        </Panel>
      </div>
    </ArtifactFrame>
  )
}

// ── Dispatcher ───────────────────────────────────────────────────────────
export function ArtifactCard({ artifactId }: { artifactId: string }) {
  const { artifacts, role } = useEngine()
  const artifact = artifacts[artifactId]
  if (!artifact) return null
  switch (artifact.data.type) {
    case 'needBrief':
      return <NeedBrief artifact={artifact} role={role} />
    case 'structureProposal':
      return <StructureProposal artifact={artifact} role={role} />
    case 'rfqPackage':
      return <RFQPackage artifact={artifact} role={role} />
    case 'quoteMatrix':
      return <QuoteMatrix artifact={artifact} role={role} />
    case 'clientQuote':
      return <ClientQuote artifact={artifact} role={role} />
    case 'instruction':
      return <InstructionCard artifact={artifact} role={role} />
    case 'executionTicket':
      return <ExecutionTicket artifact={artifact} role={role} />
    case 'termsheetValidation':
      return <TermsheetValidation artifact={artifact} role={role} />
  }
}
