import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  FileCheck2,
  FileText,
  Mail,
  Pencil,
  Route,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { store, useEngine } from '../hooks'
import { FCN_WORKFLOW } from '../config/fcn-pack/workflow'
import type { Artifact, TermRow } from '../types'
import { confirmThen } from './confirm'
import { Button, Panel, Tag } from './primitives'
import { ActionBtn, Countdown, StatusBadge } from './ui'

function latestArtifact<T extends Artifact['data']['type']>(artifacts: Record<string, Artifact>, type: T) {
  return Object.values(artifacts).reverse().find((artifact) => artifact.data.type === type)
}

function value(rows: TermRow[], label: string, fallback = '—') {
  return rows.find((row) => row.label === label)?.value ?? fallback
}

function StageEvent({ time, children, tone = 'success' }: { time: string; children: React.ReactNode; tone?: 'success' | 'progress' }) {
  return (
    <div className="stage-event">
      <span className="stage-event-time">{time}</span>
      <span className={`stage-event-dot ${tone}`}>{tone === 'success' ? <Check size={11} /> : null}</span>
      <span className="stage-event-copy">{children}</span>
      <span className="stage-event-line" />
    </div>
  )
}

function StageCard({
  icon = <Sparkles size={14} />,
  title,
  subtitle,
  status,
  children,
  footer,
  className = '',
}: {
  icon?: React.ReactNode
  title: string
  subtitle?: string
  status?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <section className={`stage-card ${className}`.trim()}>
      <header className="stage-card-head">
        <span className="stage-card-icon">{icon}</span>
        <strong>{title}</strong>
        {subtitle ? <span className="stage-card-subtitle">{subtitle}</span> : null}
        <span className="stage-card-status">{status}</span>
        <ChevronDown size={15} />
      </header>
      <div className="stage-card-body">{children}</div>
      {footer ? <footer className="stage-card-footer">{footer}</footer> : null}
    </section>
  )
}

function StageActionBar({ source, children }: { source: string; children: React.ReactNode }) {
  return (
    <div className="stage-action-bar">
      <span className="stage-source">Source · {source}</span>
      <div className="stage-actions">{children}</div>
    </div>
  )
}

function TermsTable({ rows }: { rows: TermRow[] }) {
  return (
    <div className="stage-terms">
      {rows.map((row) => (
        <div className="stage-term" key={row.label}>
          <span>{row.label}</span><strong>{row.value}</strong>
        </div>
      ))}
    </div>
  )
}

