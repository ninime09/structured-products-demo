import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileText,
  Mail,
  MessageSquare,
  PenLine,
  Route,
  ShieldCheck,
  Sparkles,
  Undo2,
} from 'lucide-react'
import { store, useEngine } from '../hooks'
import { FCN_WORKFLOW } from '../config/fcn-pack/workflow'
import { buildNeedFields, originLabel } from '../config/fcn-pack/need-view'
import { POLICIES } from '../config/fcn-pack/policies'
import { fieldLabel } from '../config/fcn-pack/field-labels'
import type { Artifact, RoleKey } from '../types'
import { Button, Panel, Tag } from './primitives'
import { confirmThen } from './confirm'
import { ActionBtn, StatusBadge, Validity } from './ui'
import { SourceReviewWorkspace } from './SourceReview'
import type { SourceDoc } from './SourceReview'

// Statuses that mean "this card is settled history" — collapsed by default
// so the active artifact stays the visual protagonist of the room.
const SETTLED = new Set(['APPROVED', 'ACCEPTED', 'SUPERSEDED', 'STALE', 'SENT', 'EXECUTED', 'CONFIRMED', 'VALIDATED', 'EXPIRED'])

// 客户那封原始邮件。正文以前是一句一句手打在 JSX 里的，每个可点高亮还要手写
// id 和一堆 aria——换第二封邮件就得整段重抄。现在是数据：段落里夹证据片段，
// 片段的 key 对上右侧字段，联动由 SourceReviewWorkspace 统一接。
const CLIENT_NEED_EMAIL = (zh: boolean): SourceDoc => ({
  senderInitials: 'MC',
  senderName: 'Mr. Chan',
  toLabel: `${zh ? '收件人' : 'To'}:  Alice (RM)`,
  time: '14:02',
  subject: 'Structured idea — USD 1m, 6 months',
  paragraphs: [
    ['Hi Alice,'],
    [
      'We are looking to deploy around ',
      { key: 'notional', text: 'USD 1 million', color: 'purple' },
      ' over roughly ',
      { key: 'horizon', text: '6 months', color: 'green' },
      '.',
    ],
    ['We are targeting a return of ', { key: 'target', text: 'above 10% p.a.', color: 'orange' }],
    [
      'Our risk tolerance is ',
      { key: 'risk', text: 'moderate', color: 'blue' },
      ' — we can take some downside, but not a full-loss structure.',
    ],
    [
      'We are ',
      { key: 'view', text: 'constructive on China internet & tech', color: 'green' },
      ', but we have not settled on a specific name.',
    ],
    [{ plain: 'Please propose what may work and share indicative terms.' }],
    ['Best regards,', { br: true }, 'Mr. Chan'],
  ],
  footLabel: <><Mail size={13} /><span>{zh ? '邮件 · 14:02 收到' : 'Email · Received 14:02'}</span></>,
  sourceIdLabel: zh ? '来源 ID' : 'Source ID',
  sourceId: 'email-20250516-1402',
  missingNotes: {
    underlying: {
      tone: 'warn',
      text: zh
        ? '客户只给了板块方向，邮件里没有具体标的——标的需要 RM 与产品专家同客户共同界定。'
        : 'The client gave a theme, not a name. The underlying must be defined jointly by RM and the product specialist with the client.',
    },
    liquidity: {
      tone: 'warn',
      text: zh ? '原始邮件中未找到流动性偏好的依据。' : 'No source evidence found for Liquidity Preference.',
    },
    suitability: {
      tone: 'ok',
      text: zh
        ? '该字段来自 CRM 客户档案，非邮件提取；下单前将再次校验适当性。'
        : 'This field comes from the CRM client profile, not the email; suitability is re-checked before execution.',
    },
  },
})

const CLIENT_SOURCE_BODY: Record<string, { title: string; body: string; meta: string }> = {
  'art-need': {
    title: 'Source Evidence',
    body: 'Hi Alice, we are looking to deploy around USD 1 million over roughly 6 months, targeting a return above 10% p.a. Our risk tolerance is moderate — we can take some downside, but not a full-loss structure. We are constructive on China internet & tech, but we have not settled on a specific name. Please propose what may work and share indicative terms.',
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
      {!collapsed && artifact.note ? (
        <div className="artifact-note">
          <PenLine size={12} />
          <span><b>附注 · {artifact.note.author}</b>{artifact.note.text}</span>
        </div>
      ) : null}
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
      <span className="fl">{fieldLabel(label)}</span>
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
        <Tag>来源证据</Tag>
      </div>
      <div className="source-evidence-meta">{meta}</div>
      <div className="source-evidence-body">{children}</div>
    </Panel>
  )
}