export function StructureWorkspace() {
  const { artifacts, role, truth, kiModified } = useEngine()
  const artifact = latestArtifact(artifacts, 'structureProposal')
  if (!artifact || artifact.data.type !== 'structureProposal') return <TransitionWorkspace />
  const d = artifact.data
  const selected = d.options.find((option) => option.optionId === d.selectedId) ?? d.options[0]
  return (
    <div className="stage-workspace structure-workspace">
      <StageEvent time="14:08"><b>Client need approved by Alice</b><span>Tencent · USD 1M · 6M · target &gt;10%</span></StageEvent>
      <StageEvent time="14:09" tone="progress"><b>David joins Structuring</b><span>AI prepared three comparable structures for expert review</span></StageEvent>
      <StageCard title="Structure Proposal" subtitle="Product Specialist decision workspace" status={<StatusBadge status={artifact.status} />} className="structure-stage-card"
        footer={<StageActionBar source="Approved Client Need · 14:08">
          {!kiModified ? <ActionBtn label="Adjust KI 70% → 65%" kind="secondary" allowed={['ps']} role={role} onClick={() => store.modifyKI()} /> : null}
          <ActionBtn label="Approve Structure" kind="primary" allowed={FCN_WORKFLOW.approveStructure.allowedRoles} role={role} onClick={() => confirmThen({ key: 'approveStructure', title: 'Approve Structure', summary: [`${selected.label} · ${selected.productType} ${selected.tenor}`, `Strike ${selected.strike} · KI ${selected.knockIn}`, `Autocall ${selected.autocall}`, `Coupon target ${selected.couponTarget}`], consequence: 'The selected terms become the approved structure. AI will prepare the RFQ package and hand the case to Dealer.', confirmLabel: 'Approve Structure' })} />
        </StageActionBar>}
      >
        <div className="structure-ai-brief"><Sparkles size={17} /><div><span>AI comparison brief</span><strong>Three structures normalized against return target and risk tolerance</strong><p>Option B is the recommended comparison starting point. Final suitability judgment remains with Product Specialist.<br /><em className="deviation-hint">客户条款已完整时，可在下方输入框用自然语言发起流程偏离（例："条款已完整，跳过对比直接询价"）。</em></p></div><Tag tone="ai">Decision support</Tag></div>
        {artifacts['art-need']?.note ? <div className="artifact-note"><Pencil size={12} /><span><b>附注 · {artifacts['art-need'].note.author}（随需求摘要流转）</b>{artifacts['art-need'].note.text}</span></div> : null}
        {(() => {
          const dev = artifacts['art-dev']
          if (!dev || dev.data.type !== 'deviationProposal' || dev.status === 'STALE') return null
          const d = dev.data
          return (
            <div className={`deviation-card${dev.status === 'APPROVED' ? ' approved' : ''}`}>
              <div className="deviation-head"><AlertTriangle size={15} /><strong>流程偏离卡 · Process Deviation</strong><StatusBadge status={dev.status} /></div>
              <blockquote>"{d.request}" — {d.requestedBy}</blockquote>
              <div className="deviation-grid">
                <div><span>AI 分类</span><strong>{d.classification}</strong></div>
                <div><span>跳过环节</span><strong>{d.skips}</strong></div>
                <div><span>依据</span><strong>{d.basis}</strong></div>
                <div><span>需确认人</span><strong>{d.approver}</strong></div>
              </div>
              <div className="deviation-risks">{d.risks.map((r) => <Tag key={r}>{r}</Tag>)}</div>
              {dev.status === 'PENDING APPROVAL' ? (
                <div className="deviation-actions">
                  <ActionBtn label="驳回 · 按标准流程" kind="ghost" allowed={FCN_WORKFLOW.approveDeviation.allowedRoles} role={role} onClick={() => store.rejectDeviation()} />
                  <ActionBtn label="批准偏离 · 直接询价" kind="primary" allowed={FCN_WORKFLOW.approveDeviation.allowedRoles} role={role} onClick={() => confirmThen({ key: 'approveDeviation', title: 'Approve Process Deviation', summary: ['跳过：结构三方案对比', '依据：客户邮件完整条款 FCN · 6M · Strike 80% · KI 70%', '强制检查不豁免：适当性 · 职责分离', '偏离将单独留痕并计入流程改进统计'], consequence: '批准后案例直接进入询价（RFQ）。此偏离作为独立审计事件记录，不豁免任何策略检查。', confirmLabel: '批准偏离', danger: true })} />
                </div>
              ) : dev.approvedMeta ? <div className="deviation-approved">✓ {dev.approvedMeta}</div> : null}
            </div>
          )
        })()}
        {truth.status === 'STRUCTURE_MODIFICATION_REQUIRED' ? <div className="inline-stage-warning"><AlertTriangle size={15} /><span><strong>Returned for modification.</strong> Review market feedback, adjust terms and re-approve before a new RFQ is created.</span></div> : null}
        <div className="structure-options">
          {d.options.map((option) => <button key={option.optionId} className={option.optionId === d.selectedId ? 'selected' : ''} disabled={role !== 'ps'} onClick={() => store.selectOption(option.optionId)}>
            <div className="structure-option-head"><span className="structure-radio" /><strong>{option.label}</strong>{option.optionId === d.recommendedId ? <Tag tone="ai">AI starting point</Tag> : null}<span className="structure-coupon">{option.couponTarget}</span></div>
            <div className="structure-option-terms"><span>{option.productType} · {option.tenor}</span><span>Strike <b>{option.strike}</b></span><span>KI <b>{option.knockIn}</b></span><span>{option.autocall}</span></div>
            <p>{option.rationale}</p><div className="structure-risks">{option.risks.map((risk) => <Tag key={risk}>{risk}</Tag>)}</div>
          </button>)}
        </div>
      </StageCard>
    </div>
  )
}

const TRANSITION_COPY: Record<string, { eyebrow: string; title: string; description: string; owner: string; steps: string[]; tone?: 'warning' | 'success' }> = {
  CLIENT_NEED_APPROVED: { eyebrow: 'Handoff complete', title: 'Preparing Structure Proposal', description: 'The approved client need is now with David. AI is preparing comparable structures for Product Specialist review.', owner: 'David · Product Specialist', steps: ['Client need locked as approved truth', 'Generate comparable structures', 'Compare yield target and downside risk'] },
  STRUCTURE_APPROVED: { eyebrow: 'Approved structure locked', title: 'Preparing RFQ Package', description: 'AI is translating approved structure terms into a dealer-ready pricing request and running completeness checks.', owner: 'Ken · Dealer', steps: ['Freeze approved structure terms', 'Build issuer-ready RFQ package', 'Check critical terms and issuer coverage'] },
  PRICING_IN_PROGRESS: { eyebrow: 'Market RFQ live', title: 'Collecting and normalizing issuer quotes', description: 'Quotes arrive asynchronously. AI separates comparable responses from quotes with different terms before Dealer review.', owner: 'Ken · Dealer', steps: ['RFQ sent via pricing API to five issuers', 'Collect issuer responses', 'Normalize terms and check freshness'] },
  REQUOTE_REQUIRED: { eyebrow: 'Requote requested', title: 'Waiting for refreshed market quotes', description: 'The previous matrix is stale. New quotes will be normalized into a fresh comparison when responses arrive.', owner: 'Ken · Dealer', steps: ['Mark prior quote matrix stale', 'Request fresh issuer prices', 'Rebuild comparable quote matrix'], tone: 'warning' },
  WAITING_FOR_CLIENT: { eyebrow: 'Client quote sent', title: 'Waiting for Mr. Chan', description: 'Alice has reviewed and sent the client quote. AI will watch the selected client channel for a response and possible instruction.', owner: 'Alice · RM', steps: ['Client message reviewed by RM', 'Quote sent through selected channel', 'Monitor for client reply'] },
  CLIENT_RESPONSE_RECEIVED: { eyebrow: 'New client response', title: 'Checking for a formal client instruction', description: 'AI is linking the reply to the quoted terms and identifying whether the language may constitute an instruction.', owner: 'Alice · RM', steps: ['Preserve source reply', 'Detect instruction language', 'Link evidence to extracted fields'], tone: 'warning' },
  CLIENT_INSTRUCTION_CONFIRMED: { eyebrow: 'Formal instruction recorded', title: 'Running quote freshness check', description: 'The instruction is confirmed. Before Dealer can execute, the selected issuer quote must still be live and executable.', owner: 'Ken · Dealer', steps: ['Lock confirmed client instruction', 'Compare with selected quote', 'Check quote validity at execution'] },
  LIVE_REQUOTE_REQUIRED: { eyebrow: 'Execution blocked', title: 'Selected quote has expired', description: 'A live executable quote is required. The confirmed client instruction remains valid while Dealer requests a final price.', owner: 'Ken · Dealer', steps: ['Preserve confirmed instruction', 'Request live final price', 'Refresh execution ticket'], tone: 'warning' },
  EXECUTED: { eyebrow: 'Trade executed', title: 'Waiting for issuer term sheet', description: 'The execution record is locked. On receipt, AI will compare the final document field by field against the executed ticket.', owner: 'Mia · 簿记 / 核对', steps: ['Lock execution record', 'Receive issuer final terms', 'Validate and classify exceptions'], tone: 'success' },
  COMPLETED: { eyebrow: 'Workflow complete', title: 'Case completed successfully', description: 'The final term sheet is approved and the full structured audit trail is available in History.', owner: 'No further owner', steps: ['Client need confirmed', 'Trade executed', 'Final term sheet approved'], tone: 'success' },
}

export function TransitionWorkspace() {
  const { truth, role, artifacts } = useEngine()
  const copy = TRANSITION_COPY[truth.status] ?? TRANSITION_COPY.CLIENT_NEED_APPROVED
  const need = latestArtifact(artifacts, 'needBrief')
  const fields = need?.data.type === 'needBrief' ? need.data.fields : []
  const liveRequote = truth.status === 'LIVE_REQUOTE_REQUIRED'
  const waiting = truth.waitingOn
  return (
    <div className="transition-workspace">
      <div className={`transition-hero ${copy.tone ?? 'progress'}`}>
        <div className="transition-orbit"><span /><Sparkles size={20} /></div>
        <div className="transition-copy"><span>{copy.eyebrow}</span><h2>{copy.title}</h2><p>{copy.description}</p></div>
        <Tag tone={copy.tone === 'warning' ? 'warning' : copy.tone === 'success' ? 'success' : 'primary'}>{truth.statusLabel}</Tag>
      </div>
      <Panel className="transition-progress-card">
        <div className="transition-progress-head"><div><span>Current owner</span><strong>{copy.owner}</strong></div><div><span>Waiting on</span><strong>{waiting ?? 'AI processing'}</strong></div><div><span>Case state</span><strong>{truth.status}</strong></div></div>
        <div className="transition-steps">{copy.steps.map((step, index) => <div key={step} className={index === 0 || copy.tone === 'success' ? 'done' : index === 1 ? 'active' : ''}><span>{index === 0 || copy.tone === 'success' ? <Check size={12} /> : index + 1}</span><strong>{step}</strong>{index === 1 && copy.tone !== 'success' ? <small>In progress</small> : null}</div>)}</div>
        {truth.status === 'CLIENT_NEED_APPROVED' ? <div className="transition-truth-summary"><span>Approved client need</span><strong>Tencent / {value(fields, 'Underlying', '0700.HK').split('/').pop()?.trim()}</strong><strong>{value(fields, 'Notional')}</strong><strong>{value(fields, 'Investment Horizon')}</strong><strong>{value(fields, 'Target Yield')}</strong><Tag tone="success">Evidence verified</Tag></div> : null}
        {liveRequote ? <div className="transition-blocked-action"><AlertTriangle size={17} /><div><strong>Expired quote cannot be used for execution</strong><span>Request a live final price from Morgan Stanley. The execution ticket will update when the response arrives.</span></div><ActionBtn label="Request Live Requote" kind="primary" allowed={FCN_WORKFLOW.requestLiveRequote.allowedRoles} role={role} onClick={() => confirmThen({ key: 'requestLiveRequote', title: 'Request Live Requote', summary: ['Request a fresh executable quote from Morgan Stanley', 'Refresh the execution ticket using final live terms'], consequence: 'Execution remains blocked until Dealer reviews a valid live quote.', confirmLabel: 'Request Live Requote' })} /></div> : null}
      </Panel>
      <div className="transition-footnote"><ShieldCheck size={14} /><span>Structured state remains the source of truth while this step is running. Intermediate AI work does not change approved terms.</span></div>
    </div>
  )
}