export function NeedReviewWorkspace() {
  const { artifacts, role, needSettled, language, participants, specialistProposalPublished, rmPushedBack, privateChats, needFieldUpdates } = useEngine()
  const zh = language === 'zh'
  const specialistJoined = participants.some((p) => p.person.role === 'ps' && !p.person.guest)
  const clientBriefDrafted = privateChats.rm.some((m) => m.draft?.kind === 'clientBrief')
  // David 私区还挂着未确认的 v3 时，RM 不能抢跑发客户
  const specialistDraftPending = privateChats.ps.some((m) => m.draft?.kind === 'specialistProposal' && !m.draft.published)
  const artifact = artifacts['art-need']
  if (!artifact || artifact.data.type !== 'needBrief') return null
  const d = artifact.data
  const fieldValue = (label: string) => d.fields.find((field) => field.label === label)?.value ?? '—'
  const confirmNeed = () =>
    confirmThen({
      key: 'confirmNeed',
      title: '确认客户需求，移交 David？',
      summary: [
        `Underlying: ${fieldValue('Underlying')}`,
        'Notional: USD 1,000,000',
        'Horizon: ~6M · Target Yield: >10%',
        'Risk Tolerance: Moderate',
      ],
      consequence: needSettled
        ? '把 Alice 与 David 共同界定的需求定为已确认，交给 David 细化成结构方案。'
        : `还有 ${unresolvedCount} 项未定（${extracted.filter((f) => f.open).map((f) => f.label).join('、')}）。确认即表示这几项留到结构阶段再定。`,
      ack: needSettled
        ? '标的与流动性是共创结论、非客户邮件原文，已与客户核对'
        : '我知道还有未定项，由我和 David 负责补齐',
      confirmLabel: '确认客户需求',
    })

  // 核对界面由 fcn-pack 的产物 schema 渲染：字段、来源、确认规则全部来自配置。
  //
  // 两维模型：来源（客户说的 / AI 推断 / 人推导 / 档案）× 确认状态。
  // 这两维不能压成一维——"客户明确说的 USD"和"我们推出来的腾讯单一标的"
  // 在责任归属上完全不同，界面上就必须看得出来。
  // 产品专家已发布方向建议 = 推导字段有了 working assumption
  const hasProposal = specialistProposalPublished
  const extracted = buildNeedFields({ needSettled, hasProposal, updates: needFieldUpdates, fields: d.fields, zh })
  const unresolvedCount = extracted.filter((f) => f.open).length
  const verifiedCount = extracted.length - unresolvedCount
  // 推导类字段还没经客户确认 = 内部 working assumption，不能进 RFQ
  const derivedPending = extracted.filter((f) => f.requiresClientConfirmation && !f.open && !needSettled).length

  return (
    <SourceReviewWorkspace
      initialKey="notional"
      sourceColumnLabel={zh ? '客户原始邮件' : 'Source Email (From Client)'}
      fieldsColumnLabel={zh ? 'AI 提取的客户需求摘要（草稿）' : 'AI Extracted Client Need Brief (Draft)'}
      briefTitle={zh ? '客户需求摘要' : 'Client Need Brief'}
      countLabel={`${verifiedCount}/${extracted.length} ${zh ? '已定' : 'set'}`}
      doc={CLIENT_NEED_EMAIL(zh)}
      fields={extracted.map((f) => ({
        key: f.key,
        label: f.label,
        value: f.value,
        source: f.source,
        originLabel: f.edited ? (zh ? '人工填写' : 'Manual') : originLabel(f.origin, f.fromDiscussion, zh),
        originTone: f.fromDiscussion ? 'live' : f.origin,
        open: f.open,
      }))}
      onEditField={(key, value) => store.editNeedField(key, value)}
      banner={
        <Panel className="review-summary-banner">
          <span className="review-summary-icon"><ShieldCheck size={17} /></span>
          <strong>{zh ? '核对 AI 提取结果' : 'Review AI extraction'}</strong>
          <span>·</span><span>{zh ? `客户明确表达 ${extracted.filter((f) => f.origin === 'stated' && !f.open).length} 项` : `${extracted.filter((f) => f.origin === 'stated' && !f.open).length} client-stated`}</span>
          <span>·</span><span>{zh ? `推导 ${extracted.filter((f) => f.origin === 'derived').length} 项` : `${extracted.filter((f) => f.origin === 'derived').length} derived`}</span>
          {derivedPending ? <><span>·</span><span className="banner-warn">{zh ? `${derivedPending} 项推导值未经客户确认` : `${derivedPending} derived values not client-confirmed`}</span></> : null}<span>·</span>
          <span>{unresolvedCount ? zh ? '推导值必须经客户确认才能进入询价' : 'Derived values must be client-confirmed before RFQ' : zh ? '确认后由产品专家细化结构' : 'Confirm, then the specialist details the structure'}</span>
        </Panel>
      }
      summary={
        <div className="review-verification-summary">
          <span><CheckCircle2 size={14} />{zh ? `${verifiedCount} 项已核实` : `${verifiedCount} verified`}</span>
          {unresolvedCount ? <span className="missing"><CircleAlert size={14} />{zh ? `${unresolvedCount} 项待推导 / 待确认` : `${unresolvedCount} unresolved`}</span> : null}
          <span className="muted"><CheckCircle2 size={14} />{zh ? POLICIES.suitability.passZh : POLICIES.suitability.passEn}</span>
        </div>
      }
      primary={
        <Button variant="primary" icon={ShieldCheck} className="need-primary" disabled={role !== 'rm' || !specialistJoined} title={specialistJoined ? undefined : zh ? '需求需与产品专家共同界定后才能确认' : 'The need must be defined jointly with the product specialist'} onClick={confirmNeed}>
          <span><strong>{zh ? '确认客户需求' : 'Confirm Client Need'}</strong><small>{zh ? specialistJoined ? 'RM + 产品专家共同确认' : '需产品专家共同界定' : specialistJoined ? 'RM + specialist, jointly' : 'Needs the product specialist'}</small></span>
        </Button>
      }
      // 次级操作栏。「@ 产品专家」的提示去掉了：拉人进来是一句话的事，
      // 在下面输入框打「@David 帮我看下这个需求」就行——提示条只是把同一件事
      // 又说了一遍，还占掉主操作旁边最贵的一块地方。
      secondary={specialistJoined ? (
        !specialistProposalPublished ? (
          <Button icon={Sparkles} onClick={() => store.togglePrivate(true)}>{zh ? role === 'ps' ? '查看 agent 初稿（私区）' : '等待 David 确认方向初稿' : role === 'ps' ? 'Review agent draft' : 'Waiting for David'}</Button>
        ) : (
          <>
            {/* 共创是双向的：RM 出客户关系判断，可以推翻产品专家的取舍 */}
            {!rmPushedBack && !needSettled ? (
              <Button icon={Undo2} onClick={() => store.pushBackOnProposal()} disabled={role !== 'rm'} title={zh ? '基于客户关系判断，对方向建议提出不同看法' : 'Push back based on client-relationship judgement'}>{zh ? '我有不同看法' : 'I see it differently'}</Button>
            ) : null}
            <Button icon={MessageSquare} onClick={() => (clientBriefDrafted ? store.togglePrivate(true) : store.draftClientBrief())} disabled={role !== 'rm' || needSettled || specialistDraftPending}>{zh ? needSettled ? '已与客户确认方向' : clientBriefDrafted ? '查看对客说明草稿' : specialistDraftPending ? '等待 David 确认 v3' : '起草对客方向说明' : needSettled ? 'Direction confirmed' : clientBriefDrafted ? 'Open client note draft' : specialistDraftPending ? 'Waiting for David’s v3' : 'Draft client note'}</Button>
          </>
        )
      ) : undefined}
    />
  )
}