export function RFQWorkspace() {
  const { artifacts, role } = useEngine()
  const artifact = latestArtifact(artifacts, 'rfqPackage')
  if (!artifact || artifact.data.type !== 'rfqPackage') return null
  const d = artifact.data
  const fv = (label: string) => value(d.fields, label)
  return (
    <div className="stage-workspace">
      <StageEvent time="14:15">Ken joins at <b>RFQ Ready</b></StageEvent>
      <div className="stage-context">
        <div><span className="avatar r-dealer">KE</span><strong>Context Brief</strong><Tag tone="ai">AI</Tag></div>
        <p>You’re reviewing the approved structure and preparing the RFQ package. Ensure all required terms are complete before accepting pricing.</p>
        <Button variant="secondary">Open Brief</Button>
      </div>
      <StageEvent time="14:16"><b>Approved Structure Proposal</b><span>方案 B · 均衡型 · KI {fv('Knock-In')} · Strike {fv('Strike')}</span></StageEvent>
      <StageCard
        title="RFQ Package"
        subtitle="Dealer review before market pricing"
        status={<StatusBadge status={artifact.status} />}
        className="rfq-card"
        footer={
          <StageActionBar source="Approved Structure · 14:15">
            <ActionBtn label="Return for Modification" kind="ghost" allowed={FCN_WORKFLOW.returnRFQ.allowedRoles} role={role} onClick={() => confirmThen({ key: 'returnRFQ', title: 'Return for Modification', summary: ['RFQ Package will be superseded', 'Return case to Product Specialist'], consequence: 'The approved structure will be reopened for modification.', confirmLabel: 'Return for modification', danger: true })} />
            <ActionBtn label="Accept Pricing Request" kind="primary" allowed={FCN_WORKFLOW.acceptPricing.allowedRoles} role={role} onClick={() => confirmThen({ key: 'acceptPricing', title: 'Accept Pricing Request', summary: [`FCN · 0700.HK · USD 1M · ${fv('Tenor')}`, `Strike ${fv('Strike')} · KI ${fv('Knock-In')}`, `Send to ${d.issuers.length} issuers`], consequence: 'The RFQ will be sent through the standard pricing API to selected issuers (structured responses, typically within minutes) and the case will enter market pricing.', confirmLabel: 'Accept pricing request' })} />
          </StageActionBar>
        }
      >
        <div className="stage-tabs"><button className="active">Terms</button><button>Checks</button><button>Issuers</button></div>
        <TermsTable rows={d.fields} />
        <div className="rfq-issuers"><span>Issuer List</span><div>{d.issuers.map((issuer) => <Tag key={issuer}>{issuer}</Tag>)}</div></div>
        <div className="rfq-checks">
          {d.checks.map((check) => <div key={check.label}><CheckCircle2 size={15} /><span><strong>{check.label}</strong>Verified against approved structure</span></div>)}
        </div>
      </StageCard>
    </div>
  )
}

export function QuoteMatrixWorkspace() {
  const { artifacts, role, now, truth } = useEngine()
  const artifact = latestArtifact(artifacts, 'quoteMatrix')
  if (!artifact || artifact.data.type !== 'quoteMatrix') return null
  const d = artifact.data
  const comparable = d.quotes.filter((quote) => quote.comparable)
  const nonComparable = d.quotes.filter((quote) => !quote.comparable)
  const best = comparable.find((quote) => quote.best) ?? comparable[0]
  const approvedKI = truth.approvedTerms ? value(truth.approvedTerms, 'KI') : '70%'
  return (
    <div className="stage-workspace matrix-workspace">
      <StageEvent time="14:17"><b>RFQ accepted and released</b><span>JPM · UBS · Morgan Stanley · Goldman Sachs · BNP</span></StageEvent>
      <StageEvent time="14:22" tone="progress"><b>4 issuer responses normalized</b><span>1 non-comparable · 1 no response</span></StageEvent>
      <StageCard
        title="Quote Matrix"
        subtitle="Market pricing comparison"
        status={<><Tag tone="success">4 responses</Tag><Tag tone="warning">1 different terms</Tag></>}
        className="quote-matrix-card"
        footer={
          <StageActionBar source="Live issuer quotes · 14:22">
            <ActionBtn label="拉入私区讨论" kind="ghost" allowed={['rm', 'ps', 'dealer', 'ops']} role={role} onClick={() => store.pullIntoPrivate(artifact.id)} />
            <ActionBtn label="Request Requote" kind="ghost" allowed={FCN_WORKFLOW.requestRequote.allowedRoles} role={role} onClick={() => confirmThen({ key: 'requestRequote', title: 'Request Requote', summary: ['Request fresh quotes from all issuers', 'Current matrix becomes stale'], consequence: 'The market comparison will refresh when responses arrive.', confirmLabel: 'Request requote' })} />
            <ActionBtn label="Modify Structure" kind="secondary" allowed={FCN_WORKFLOW.modifyFromPricing.allowedRoles} role={role} onClick={() => confirmThen({ key: 'modifyFromPricing', title: 'Modify Structure', summary: ['Return case to structure design', 'Current quote matrix becomes stale'], consequence: 'A new RFQ will be required after the structure is re-approved.', confirmLabel: 'Modify structure', danger: true })} />
            <ActionBtn label="Prepare Client Quote" kind="primary" allowed={FCN_WORKFLOW.prepareClientQuote.allowedRoles} role={role} aiRecommended onClick={() => confirmThen({ key: 'prepareClientQuote', title: 'Prepare Client Quote', summary: [`Selected ${best?.issuer}`, `Coupon ${best?.coupon?.toFixed(2)}% · Strike ${best?.strike} · KI ${best?.ki}`], consequence: 'AI will prepare a client-facing quote for RM review.', confirmLabel: 'Prepare client quote' })} />
          </StageActionBar>
        }
      >
        <div className="matrix-recommendation">
          <Sparkles size={18} /><div><span>Best comparable quote</span><strong>{best?.issuer} · {best?.coupon?.toFixed(2)}% p.a.</strong><p>Highest coupon among quotes matching approved terms.</p></div>
          <div className="matrix-valid"><span>Valid for</span><Countdown until={best?.expiresAt ?? null} now={now} /></div>
          <Tag tone="ai">AI recommends</Tag>
        </div>
        <QuoteTable title="Comparable Quotes" quotes={comparable} now={now} approvedKI={approvedKI} />
        <QuoteTable title="Non-comparable Quotes" quotes={nonComparable} now={now} approvedKI={approvedKI} nonComparable />
      </StageCard>
    </div>
  )
}

function QuoteTable({ title, quotes, now, approvedKI, nonComparable = false }: { title: string; quotes: Extract<Artifact['data'], { type: 'quoteMatrix' }>['quotes']; now: number; approvedKI: string; nonComparable?: boolean }) {
  return (
    <div className="quote-table-block">
      <div className="quote-table-title"><strong>{title}</strong><span>{nonComparable ? 'Different terms or no response' : 'Aligned to approved RFQ terms'}</span></div>
      <div className="quote-table-wrap"><table><thead><tr><th>Issuer</th><th>Coupon</th><th>Strike</th><th>KI</th><th>Freshness</th><th>Assessment</th></tr></thead>
        <tbody>{quotes.map((quote) => <tr key={quote.id} className={quote.best ? 'best' : ''}>
          <td><strong>{quote.issuer}</strong>{quote.best ? <Tag tone="success">Best</Tag> : null}</td>
          <td className="mono">{quote.coupon === null ? '—' : `${quote.coupon.toFixed(2)}%`}</td><td>{quote.coupon === null ? '—' : quote.strike}</td>
          <td>{quote.ki}{quote.coupon !== null && quote.ki !== approvedKI ? <span className="quote-diff"> ≠ {approvedKI}</span> : null}</td>
          <td><Countdown until={quote.expiresAt} now={now} /></td>
          <td>{quote.coupon === null ? <Tag>No response</Tag> : nonComparable ? <Tag tone="warning">Different terms</Tag> : <Tag tone="success">Comparable</Tag>}</td>
        </tr>)}</tbody></table></div>
    </div>
  )
}