// ── 8.1 Client Need Brief ────────────────────────────────────────────────
function NeedBrief({ artifact, role }: { artifact: Artifact; role: RoleKey }) {
  const { truth, needSettled, participants, specialistProposalPublished } = useEngine()
  if (artifact.data.type !== 'needBrief') return null
  const d = artifact.data
  const specialistJoined = participants.some((p) => p.person.role === 'ps' && !p.person.guest)
  const editable =
    artifact.status !== 'APPROVED' &&
    (truth.status === 'CLIENT_NEED_DRAFT' || truth.status === 'CLIENT_NEED_JOINT_REVIEW')
  const underlying = d.fields.find((f) => f.label === 'Underlying')?.value ?? '—'
  return (
    <ArtifactFrame
      artifact={artifact}
      sourceRef={d.sourceRef}
      summary={`${needSettled ? '0700.HK' : '标的待定'} · USD 1M · ~6M · >10%`}
      actions={
        editable ? (
          <>
            {/* 同上：拉产品专家进来在输入框打一句 @David 即可，不再给按钮 */}
            {!specialistJoined ? null : (
              <ActionBtn
                label="起草对客说明"
                kind="ghost"
                allowed={['rm']}
                role={role}
                onClick={() => store.draftClientBrief()}
                disabledReason={needSettled ? '已确认' : !specialistProposalPublished ? '待 David 确认方向' : undefined}
              />
            )}
            <ActionBtn
              label="确认客户需求"
              kind="primary"
              allowed={FCN_WORKFLOW.confirmNeed.allowedRoles}
              role={role}
              disabledReason={specialistJoined ? undefined : '需产品专家共同界定'}
              onClick={() =>
                confirmThen({
                  key: 'confirmNeed',
                  title: '确认客户需求，移交 David？',
                  summary: [
                    `Underlying: ${underlying}`,
                    'Notional: USD 1,000,000',
                    'Horizon: ~6M · Target Yield: >10%',
                    'Risk Tolerance: Moderate',
                  ],
                  consequence: needSettled
                    ? '把 Alice 与 David 共同界定的需求定为已确认，交给 David 细化成结构方案。'
                    : '还有未定项，确认即表示这几项留到结构阶段再定。',
                  ack: needSettled
                    ? '标的与流动性是共创结论、非客户邮件原文，已与客户核对'
                    : '我知道还有未定项，由我和 David 负责补齐',
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
            <span><Sparkles size={14} />AI 提取的客户需求</span>
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
  const { truth, tradeTermsRevised } = useEngine()
  if (artifact.data.type !== 'structureProposal') return null
  const d = artifact.data
  const reviewable =
    artifact.status === 'PENDING APPROVAL' &&
    ['STRUCTURE_REVIEW', 'STRUCTURE_MODIFICATION_REQUIRED'].includes(truth.status)
  const picked = d.options.filter((o) => d.selectedIds.includes(o.optionId))
  const selected = picked[0]
  return (
    <ArtifactFrame
      artifact={artifact}
      sourceRef="Approved Client Need · 14:16"
      summary={selected ? `${selected.label} · ${selected.strike}/${selected.knockIn} · ${selected.couponTarget}` : undefined}
      actions={
        reviewable ? (
          <>
            {tradeTermsRevised ? null : (
              <ActionBtn label="回到初稿修改" kind="ghost" allowed={['ps']} role={role} onClick={() => store.togglePrivate(true)} />
            )}
            <ActionBtn
              label="审批结构"
              kind="primary"
              allowed={FCN_WORKFLOW.approveStructure.allowedRoles}
              role={role}
              onClick={() =>
                confirmThen({
                  key: 'approveStructure',
                  title: '批准这个结构？',
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
        <Tag tone="ai">决策支持</Tag>
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
            className={`opt${d.selectedIds.includes(o.optionId) ? ' selected' : ''}`}
            disabled={!reviewable || role !== 'ps'}
            onClick={() => store.toggleOption(o.optionId)}
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
      sourceRef="Approved Structure · 14:19"
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
                  title: '退回给产品专家修改？',
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
                  title: '向发行商发出询价？',
                  summary: [
                    `FCN · 0700.HK · USD 1M · ${fv('Tenor')}`,
                    `Strike ${fv('Strike')} · KI ${fv('Knock-In')}`,
                    `发送至：${d.issuers.join(' · ')}`,
                  ],
                  consequence: '确认后将通过标准询价接口向 5 家发行商发起询价（结构化返回，通常数分钟内），Case 进入定价阶段。',
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
  const { truth } = useEngine()
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
                  title: '退回修改结构？',
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
                  title: '请发行商重新报价？',
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
                  title: '生成对客报价，交给 Alice？',
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
        <div><span>市场回应</span><strong>{d.quotes.filter((quote) => quote.coupon !== null).length} / {d.quotes.length} issuers</strong></div>
        <div><span>最优可比</span><strong>{best?.issuer} · {best?.coupon?.toFixed(2)}%</strong></div>
        <div><span>有效期</span><strong>{d.freshnessNote}</strong></div>
        <div className="market-recommendation"><Sparkles size={15} /><span><strong>AI 推荐</strong>{d.bestNote}</span></div>
      </div>
      <div className="qm-wrap">
        <table>
          <thead>
            <tr>
              <th>发行商</th>
              <th>票息</th>
              <th>Strike</th>
              <th>KI</th>
              <th>有效期</th>
              <th>判定</th>
            </tr>
          </thead>
          <tbody>
            {comparable.map((q) => (
              <tr key={q.id} className={q.best ? 'best' : ''}>
                <td className="issuer">{q.issuer}</td>
                <td className="num">{q.coupon?.toFixed(2)}%</td>
                <td className="num">{q.strike}</td>
                <td className="num">{q.ki}</td>
                <td><Validity /></td>
                <td>{q.best ? <span className="badge success">最优可比</span> : <span className="badge neutral">可比</span>}</td>
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
                <td>{q.coupon === null ? '—' : <Validity />}</td>
                <td>
                  {q.coupon === null ? (
                    <span className="badge neutral">未回复</span>
                  ) : (
                    <span className="badge warning">条款不可比</span>
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
  const { truth } = useEngine()
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
                title: '把报价发给客户？',
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
        <div><Clock3 size={15} /><span>报价有效期</span></div>
        <Validity />
        <span>跨日未成交需重新询价。客户确认后对客条款即锁死。</span>
      </div>
      <Fields rows={d.terms} />
      {/* 对客文案只保留一份（需求阶段那份已脱敏的方向说明）。
          原来这里还有第二份英文草稿，内容与之不一致，且写着"执行前需重新核价"——
          那条流程已不存在。 */}
      <Panel className="client-facing-preview">
        <div className="cq-label">对客表述 · 随报价发出</div>
        <p>{d.summary}</p>
        <div className="cq-risk">
          <b>风险披露</b>
          <span>{d.riskSummary}</span>
        </div>
      </Panel>
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
  const { truth } = useEngine()
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
                  title: '确认这是一条正式客户指令？',
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
        <span><strong>识别到一条可能的正式客户指令</strong>AI 置信度 {d.confidence}。需 RM 确认后才会创建下单指令。</span>
        <Tag tone="warning">待确认</Tag>
      </div>
      <div className="instruction-layout">
        <EvidencePanel title="客户回复" meta="Mr. Chan · 14:36 · 电话转述（录音已归档）">
          我选<mark>不设赎回那个</mark>吧，我看好腾讯，要是涨回去就被提前赎回了反而可惜。
          <mark>USD 1,000,000</mark>，请<mark>今天内</mark>帮我执行。
        </EvidencePanel>
        <Panel className="instruction-summary-panel">
          <div className="extracted-fields-head"><span><ShieldCheck size={14} />指令要素</span><Tag tone="success">已关联证据</Tag></div>
          <Fields rows={[{ label: 'Detected Intent', value: d.intent }, ...d.terms]} />
        </Panel>
      </div>
      {(() => {
        return (
          <div className="freshness-check">
            <ShieldCheck size={15} />
            <span><strong>对客条款锁死</strong>确认后票息不再变动；上手成交价在下单回报时才确定，差额为本单价差。</span>
          </div>
        )
      })()}
    </ArtifactFrame>
  )
}

// ── 8.7 Execution Ticket ─────────────────────────────────────────────────
function ExecutionTicket({ artifact, role }: { artifact: Artifact; role: RoleKey }) {
  const { truth } = useEngine()
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
                title: '确认代客下单？',
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
        <span><CheckCircle2 size={16} /><strong>对客条款已锁死</strong>指令装配于 {d.quoteTime}；场外指令形式，不走询价接口</span>
      </div>
      <Fields rows={d.fields} />
      <div className="fgrid">
        <span className="fl">指令装配时间</span>
        <span className="fv num">{d.quoteTime}</span>
        <span className="fl">下单渠道</span>
        <span className="fv num">场外指令 · 非接口</span>
      </div>
      <p className="ai-note">
        <span className="ai-verb">AI 已校验</span>
        {d.note}
      </p>
      <div className="pretrade-checks">
        <div><CheckCircle2 size={15} /><span><strong>客户指令</strong>Alice · RM 已确认</span></div>
        <div><CheckCircle2 size={15} /><span><strong>条款一致性</strong>与已批准结构一致</span></div>
        <div><CheckCircle2 size={15} /><span><strong>运营就绪</strong>结算与簿记字段齐备</span></div>
      </div>
    </ArtifactFrame>
  )
}

// ── 8.8 Termsheet Validation ─────────────────────────────────────────────
function TermsheetValidation({ artifact, role }: { artifact: Artifact; role: RoleKey }) {
  // 发行商文件预览的数值从核对数据取，避免写死后与正文脱节
  const { truth } = useEngine()
  if (artifact.data.type !== 'termsheetValidation') return null
  const d = artifact.data
  const ts = (field: string) => d.rows.find((r) => r.field === field)?.termsheet ?? '—'
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
              <ActionBtn label="复核 AI 评估" kind="ghost" allowed={['rm', 'ops', 'dealer']} role={role} onClick={() => store.openDrawer({ type: 'source', payload: CLIENT_SOURCE_BODY['art-inst'] })} />
              <ActionBtn
                label="请求更正版条款书"
                kind="primary"
                allowed={FCN_WORKFLOW.raiseException.allowedRoles}
                role={role}
                onClick={() =>
                  confirmThen({
                    key: 'raiseException',
                    title: '请求更正版条款书',
                    summary: ['分类：文档差异', 'Mismatch: Settlement T+2（执行单）≠ T+3（条款书）', 'Owner: Morgan Stanley · Documentation'],
                    consequence: 'AI 判断执行记录与客户指令一致，差异来自发行商条款书。请求更正版不会触发客户重新确认；Case 将进入 文档异常。',
                    confirmLabel: '请求更正',
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
                  title: '批准最终条款书？',
                  summary: ['全部字段与执行单一致（Notional / Strike / KI / Coupon / Settlement）', '复核人 Mia ≠ 执行人 Ken（职责分离）', '归档材料：客户指令（邮件+录音）· 执行单 · Final Termsheet'],
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
                consequence: 'Case 将回到条款书待审批状态，由 Trade Support 重新审批。',
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
          <span><strong>AI 异常评估</strong>已比对：交易登记记录 · 簿记 · 发行商条款书</span>
          <Tag tone="warning">需人工判断</Tag>
        </div>
        <div className="assessment-grid">
          <div><span>分类</span><strong>文档差异</strong></div>
          <div><span>严重度</span><strong>中</strong></div>
          <div><span>成因</span><strong>发行商条款书与内部记录不一致</strong></div>
          <div><span>处理方</span><strong>MS Documentation / Trade Support</strong></div>
          <div><span>客户影响</span><strong>更正后发出则无影响</strong></div>
          <div><span>需客户重新确认</span><strong>No</strong></div>
        </div>
        <div className="recommended-route"><strong>建议动作</strong><span>请求更正版条款书，收到后重新核对。</span></div>
      </div>
      <div className="validation-layout">
        <div className="tv-wrap">
          <table>
            <thead>
              <tr>
                <th>字段</th>
                <th>交易登记记录</th>
                <th>簿记</th>
                <th>发行商条款书</th>
                <th>判定</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.field} className={r.status !== 'match' ? 'warning' : ''}>
                  <td className="fieldname">{r.field}</td>
                  <td>{r.ticket}</td>
                  <td>{r.booking}</td>
                  <td>{r.termsheet}</td>
                  <td><span className={`st ${r.status}`}>{r.status === 'match' ? '✓ Match' : '⚠ Mismatch'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Panel className="term-sheet-preview">
          <div className="document-preview-head"><FileText size={14} />MS Final Term Sheet <Tag>PDF · 14:56</Tag></div>
          <div className="document-paper">
            <strong>FINAL TERMS AND CONDITIONS</strong>
            {/* 发行商原始文件保持英文（这是真实的）；数值从核对数据取，不写死 */}
            <span>Issuer: Morgan Stanley</span><span>Underlying: Tencent Holdings 0700.HK</span><span>Notional: USD 1,000,000</span>
            <span>Strike: {ts('Strike')}</span><span>Knock-In: {ts('Knock-In')}</span><span>Coupon: {ts('Coupon')} p.a.</span>
            <span className="document-mismatch">Settlement: {ts('Settlement')}</span>
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
    case 'deviationProposal':
      return null // 在结构阶段工作台内呈现，不单独出时间线卡
  }
}