export function ClientQuoteWorkspace() {
  const { artifacts, role, now } = useEngine()
  const artifact = latestArtifact(artifacts, 'clientQuote')
  if (!artifact || artifact.data.type !== 'clientQuote') return null
  const d = artifact.data
  const tv = (label: string) => value(d.terms, label)
  return (
    <div className="stage-workspace client-quote-workspace">
      <StageEvent time="14:23"><b>Morgan Stanley selected</b><span>Best comparable quote · {tv('Coupon')}</span></StageEvent>
      <StageEvent time="14:24" tone="progress"><b>Client language prepared</b><span>Risk explanation and message draft generated for RM review</span></StageEvent>
      <StageCard title="Client Quote Card" subtitle="RM review before external communication" status={<StatusBadge status={artifact.status} />} className="client-quote-stage-card"
        footer={<StageActionBar source="Quote Matrix · MS best comparable quote">
          <ActionBtn label="Request Updated Quote" kind="ghost" allowed={FCN_WORKFLOW.requestRequote.allowedRoles} role={role} onClick={() => confirmThen({ key: 'requestRequote', title: 'Request Updated Quote', summary: ['Return to market pricing', 'Request a fresh quote'], consequence: 'The current client quote will no longer be used.', confirmLabel: 'Request updated quote' })} />
          <ActionBtn label="Back to Quote Matrix" kind="secondary" allowed={['rm', 'dealer']} role={role} onClick={() => store.openDrawer({ type: 'source', payload: { title: 'Quote Matrix', meta: 'Selected quote evidence', body: 'Morgan Stanley was selected as the best comparable quote at 14:23.' } })} />
          <ActionBtn label="Send to Client" kind="primary" allowed={FCN_WORKFLOW.sendClientQuote.allowedRoles} role={role} onClick={() => confirmThen({ key: 'sendClientQuote', title: 'Send Client Quote', summary: [`${d.issuer} · ${tv('Coupon')}`, `FCN 0700.HK · 6M · Strike ${tv('Strike')} · KI ${tv('Knock-In')}`], consequence: 'The reviewed message will be sent by RM and the case will wait for the client.', confirmLabel: 'Send to client' })} />
        </StageActionBar>}
      >
        <div className="client-quote-hero">
          <div><span>Indicative Client Quote</span><strong>Tencent 6M Fixed Coupon Note</strong><p>Prepared for Mr. Chan · by Alice</p></div>
          <div className="client-coupon-hero"><strong>{tv('Coupon').split(' ')[0]}</strong><span>p.a. indicative coupon</span></div>
          <div className="client-countdown"><Clock3 size={16} /><span>Quote valid for</span><Countdown until={d.validityUntil} now={now} /><small>Live recheck required before execution</small></div>
        </div>
        <TermsTable rows={d.terms} />
        <div className="risk-explanation"><div className="stage-block-label">Client-friendly risk explanation</div><div className="risk-tiles"><div><strong>Capital at risk</strong><span>Loss is possible if Tencent closes below the knock-in level.</span></div><div><strong>Limited liquidity</strong><span>This note is intended to be held to maturity.</span></div><div><strong>Issuer exposure</strong><span>Payment depends on Morgan Stanley meeting its obligations.</span></div></div></div>
        <Panel className="client-draft"><div className="client-draft-head"><span><Mail size={15} />Draft client message</span><Tag tone="warning">RM review required</Tag></div><p>Hi Mr. Chan, we have obtained an indicative quote for the Tencent idea discussed. Morgan Stanley can currently offer a {tv('Coupon').split(' · ')[0]} coupon for a 6-month FCN with Strike {tv('Strike')} and Knock-In {tv('Knock-In')}.</p><p>Please note the investment risks described above. Final execution remains subject to a live quote and your formal instruction.</p><div><Button icon={Pencil} variant="ghost">Edit</Button><Button icon={Copy} variant="ghost">Copy</Button><Button icon={Send} variant="secondary">Send preview</Button></div></Panel>
      </StageCard>
    </div>
  )
}

export function InstructionReviewWorkspace() {
  const { artifacts, role, now } = useEngine()
  const artifact = latestArtifact(artifacts, 'instruction')
  const quote = latestArtifact(artifacts, 'clientQuote')
  if (!artifact || artifact.data.type !== 'instruction') return null
  const d = artifact.data
  const iv = (label: string) => value(d.terms, label)
  const validityUntil = quote?.data.type === 'clientQuote' ? quote.data.validityUntil : null
  return (
    <div className="stage-workspace instruction-workspace">
      <StageEvent time="14:36"><b>Client reply received</b><span>AI detected possible formal instruction</span></StageEvent>
      <StageEvent time="14:36" tone="progress"><b>Evidence linked to instruction fields</b><span>RM confirmation required before execution</span></StageEvent>
      <StageCard title="Client Instruction Detection" subtitle="Source Review" status={<Tag tone="warning">Pending RM confirmation</Tag>} className="instruction-stage-card">
        <div className="instruction-split">
          <Panel className="instruction-email"><div className="split-panel-head"><span><Mail size={15} />Client reply</span><Tag>Source evidence</Tag></div><div className="email-meta">Mr. Chan · 14:36 · Re: Tencent FCN quote</div><p>Thanks Alice. <mark>Yes, please proceed with Morgan Stanley</mark> for <mark>USD 1,000,000</mark> on the terms shared.</p><p>Please <mark>execute today</mark> and confirm once done.</p><div className="evidence-note"><FileCheck2 size={14} />Each extracted term links back to highlighted source text.</div></Panel>
          <Panel className="instruction-extract"><div className="split-panel-head"><span><Sparkles size={15} />AI extracted client instruction</span><Tag tone="success">Evidence linked</Tag></div><div className="intent-row"><span>Detected intent</span><strong>{d.intent}</strong><Tag tone="warning">{d.confidence} confidence</Tag></div><TermsTable rows={d.terms} /><div className="freshness-row"><div><Clock3 size={16} /><span><strong>Quote freshness</strong>Must remain valid at execution</span></div><Countdown until={validityUntil} now={now} /></div><div className="inline-stage-warning"><AlertTriangle size={15} /><span>Confirming creates a formal instruction record. Dealer must still obtain a live executable quote.</span></div><div className="instruction-actions"><ActionBtn label="Not an instruction" kind="ghost" allowed={FCN_WORKFLOW.rejectInstruction.allowedRoles} role={role} onClick={() => confirmThen({ key: 'rejectInstruction', title: 'Reject AI detection', summary: ['Mark this detection as invalid', 'Return to waiting for client'], consequence: 'No execution ticket will be created.', confirmLabel: 'Reject detection', danger: true })} /><Button variant="secondary">Ask client</Button><ActionBtn label="Confirm Instruction" kind="primary" allowed={FCN_WORKFLOW.confirmInstruction.allowedRoles} role={role} onClick={() => confirmThen({ key: 'confirmInstruction', title: 'Confirm Formal Client Instruction', summary: [`${iv('Issuer')} · ${iv('Notional')}`, `${iv('Product')} · ${iv('Strike / KI')}`, iv('Timing')], consequence: 'A formal instruction record and execution ticket draft will be created. Dealer will run a live quote check before execution.', confirmLabel: 'Confirm instruction' })} /></div></Panel>
        </div>
      </StageCard>
    </div>
  )
}

export function ExecutionWorkspace() {
  const { artifacts, role, now } = useEngine()
  const artifact = latestArtifact(artifacts, 'executionTicket')
  if (!artifact || artifact.data.type !== 'executionTicket') return null
  const d = artifact.data
  const ev = (label: string) => value(d.fields, label)
  return (
    <div className="stage-workspace execution-workspace">
      <StageEvent time="14:38"><b>Client instruction confirmed by Alice</b><span>Formal instruction record created</span></StageEvent>
      <StageEvent time={d.quoteTime} tone="progress"><b>Live quote received from Morgan Stanley</b><span>Execution ticket refreshed</span></StageEvent>
      <StageCard title="Execution Ticket Draft" subtitle="Dealer review · formal execution" status={<StatusBadge status={artifact.status} />} className="execution-stage-card"
        footer={<StageActionBar source="Confirmed Client Instruction + MS live quote">
          <ActionBtn label="Request Live Requote" kind="ghost" allowed={FCN_WORKFLOW.requestLiveRequote.allowedRoles} role={role} onClick={() => confirmThen({ key: 'requestLiveRequote', title: 'Request Live Requote', summary: ['Request final live price from Morgan Stanley', 'Refresh execution ticket'], consequence: 'Execution remains blocked until a valid quote is available.', confirmLabel: 'Request live requote' })} />
          <Button variant="secondary">Back to Client Instruction</Button>
          <ActionBtn label="Confirm & Execute" kind="primary" allowed={FCN_WORKFLOW.executeTrade.allowedRoles} role={role} onClick={() => confirmThen({ key: 'executeTrade', title: 'Confirm & Execute', summary: [`${ev('Issuer')} · FCN 0700.HK`, `${ev('Notional')} · ${ev('Tenor')}`, `Strike ${ev('Strike')} · KI ${ev('Knock-In')} · Coupon ${ev('Coupon (Final)')}`, `Settlement ${ev('Settlement')}`], consequence: 'This is a formal trade execution. The order will be submitted at the live quote and recorded in the audit trail.', confirmLabel: 'Execute Trade' })} />
        </StageActionBar>}
      >
        <div className="execution-validity-grid"><div><span>Quote status</span><strong><CheckCircle2 size={15} />Still valid</strong></div><div><span>Live quote received</span><strong>{d.quoteTime}</strong></div><div><span>Time remaining</span><strong><Countdown until={d.validityUntil} now={now} /></strong></div></div>
        <div className="execution-section"><div className="stage-block-label">Ticket details</div><TermsTable rows={d.fields} /></div>
        <div className="execution-section"><div className="stage-block-label">Final pre-trade checks</div><div className="pretrade-grid"><CheckRow title="Client instruction" detail="Confirmed by Alice · RM" /><CheckRow title="Terms alignment" detail="Matches client instruction and approved structure" /><CheckRow title="Quote validity" detail="Live executable quote from Morgan Stanley" /><CheckRow title="Operational readiness" detail="Settlement and booking fields complete" /></div></div>
        <div className="inline-stage-warning"><Clock3 size={15} /><span><strong>Time-sensitive action.</strong> If the quote expires, execution is blocked and a live requote is required.</span></div>
      </StageCard>
    </div>
  )
}

function CheckRow({ title, detail }: { title: string; detail: string }) {
  return <div><CheckCircle2 size={15} /><span><strong>{title}</strong>{detail}</span><Tag tone="success">Passed</Tag></div>
}

export function TermsheetWorkspace() {
  const { artifacts, role, truth } = useEngine()
  const artifact = latestArtifact(artifacts, 'termsheetValidation')
  if (!artifact || artifact.data.type !== 'termsheetValidation') return null
  const d = artifact.data
  const mismatch = d.rows.find((row) => row.status !== 'match')
  const inException = truth.status === 'EXCEPTION'
  return (
    <div className="stage-workspace termsheet-workspace">
      <StageEvent time="14:41"><b>Trade executed with Morgan Stanley</b><span>Execution record locked</span></StageEvent>
      <StageEvent time="14:52" tone="progress"><b>Issuer term sheet received</b><span>AI validation found {mismatch ? '1 mismatch' : 'no mismatches'}</span></StageEvent>
      <div className="ai-assessment-banner"><Route size={19} /><div><span>AI Exception Assessment</span><strong>{mismatch ? 'Documentation Error · Medium severity' : 'No exception detected'}</strong><p>{mismatch ? 'Issuer term sheet differs from the executed settlement term. Client instruction and execution record remain aligned.' : 'All final terms match the execution record.'}</p></div><Tag tone={mismatch ? 'warning' : 'success'}>{mismatch ? 'Review required' : 'Validated'}</Tag></div>
      <StageCard title="Term Sheet Validation" subtitle="Execution record vs issuer document" status={<StatusBadge status={artifact.status} />} className="termsheet-stage-card"
        footer={<StageActionBar source="Execution Ticket · 14:41 + MS Final Term Sheet · 14:52">
          <ActionBtn label="拉入私区讨论" kind="ghost" allowed={['rm', 'ps', 'dealer', 'ops']} role={role} onClick={() => store.pullIntoPrivate(artifact.id)} />
          {inException ? <ActionBtn label="Resolve Exception" kind="primary" allowed={FCN_WORKFLOW.resolveException.allowedRoles} role={role} onClick={() => confirmThen({ key: 'resolveException', title: 'Resolve Documentation Exception', summary: ['Morgan Stanley confirmed settlement should be T+2', 'Corrected term sheet received'], consequence: 'The case returns to term sheet approval.', confirmLabel: 'Resolve exception' })} /> : mismatch ? <><ActionBtn label="Approve Assessment" kind="secondary" allowed={['ops', 'dealer']} role={role} onClick={() => store.openDrawer({ type: 'source', payload: { title: 'AI Assessment', meta: 'Evidence-backed classification', body: 'Client Instruction and Execution Record both specify T+2. The issuer term sheet alone specifies T+3, so the exception is classified as Documentation Error.' } })} /><ActionBtn label="Request Corrected Term Sheet" kind="primary" allowed={FCN_WORKFLOW.raiseException.allowedRoles} role={role} onClick={() => confirmThen({ key: 'raiseException', title: 'Request Corrected Term Sheet', summary: ['Classification: Documentation Error', 'Settlement T+2 ≠ T+3', 'Owner: Morgan Stanley Documentation'], consequence: 'A documentation exception will be routed to the issuer. Client reconfirmation is not required.', confirmLabel: 'Request corrected term sheet', danger: true })} /></> : <ActionBtn label="Approve Term Sheet" kind="primary" allowed={FCN_WORKFLOW.approveTermsheet.allowedRoles} role={role} onClick={() => confirmThen({ key: 'approveTermsheet', title: 'Approve Term Sheet', summary: ['All fields match the execution ticket', 'Reviewer Mia ≠ executor Ken (segregation of duties)', 'Archive set: client instruction (email + call recording) · execution ticket · final termsheet'], consequence: 'The case will be completed.', confirmLabel: 'Approve term sheet' })} />}
        </StageActionBar>}
      >
        <div className="termsheet-main-grid"><div className="termsheet-diff"><div className="stage-block-label">Field comparison</div><table><thead><tr><th>Field</th><th>Execution Ticket</th><th>Term Sheet</th><th>Result</th></tr></thead><tbody>{d.rows.map((row) => <tr key={row.field} className={row.status !== 'match' ? 'mismatch' : ''}><td><strong>{row.field}</strong></td><td>{row.ticket}</td><td>{row.termsheet}</td><td>{row.status === 'match' ? <Tag tone="success">Match</Tag> : <Tag tone="warning">Mismatch</Tag>}</td></tr>)}</tbody></table></div>
          <Panel className="source-document-preview"><div className="split-panel-head"><span><FileText size={15} />Source Document Preview</span><Tag>PDF · 14:52</Tag></div><div className="document-sheet"><strong>MORGAN STANLEY</strong><span>FINAL TERMS AND CONDITIONS</span><hr /><p>Underlying <b>Tencent Holdings 0700.HK</b></p><p>Notional <b>USD 1,000,000</b></p><p>Strike / Knock-In <b>80% / 70%</b></p><p>Coupon <b>10.15% p.a.</b></p><p className="document-error">Settlement <b>T+3</b></p></div></Panel>
        </div>
        {mismatch ? <div className="exception-classification"><div><span>Classification</span><strong>Documentation Error</strong></div><div><span>Severity & Root Cause</span><strong>Medium · Issuer document differs</strong></div><div><span>Owner</span><strong>MS Documentation / Trade Support</strong></div><div><span>Client Impact</span><strong>None if corrected before release</strong></div><div><span>Client Reconfirmation Required</span><strong>No</strong></div><div><span>Recommended Action</span><strong>Request corrected term sheet</strong></div></div> : null}
      </StageCard>
    </div>
  )
}
