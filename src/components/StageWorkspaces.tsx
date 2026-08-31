import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  FileText,
  Mail,
  Mic,
  Route,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import { store, useEngine } from '../hooks'
import { FCN_WORKFLOW } from '../config/fcn-pack/workflow'
import { fieldLabel } from '../config/fcn-pack/field-labels'
import { exposureIfKnockedIn, exposureRatio, getClient, pct } from '../config/mock-data/clients'
import type { Artifact, TermRow } from '../types'
import { confirmThen } from './confirm'
import { setDragGhost } from './dragGhost'
import { Button, Panel, Tag } from './primitives'
import { ActionBtn, StatusBadge, Validity } from './ui'
import { SourceReviewWorkspace } from './SourceReview'
import { buildFillFields, fillConfirmEmail } from '../config/fcn-pack/fill-confirm'

/**
 * Ken 加入时收到的简报。
 *
 * 它要回答的是「这单是怎么回事」——客户想要什么、为什么定成这样，最后才是
 * 轮到他做什么。条款本身不复述：下面那张询价包卡片就是全文，说两遍只是噪音。
 * 数字全部从客户档案和产物里取，不手写。
 */
function joinBrief(issuers: string[]) {
  const c = getClient()
  const now = pct(exposureRatio('0700.HK'))
  const after = pct(exposureIfKnockedIn('0700.HK', 7_800_000))
  const declined = c.declined[0]
  return {
    meta: 'AI 生成 · 14:20 你加入时推送 · 仅你可见',
    want: `${c.name}（${c.classification} · 可承受 ${c.riskGrade}）要在 6 个月内做到 10% 以上年化，看好中国互联网科技，能接受敲入后接股，但不接受全损结构。结构由 Alice 和 David 同客户共同界定，David 已在 14:19 审批。`,
    why: [
      ...c.history.map((h) => `${h.date} 做过 ${h.product} / ${h.underlying}，KI ${h.ki}，${h.outcome}。`),
      declined ? `${declined.date} 他拒绝过 ${declined.what}，理由是${declined.reason}——所以这次 KI 压在 65%，没往上放。` : null,
      `腾讯持仓已占组合 ${now}，本笔即使全额敲入接股也只到 ${after}，距本行单一标的 ${pct(c.holdings.singleNameCap)} 上限仍有余量。`,
    ].filter((x): x is string => x !== null),
    next: `复核下面这份询价包，重点看 KI 与发行商覆盖；确认无误后点「接受询价请求」，一次发给 ${issuers.length} 家发行商比价。`,
  }
}

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
  dragArtifactId,
}: {
  icon?: React.ReactNode
  title: string
  subtitle?: string
  status?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  /** 传入产物 id 后卡片标题栏可拖起，拖入右侧私有工作区（反向门） */
  dragArtifactId?: string
}) {
  return (
    <section className={`stage-card ${className}`.trim()}>
      <header
        className="stage-card-head"
        draggable={!!dragArtifactId}
        title={dragArtifactId ? '按住拖到右侧 → 拉入私有工作区讨论' : undefined}
        onDragStart={dragArtifactId ? (e) => { e.dataTransfer.setData('text/plain', dragArtifactId); e.dataTransfer.effectAllowed = 'copy'; setDragGhost(e, `⇢ ${title}`); store.setDragging({ kind: 'artifact', id: dragArtifactId }) } : undefined}
        onDragEnd={dragArtifactId ? () => store.setDragging(null) : undefined}
      >
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
          <span>{fieldLabel(row.label)}</span><strong>{row.value}</strong>
        </div>
      ))}
    </div>
  )
}

export function StructureWorkspace() {
  const { artifacts, role, truth } = useEngine()
  const artifact = latestArtifact(artifacts, 'structureProposal')
  if (!artifact || artifact.data.type !== 'structureProposal') return <TransitionWorkspace />
  const d = artifact.data
  const picked = d.options.filter((option) => d.selectedIds.includes(option.optionId))
  return (
    <div className="stage-workspace structure-workspace">
      <StageEvent time="14:13"><b>方向已与客户确定</b></StageEvent>
      <StageEvent time="14:16"><b>客户需求已共同确认</b></StageEvent>
      <StageEvent time="14:17" tone="progress"><b>David 细化交易要素</b></StageEvent>
      <StageCard dragArtifactId={artifact.id} title="结构方案" status={<StatusBadge status={artifact.status} />} className="structure-stage-card"
        footer={<StageActionBar source="已确认客户需求 · 14:16">
          <ActionBtn label="请求询价" kind="primary" allowed={FCN_WORKFLOW.approveStructure.allowedRoles} role={role} onClick={() => confirmThen({ key: 'approveStructure', title: `批准结构并发出询价（${picked.length} 个变体）？`, summary: [...picked.map((o) => `${o.label} · Strike ${o.strike} · ${o.autocall} · ${o.couponTarget}`), `共用锁定要素：KI ${picked[0]?.knockIn} · 6M · 0700.HK 单一标的`], consequence: `${picked.length} 个变体将同时进入询价，报价矩阵按「变体 × 发行商」返回。最终由客户在报价阶段选定一个，交易台不代客户收窄。`, confirmLabel: '请求询价' })} />
        </StageActionBar>}
      >
        {d.lockedTerms?.length ? (
          <div className="locked-terms">
            <div className="locked-terms-head"><ShieldCheck size={14} /><strong>客户确认约束 · 不可调</strong></div>
            <div className="locked-terms-grid">
              {d.lockedTerms.map((t) => <div key={t.label}><span>{t.label}</span><strong>{t.value}</strong></div>)}
            </div>
          </div>
        ) : null}
        {/* 原来这里有一整块「AI 交易要素说明」，说的和上面锁定要素条、以及下面变体列表
            完全重复（同一句话还写了两遍）。只有「David 改过什么」是别处没有的，留一行。 */}
        {d.modifiedNote ? <p className="structure-revised">{d.modifiedNote}</p> : null}

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
                  <ActionBtn label="批准偏离 · 直接询价" kind="primary" allowed={FCN_WORKFLOW.approveDeviation.allowedRoles} role={role} onClick={() => confirmThen({ key: 'approveDeviation', title: '批准流程偏离', summary: ['跳过：结构三方案对比', '依据：客户邮件完整条款 FCN · 6M · Strike 80% · KI 70%', '强制检查不豁免：适当性 · 职责分离', '偏离将单独留痕并计入流程改进统计'], consequence: '批准后案例直接进入询价（RFQ）。此偏离作为独立审计事件记录，不豁免任何策略检查。', confirmLabel: '批准偏离', danger: true })} />
                </div>
              ) : dev.approvedMeta ? <div className="deviation-approved">✓ {dev.approvedMeta}</div> : null}
            </div>
          )
        })()}
        {truth.status === 'STRUCTURE_MODIFICATION_REQUIRED' ? <div className="inline-stage-warning"><AlertTriangle size={15} /><span><strong>已退回修改。</strong>根据市场反馈调整条款并重新审批后，才会生成新的 RFQ 包。</span></div> : null}
        <div className="structure-options">
          {d.options.map((option) => <button key={option.optionId} className={d.selectedIds.includes(option.optionId) ? 'selected' : ''} disabled={role !== 'ps'} onClick={() => store.toggleOption(option.optionId)}>
            <div className="structure-option-head"><span className="structure-check" />{}<strong>{option.label}</strong>{option.optionId === d.recommendedId ? <Tag tone="ai">AI 起点</Tag> : null}<span className="structure-coupon">{option.couponTarget}</span></div>
            <div className="structure-option-terms"><span>{option.productType} · {option.tenor}</span><span>Strike <b>{option.strike}</b></span><span>KI <b>{option.knockIn}</b></span><span>{option.autocall}</span></div>
            <p>{option.rationale}</p>{option.tradeoff ? <p className="structure-tradeoff">取舍：{option.tradeoff}</p> : null}<div className="structure-risks">{option.risks.map((risk) => <Tag key={risk}>{risk}</Tag>)}</div>
          </button>)}
        </div>
      </StageCard>
    </div>
  )
}

const TRANSITION_COPY: Record<string, { eyebrow: string; title: string; steps: string[]; tone?: 'warning' | 'success' }> = {
  CLIENT_NEED_JOINT_REVIEW: { eyebrow: '需求共创', title: 'RM 与产品专家一起同客户界定需求', steps: ['产品专家已加入需求共创', '向客户提出方向性候选', '与客户确定标的与流动性'] },
  CLIENT_NEED_APPROVED: { eyebrow: '需求已共同确认', title: '正在细化交易要素', steps: ['共同界定的需求已锁定为已确认事实', '细化可比变体', '对照收益目标与下行风险'] },
  STRUCTURE_APPROVED: { eyebrow: '已批准结构已锁定', title: '正在生成 RFQ 包', steps: ['冻结已批准结构条款', '生成可发出的 RFQ 包', '核对关键条款与发行商覆盖度'] },
  PRICING_IN_PROGRESS: { eyebrow: '询价进行中', title: '正在收集并标准化发行商报价', steps: ['询价已通过标准接口发出', '收集发行商回应', '标准化条款并按变体归类'] },
  REQUOTE_REQUIRED: { eyebrow: '已请求重报', title: '等待新一轮报价', steps: ['上一版矩阵标记失效', '向发行商请求新报价', '重建可比报价矩阵'], tone: 'warning' },
  WAITING_FOR_CLIENT: { eyebrow: '客户报价已发出', title: '等待 Mr. Chan 回复', steps: ['对客文案经 RM 审核', '报价已通过选定渠道发出', '监听客户回复'] },
  CLIENT_RESPONSE_RECEIVED: { eyebrow: '收到客户回复', title: '正在识别是否构成正式指令', steps: ['保留客户原始回复', '识别指令性措辞', '把证据关联到提取字段'], tone: 'warning' },
  CLIENT_INSTRUCTION_CONFIRMED: { eyebrow: '对客条款已锁死', title: '正在装配给上手方的下单指令', steps: ['锁定已确认客户指令', '装配下单指令（指令形式，不走接口）', '核对执行前控制项'] },
  EXECUTED: { eyebrow: '已代客下单', title: '等待上手方成交回报', steps: ['下单指令已发出', '等待成交回报', '核算实际价差并生成交易登记记录'], tone: 'success' },
  TRADE_RECORD_REVIEW: { eyebrow: '上手方成交确认已到', title: '交易员核对成交要素', steps: ['已从确认邮件抽取成交要素', '可比要素已对过已确认指令', '交易员确认成交票息并登记'], tone: 'warning' },
  BOOKING_REVIEW: { eyebrow: '交易登记记录已产出', title: 'Trade Support 录入簿记', steps: ['交易登记记录已生成', '核对并录入簿记', '等待条款书做三方比对'], tone: 'warning' },
  COMPLETED: { eyebrow: '流程完成', title: '案例已完成', steps: ['客户需求已确认', '交易已执行', '最终条款书已审批'], tone: 'success' },
}

export function TransitionWorkspace() {
  const { truth, role, privateChats } = useEngine()
  const copy = TRANSITION_COPY[truth.status] ?? TRANSITION_COPY.CLIENT_NEED_APPROVED
  // agent 出完初稿之后，这个过渡屏就不该只是"处理中"——得给一条进初稿的路
  const ttPending = privateChats.ps.some((m) => m.draft?.kind === 'tradeTerms' && !m.draft.published)
  // 只给 David 看：这是他的待办。Alice 那边案例已经移交出去了，
  // 给她一个禁用的「等待 David 确认」按钮只是噪音。
  const aiDone = truth.status === 'CLIENT_NEED_APPROVED' && ttPending && role === 'ps'
  return (
    // 一张卡：这一步是什么 → 到哪儿了 → 该点什么。
    // 负责人和描述都删了——顶部当前事实条已经写了下一步是谁，描述只是把标题和进度条又说了一遍
    <div className={`transition-card ${copy.tone ?? 'progress'}`}>
      <div className="tc-head">
        <div className="transition-orbit"><span /><Sparkles size={20} /></div>
        <div className="tc-copy"><h2>{copy.title}</h2></div>
        <Tag tone={copy.tone === 'warning' ? 'warning' : copy.tone === 'success' ? 'success' : 'primary'}>{truth.statusLabel}</Tag>
      </div>

      <div className="transition-steps">{copy.steps.map((step, index) => {
        // agent 已出稿时，前两步都该是完成态，第三步等人
        const done = index === 0 || copy.tone === 'success' || (aiDone && index <= 1)
        const active = !done && (aiDone ? index === 2 : index === 1)
        return (
          <div key={step} className={done ? 'done' : active ? 'active' : ''}>
            <span>{done ? <Check size={12} /> : index + 1}</span>
            <strong>{step}</strong>
            {active && copy.tone !== 'success' ? <small>{aiDone ? '待产品专家确认' : '进行中'}</small> : null}
          </div>
        )
      })}</div>

      {aiDone ? (
        <div className="tc-action">
          <span><Sparkles size={13} />交易要素初稿已生成，在你的私有工作区，确认后发布为结构方案。</span>
          <Button icon={Sparkles} onClick={() => store.togglePrivate(true)}>查看交易要素初稿</Button>
        </div>
      ) : null}
    </div>
  )
}

export function RFQWorkspace() {
  const { artifacts, role } = useEngine()
  const [briefOpen, setBriefOpen] = useState(false)
  const artifact = latestArtifact(artifacts, 'rfqPackage')
  if (!artifact || artifact.data.type !== 'rfqPackage') return null
  const d = artifact.data
  const fv = (label: string) => value(d.fields, label)
  // 加入简报是给 Ken 本人看的，别人没必要知道他收到过什么。
  // 它跟着「Ken 加入」这条事件走——就是那一刻发生的事，所以挂在同一行，
  // 就地展开，不弹窗：读完顺手就往下看询价包，不该被一层浮层打断。
  const brief = joinBrief(d.issuers)
  return (
    <div className="stage-workspace">
      <StageEvent time="14:20">
        Ken 在 <b>RFQ 就绪</b> 时加入
        {role === 'dealer' ? (
          <button className={`stage-brief${briefOpen ? ' open' : ''}`} onClick={() => setBriefOpen((v) => !v)}>
            <Sparkles size={12} />AI 简报<ChevronDown size={12} />
          </button>
        ) : null}
      </StageEvent>
      {role === 'dealer' && briefOpen ? (
        <div className="stage-brief-panel">
          <p className="sbp-meta">{brief.meta}</p>
          <p className="sbp-lead">{brief.want}</p>
          <div className="sbp-section">
            <span>为什么定成这样</span>
            <ul>{brief.why.map((line) => <li key={line}>{line}</li>)}</ul>
          </div>
          <p className="sbp-next"><strong>轮到你</strong>{brief.next}</p>
        </div>
      ) : null}
      <StageEvent time="14:19"><b>结构方案已审批</b></StageEvent>
      <StageCard
        dragArtifactId={artifact.id}
        title="询价包"
        subtitle="交易员复核后发向市场"
        status={<StatusBadge status={artifact.status} />}
        className="rfq-card"
        footer={
          <StageActionBar source="已批准结构 · 14:19">
            <ActionBtn label="退回修改" kind="ghost" allowed={FCN_WORKFLOW.returnRFQ.allowedRoles} role={role} onClick={() => confirmThen({ key: 'returnRFQ', title: '退回修改', summary: ['RFQ 包将标记为已作废', '案例退回产品专家'], consequence: '已批准结构将重新开放修改。', confirmLabel: '退回修改', danger: true })} />
            <ActionBtn label="接受询价请求" kind="primary" allowed={FCN_WORKFLOW.acceptPricing.allowedRoles} role={role} onClick={() => confirmThen({ key: 'acceptPricing', title: '向发行商发出询价？', summary: [`FCN · 0700.HK · USD 1M · ${fv('Tenor')}`, `Strike ${fv('Strike')} · KI ${fv('Knock-In')}`, `发给 ${d.issuers.length} 家发行商`], consequence: '询价将通过标准接口发给选定发行商（结构化返回，通常几分钟内），案例进入定价阶段。', confirmLabel: '接受询价请求' })} />
          </StageActionBar>
        }
      >
        <TermsTable rows={d.fields} />
        <div className="rfq-issuers"><span>发行商清单</span><div>{d.issuers.map((issuer) => <Tag key={issuer}>{issuer}</Tag>)}</div></div>
        <div className="rfq-checks">
          {d.checks.map((check) => <div key={check.label}><CheckCircle2 size={15} /><strong>{check.label}</strong></div>)}
        </div>
      </StageCard>
    </div>
  )
}

/**
 * 报价矩阵正文（推荐块 + 变体 × 发行商 矩阵 + 脚注）。
 *
 * 抽出来是因为它有两个去处：定价阶段的产物卡，和之后在对客报价卡上点
 * 「查看报价矩阵」时弹出的抽屉——那里要看的就是上一步这张真矩阵，
 * 不是一段描述它的文字。
 */
export function QuoteMatrixBody() {
  const { artifacts, truth } = useEngine()
  const artifact = latestArtifact(artifacts, 'quoteMatrix')
  if (!artifact || artifact.data.type !== 'quoteMatrix') return null
  const d = artifact.data
  const comparable = d.quotes.filter((quote) => quote.comparable)
  const nonComparable = d.quotes.filter((quote) => !quote.comparable)
  const rows = d.variants ?? []
  const multi = rows.length > 1
  const best = comparable.find((quote) => quote.best) ?? comparable[0]
  const approvedKI = truth.approvedTerms ? value(truth.approvedTerms, 'KI') : '65%'
  const issuers = [...new Set(d.quotes.map((q) => q.issuer))]
  const cell = (variantId: string, issuer: string) =>
    d.quotes.find((q) => q.variantId === variantId && q.issuer === issuer)
  return (
    <>
        {multi ? (
          <>
            <div className="matrix-recommendation">
              <Sparkles size={18} />
              <div>
                <span>逐变体最优可比报价</span>
                {/* 一行一个变体：挤成一行时会在变体中间断开，读的人得回头找边界 */}
                <ul className="matrix-best-list">
                  {rows.map((r) => (
                    <li key={r.id}>
                      <b>{r.label.replace('变体 ', '')}</b>
                      <span>{r.bestIssuer}</span>
                      <em>{r.bestCoupon?.toFixed(2)}%</em>
                    </li>
                  ))}
                </ul>
                <p>{d.bestNote}</p>
              </div>
            </div>
            {/* 二维矩阵：一维列表里"谁最优"一眼可见，二维才需要归一化 */}
            <div className="matrix-grid-wrap">
              <table className="matrix-grid">
                <thead>
                  <tr><th>变体</th>{issuers.map((i) => <th key={i}>{i}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <th><strong>{r.label}</strong><small>{r.terms}</small></th>
                      {issuers.map((i) => {
                        const q = cell(r.id, i)
                        if (!q) return <td key={i} className="mc empty">—</td>
                        if (q.coupon === null) return <td key={i} className="mc none"><span>{q.statusLabel}</span></td>
                        if (!q.comparable) return <td key={i} className="mc off"><b>{q.coupon.toFixed(2)}%</b><span>KI {q.ki} 不可比</span></td>
                        return <td key={i} className={`mc${q.best ? ' best' : ''}`}><b>{q.coupon.toFixed(2)}%</b>{q.best ? <span>本变体最优</span> : null}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="matrix-foot"><ShieldCheck size={14} /><span>{d.freshnessNote}</span></div>
          </>
        ) : (
          <>
            <div className="matrix-recommendation">
              <Sparkles size={18} /><div><span>最优可比报价</span><strong>{best?.issuer} · {best?.coupon?.toFixed(2)}% p.a.</strong><p>条款与已批准结构一致的报价中票息最高。</p></div>
              <div className="matrix-valid"><span>有效期</span><Validity note="跨日未成交需重新询价" /></div>
              <Tag tone="ai">AI 推荐</Tag>
            </div>
            <QuoteTable title="条款可比" quotes={comparable} approvedKI={approvedKI} />
            <QuoteTable title="条款不可比" quotes={nonComparable} approvedKI={approvedKI} nonComparable />
          </>
        )}
    </>
  )
}

export function QuoteMatrixWorkspace() {
  const { artifacts, role } = useEngine()
  const artifact = latestArtifact(artifacts, 'quoteMatrix')
  if (!artifact || artifact.data.type !== 'quoteMatrix') return null
  const d = artifact.data
  const nonComparable = d.quotes.filter((quote) => !quote.comparable)
  const rows = d.variants ?? []
  const multi = rows.length > 1
  const issuers = [...new Set(d.quotes.map((q) => q.issuer))]
  return (
    <div className="stage-workspace matrix-workspace">
      <StageEvent time="14:21"><b>询价已受理并发出</b><span>{issuers.join(' · ')}</span></StageEvent>
      <StageEvent time="14:22" tone="progress"><b>{d.quotes.filter((q) => q.coupon !== null).length} 条报价已标准化</b><span>{multi ? `${rows.length} 变体 × ${issuers.length} 家` : '1 条条款不可比 · 1 家未回复'}</span></StageEvent>
      <StageCard
        dragArtifactId={artifact.id}
        title="报价矩阵"
        subtitle={multi ? '变体 × 发行商' : '市场报价对比'}
        status={<><Tag tone="success">{d.quotes.filter((q) => q.coupon !== null).length} 条回价</Tag><Tag tone="warning">{nonComparable.filter((q) => q.coupon !== null).length} 条条款不可比</Tag></>}
        className="quote-matrix-card"
        footer={
          <StageActionBar source="发行商实时报价 · 14:22">
            {/* 「拉入私区讨论」去掉了：顶栏有私区入口、交易室标题行也有一个，
                而且这张卡的标题栏本来就能直接拖进私区，三个入口做同一件事。 */}
            <ActionBtn label="请求重报" kind="ghost" allowed={FCN_WORKFLOW.requestRequote.allowedRoles} role={role} onClick={() => confirmThen({ key: 'requestRequote', title: '请求重报', summary: ['向全部发行商请求新报价', '当前矩阵将标记为失效'], consequence: '新报价返回后重新生成可比矩阵。', confirmLabel: '请求重报' })} />
            <ActionBtn label="修改结构" kind="secondary" allowed={FCN_WORKFLOW.modifyFromPricing.allowedRoles} role={role} onClick={() => confirmThen({ key: 'modifyFromPricing', title: '修改结构', summary: ['案例退回结构设计', '当前报价矩阵将失效'], consequence: '结构重新审批后需要重新询价。', confirmLabel: '修改结构', danger: true })} />
            <ActionBtn label={multi ? `准备客户报价（${rows.length} 个选项）` : '准备客户报价'} kind="primary" allowed={FCN_WORKFLOW.prepareClientQuote.allowedRoles} role={role} onClick={() => confirmThen({ key: 'prepareClientQuote', title: '准备客户报价', summary: rows.map((r) => `${r.label} → ${r.bestIssuer ?? '无可比报价'} ${r.bestCoupon?.toFixed(2) ?? '—'}%`), consequence: multi ? `${rows.length} 个选项都会给到客户，由客户选定一个。交易台不代客户收窄。` : 'AI will prepare a client-facing quote for RM review.', confirmLabel: '准备客户报价' })} />
          </StageActionBar>
        }
      >
        <QuoteMatrixBody />
      </StageCard>
    </div>
  )
}

function QuoteTable({ title, quotes, approvedKI, nonComparable = false }: { title: string; quotes: Extract<Artifact['data'], { type: 'quoteMatrix' }>['quotes']; approvedKI: string; nonComparable?: boolean }) {
  return (
    <div className="quote-table-block">
      <div className="quote-table-title"><strong>{title}</strong><span>{nonComparable ? '条款不可比或未回复' : '与已批准 RFQ 条款一致'}</span></div>
      <div className="quote-table-wrap"><table><thead><tr><th>发行商</th><th>票息</th><th>Strike</th><th>KI</th><th>有效期</th><th>判定</th></tr></thead>
        <tbody>{quotes.map((quote) => <tr key={quote.id} className={quote.best ? 'best' : ''}>
          <td><strong>{quote.issuer}</strong>{quote.best ? <Tag tone="success">Best</Tag> : null}</td>
          <td className="mono">{quote.coupon === null ? '—' : `${quote.coupon.toFixed(2)}%`}</td><td>{quote.coupon === null ? '—' : quote.strike}</td>
          <td>{quote.ki}{quote.coupon !== null && quote.ki !== approvedKI ? <span className="quote-diff"> ≠ {approvedKI}</span> : null}</td>
          <td><Validity /></td>
          <td>{quote.coupon === null ? <Tag>未回复</Tag> : nonComparable ? <Tag tone="warning">条款不可比</Tag> : <Tag tone="success">可比</Tag>}</td>
        </tr>)}</tbody></table></div>
    </div>
  )
}

export function ClientQuoteWorkspace() {
  const { artifacts, role } = useEngine()
  const artifact = latestArtifact(artifacts, 'clientQuote')
  if (!artifact || artifact.data.type !== 'clientQuote') return null
  const d = artifact.data
  const tv = (label: string) => value(d.terms, label)
  const opts = d.options ?? []
  const multi = opts.length > 1
  return (
    <div className="stage-workspace client-quote-workspace">
      {/* 多变体时不再把三条报价平铺在事件行上——下面那张卡就是全文，
          而且事件行是 nowrap，长了会被右边缘裁掉 */}
      <StageEvent time="14:23"><b>{multi ? '逐变体最优可比报价已选定' : '已选定 Morgan Stanley'}</b>{multi ? null : <span>最优可比报价 · {tv('Coupon')}</span>}</StageEvent>
      <StageEvent time="14:24" tone="progress"><b>对客表述已生成</b><span>风险披露与对客表述已生成，待 RM 审核</span></StageEvent>
      <StageCard dragArtifactId={artifact.id} title="对客报价" subtitle={multi ? `${opts.length} 个选项 · 由客户选定` : 'RM 复核后发给客户'} status={<StatusBadge status={artifact.status} />} className="client-quote-stage-card"
        footer={<StageActionBar source="报价矩阵 · 逐变体最优可比报价">
          <ActionBtn label="请求更新报价" kind="ghost" allowed={FCN_WORKFLOW.requestRequote.allowedRoles} role={role} onClick={() => confirmThen({ key: 'requestRequote', title: '请求更新报价', summary: ['回到定价阶段', '重新向发行商询价'], consequence: '当前客户报价将不再使用。', confirmLabel: '请求更新报价' })} />
          {/* 点开看的是上一步那张真矩阵（变体 × 发行商），不是一段描述它的文字 */}
          <ActionBtn label="查看报价矩阵" kind="secondary" allowed={['rm', 'dealer']} role={role} onClick={() => store.openDrawer({ type: 'matrix', payload: { title: '报价矩阵', meta: '定价阶段 · 14:22', body: d.internalNote } })} />
          <ActionBtn label={multi ? `发送 ${opts.length} 个选项给客户` : '发送给客户'} kind="primary" allowed={FCN_WORKFLOW.sendClientQuote.allowedRoles} role={role} onClick={() => confirmThen({ key: 'sendClientQuote', title: '把报价发给客户？', summary: multi ? opts.map((o) => `${o.label} · ${o.issuer} ${o.coupon.toFixed(2)}% · ${value(o.terms, 'Autocall')}`) : [`${d.issuer} · ${tv('Coupon')}`, `FCN 0700.HK · 6M · Strike ${tv('Strike')} · KI ${tv('Knock-In')}`], consequence: multi ? `${opts.length} 个选项一并发给客户，由客户选定一个后才形成正式指令。下面是要发出去的正文全文——发出后不可撤回。` : '下面是要发出去的正文全文，发出后不可撤回；案例转入等待客户回复。', preview: { label: '对客邮件正文（可在私区编辑）', body: store.clientEmailBody() }, confirmLabel: '发送给客户', channels: [
            { key: 'email', label: '发邮件', detail: '按你过目的正文发出，邮件本身即留痕' },
            { key: 'phone', label: '打电话', detail: '通话后在交易室上传录音，AI 转写并识别客户意图' },
          ] })} />
        </StageActionBar>}
      >
        {/* 收窄留给客户：交易台给的是选项，不是结论 */}
        {multi ? (
          <div className="cq-options">
            <div className="stage-block-label">客户选项 · 由客户选定一个</div>
            {opts.map((o) => (
              <div className="cq-option" key={o.id}>
                <div className="cq-option-head"><strong>{o.label}</strong><span className="cq-issuer">{o.issuer}</span><b>{o.coupon.toFixed(2)}%</b><small>p.a.</small></div>
                <div className="cq-option-terms">{o.terms.filter((t) => ['Strike', 'Knock-In', 'Autocall'].includes(t.label)).map((t) => <span key={t.label}>{t.label} <b>{t.value}</b></span>)}</div>
                <p>{o.summary}</p>
                {o.tradeoff ? <p className="cq-tradeoff">取舍：{o.tradeoff}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className="client-quote-hero">
          <div><span>对客报价 · 待 RM 审核</span><strong>Tencent 6M FCN{multi ? ` · ${opts.length} 个选项` : ''}</strong><p>Mr. Chan · 经办 Alice</p></div>
          <div className="client-countdown"><Clock3 size={16} /><span>报价有效期</span><Validity /><small>跨日未成交需重新询价；执行前不再刷新价格</small></div>
        </div>
        {multi ? null : <TermsTable rows={d.terms} />}
        <div className="risk-explanation"><div className="stage-block-label">风险披露（随报价一并发出）</div><p className="risk-line">{d.riskSummary}</p></div>
        {/* 对客文案只有一份：需求阶段那份已脱敏的方向说明。这里不另起一稿，
            否则同一件事两份稿子，现场会被追问哪份是真的。 */}
        <div className="client-draft-ref"><Mail size={14} /><span>对客文案沿用需求阶段已审核的《对客方向说明》（已移除内部指示价与持仓数据）；本次只补充上方 {opts.length} 个选项的票息。</span><Button variant="ghost" onClick={() => store.togglePrivate(true)}>在私区查看</Button></div>
      </StageCard>
    </div>
  )
}

/**
 * 报价发出之后、客户回复之前的这一屏。
 *
 * 两条渠道在这里分叉：邮件把发出去的正文摆出来（它本身就是证据），
 * 电话则什么都还没有——得等 RM 把录音传回来，转写完客户说了什么才进得了系统。
 */
export function ClientOutreachWorkspace() {
  const { artifacts, role, clientChannel } = useEngine()
  const email = artifacts['art-email']
  const byPhone = clientChannel === 'phone'
  return (
    <div className="stage-workspace">
      <StageEvent time="14:27"><b>{byPhone ? '已与客户电话沟通报价' : '对客邮件已发出'}</b></StageEvent>
      {byPhone ? (
        <StageCard title="通话记录" subtitle="待上传录音" status={<Tag tone="warning">待上传</Tag>}
          footer={<StageActionBar source="对客报价 · 14:27">
            <ActionBtn label="上传通话录音" kind="primary" allowed={['rm']} role={role} onClick={() => store.uploadCallRecording()} />
          </StageActionBar>}
        >
          <div className="call-upload">
            <span className="call-upload-icon"><Mic size={20} /></span>
            <div>
              <strong>通话结束后上传录音</strong>
              <p>电话没有原始记录，客户说过什么只存在于这通电话里。上传后 AI 会转写成逐字稿，并从中识别是否构成正式指令——识别结果仍需你确认。</p>
            </div>
          </div>
          <div className="call-upload-note"><ShieldCheck size={14} /><span>录音与逐字稿一并归档，作为客户指令的确认记录。</span></div>
        </StageCard>
      ) : email && email.data.type === 'clientEmail' ? (
        <StageCard dragArtifactId={email.id} title="对客邮件" subtitle="AI 起草 · RM 审核后发出" status={<StatusBadge status={email.status} />}
          footer={<StageActionBar source={`对客报价 · ${email.data.sentAt}`}><span className="email-sent-note">已发出，等待客户回复</span></StageActionBar>}
        >
          <div className="email-head">
            <div><span>收件人</span><strong>{email.data.to}</strong></div>
            <div><span>主题</span><strong>{email.data.subject}</strong></div>
          </div>
          <div className="email-body">{email.data.body}</div>
        </StageCard>
      ) : null}
    </div>
  )
}

/** 通话转写卡：逐字稿 + 高亮出被识别为指令的那两句 */
export function CallTranscriptCard() {
  const { artifacts } = useEngine()
  const a = artifacts['art-transcript']
  if (!a || a.data.type !== 'callTranscript') return null
  const d = a.data
  return (
    <StageCard dragArtifactId={a.id} title="通话转写" subtitle={`${d.recordingId} · ${d.duration}`} status={<StatusBadge status={a.status} />}>
      <div className="transcript-lines">
        {d.lines.map((l, i) => (
          <div className={`transcript-line${l.highlight ? ' hit' : ''}`} key={i}>
            <span>{l.speaker}</span><p>{l.text}</p>
          </div>
        ))}
      </div>
      <div className="transcript-foot"><Sparkles size={14} /><span>AI 从高亮两句识别出<b>{d.intent}</b> · 置信度 {d.confidence}；识别结果仍需人确认。</span></div>
    </StageCard>
  )
}

export function InstructionReviewWorkspace() {
  const { artifacts, role, clientChannel } = useEngine()
  const byPhone = clientChannel === 'phone'
  const artifact = latestArtifact(artifacts, 'instruction')
  if (!artifact || artifact.data.type !== 'instruction') return null
  const d = artifact.data
  const iv = (label: string) => value(d.terms, label)
  return (
    <div className="stage-workspace instruction-workspace">
      <StageEvent time="14:36"><b>收到客户回复</b><span>{byPhone ? '通话录音已转写' : '客户邮件回复'}</span></StageEvent>
      {byPhone ? <CallTranscriptCard /> : null}
      <StageEvent time="14:36" tone="progress"><b>AI 已把客户回复对齐到指令要素</b><span>待 RM 确认为正式指令</span></StageEvent>
      <StageCard title="客户指令识别" subtitle="来源核对" status={<Tag tone="warning">待 RM 确认</Tag>} className="instruction-stage-card">
        <div className="instruction-split">
          <Panel className="instruction-email"><div className="split-panel-head"><span><Mail size={15} />客户回复</span><Tag>来源证据</Tag></div><div className="email-meta">Mr. Chan · 14:36 · {byPhone ? '通话转写 rec-20260525-1436（录音已归档）' : '邮件回复（原件已归档）'}</div><p>我选<mark>不设赎回那个</mark>吧，我看好腾讯，要是涨回去就被提前赎回了反而可惜。</p><p><mark>USD 1,000,000</mark>，请<mark>今天内</mark>帮我执行。</p><div className="evidence-note"><FileCheck2 size={14} />每个要素都可回溯到客户原话。</div></Panel>
          <Panel className="instruction-extract"><div className="split-panel-head"><span><Sparkles size={15} />AI 提取的客户指令</span><Tag tone="success">已关联证据</Tag></div><div className="intent-row"><span>识别意图</span><strong>{d.intent}</strong><Tag tone="warning">置信度 {d.confidence}</Tag></div><TermsTable rows={d.terms} /><div className="freshness-row"><div><ShieldCheck size={16} /><span><strong>对客条款</strong>确认后即锁死，不因上手价变动而改</span></div><Validity /></div><div className="inline-stage-warning"><AlertTriangle size={15} /><span>确认后创建正式客户指令记录，对客票息就此锁死。交易员随后以场外指令形式代客下单，不再刷新价格。</span></div><div className="instruction-actions"><ActionBtn label="不是指令" kind="ghost" allowed={FCN_WORKFLOW.rejectInstruction.allowedRoles} role={role} onClick={() => confirmThen({ key: 'rejectInstruction', title: '驳回 AI 识别结果', summary: ['将本次识别标记为无效', '案例回到等待客户'], consequence: '不会创建下单指令。', confirmLabel: '驳回识别', danger: true })} /><Button variant="secondary">追问客户</Button><ActionBtn label="确认为正式指令" kind="primary" allowed={FCN_WORKFLOW.confirmInstruction.allowedRoles} role={role} onClick={() => confirmThen({ key: 'confirmInstruction', title: '确认为正式客户指令', summary: [`${iv('Issuer')} · ${iv('Notional')}`, `${iv('Product')} · ${iv('Strike / KI')}`, iv('Timing')], consequence: '将创建正式客户指令记录，对客条款锁死；AI 随后装配给上手方的下单指令，交由交易员复核后代客下单。', confirmLabel: '确认指令' })} /></div></Panel>
        </div>
      </StageCard>
    </div>
  )
}

export function ExecutionWorkspace() {
  const { artifacts, role } = useEngine()
  const artifact = latestArtifact(artifacts, 'executionTicket')
  if (!artifact || artifact.data.type !== 'executionTicket') return null
  const d = artifact.data
  const ev = (label: string) => value(d.fields, label)
  return (
    <div className="stage-workspace execution-workspace">
      <StageEvent time="14:38"><b>客户指令已确认 · 对客条款锁死</b><span>对客票息 {ev('Client Coupon (locked)')}，往后不因上手价变动而改</span></StageEvent>
      <StageEvent time={d.quoteTime} tone="progress"><b>下单指令已装配</b><span>场外指令形式，不走询价接口</span></StageEvent>
      <StageCard dragArtifactId={artifact.id} title="下单指令" subtitle="交易员复核 · 代客下单" status={<StatusBadge status={artifact.status} />} className="execution-stage-card"
        footer={<StageActionBar source="已确认客户指令 · 已批准结构">
          <Button variant="secondary">回到客户指令</Button>
          <ActionBtn label="确认并代客下单" kind="primary" allowed={FCN_WORKFLOW.executeTrade.allowedRoles} role={role} onClick={() => confirmThen({ key: 'executeTrade', title: '确认并代客下单', summary: [`${ev('Issuer')} · FCN 0700.HK · ${ev('Channel')}`, `${ev('Notional')} · ${ev('Tenor')} · Strike ${ev('Strike')} · KI ${ev('Knock-In')}`, `对客票息 ${ev('Client Coupon (locked)')}（已锁死）`, '上手成交价在回报到达时才确定'], consequence: '这是一次正式的代客下单。指令将以场外指令形式发给发行商并计入审计。成交回报到达后，系统会核算本单实际价差并生成交易登记记录。', confirmLabel: '确认下单' })} />
        </StageActionBar>}
      >
        <div className="execution-section"><div className="stage-block-label">指令要素</div><TermsTable rows={d.fields} /></div>
        {/* 执行前控制项：验资验券这类是内核检查点，AI 只读结果不参与 */}
        {d.preTradeChecks?.length ? (
          <div className="execution-section">
            <div className="stage-block-label">执行前控制项</div>
            <div className="pretrade-grid">
              {d.preTradeChecks.map((c) => (
                <div className={`pretrade-check ${c.status}`} key={c.label}>
                  <span className="pc-icon">{c.status === 'passed' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}</span>
                  <div><strong>{c.label}</strong><span>{c.detail}</span></div>
                  {c.status === 'unconfirmed' ? <Tag tone="warning">待确认</Tag> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {/* 「不刷新价格」那条去掉了：对客票息已锁死这件事，
            上面「对客票息（已锁死）10.27%」这一格就说完了，
            确认弹窗里也会再说一次，这里是第三遍。 */}
      </StageCard>
    </div>
  )
}

/**
 * 成交要素核对：左边上手方的成交确认邮件，右边抽取结果 + 与已确认指令的逐项比对。
 *
 * 和需求那屏同一个组件、同一套联动，差别在这一端有**第二个真相可比**：
 * 能比的项由系统对着指令自动核平，比不了的那一项（成交票息）才要交易员确认。
 * 这就是交易员那张 Excel 被取代的地方——他不再抄九项，只签一个数。
 */
function FillConfirmReview({ artifact }: { artifact: Artifact }) {
  const { role } = useEngine()
  if (artifact.data.type !== 'tradeRecord') return null
  const d = artifact.data
  if (!d.extracted || !d.confirmEmail) return null
  const fields = buildFillFields(d.extracted, d.expected ?? {})
  const mismatches = fields.filter((f) => f.check === 'mismatch')
  const matched = fields.filter((f) => f.check === 'matches').length
  const needConfirm = fields.filter((f) => f.check === 'new').length
  const sp = d.spread
  return (
    <SourceReviewWorkspace
      initialKey="fill"
      sourceColumnLabel="上手方成交确认邮件"
      fieldsColumnLabel="AI 抽取的成交要素（待登记）"
      briefTitle="交易登记记录"
      countLabel={`${matched}/${fields.length} 与指令一致`}
      doc={fillConfirmEmail(d.confirmEmail)}
      fields={fields.map((f) => ({
        key: f.key,
        label: f.label,
        value: f.value,
        source: f.expected ? `指令为 ${f.expected} · ${f.source}` : f.source,
        originLabel: f.checkLabel,
        originTone: f.tone,
        open: f.open,
      }))}
      banner={
        <Panel className="review-summary-banner">
          <span className="review-summary-icon"><ShieldCheck size={17} /></span>
          <strong>核对上手方成交确认</strong>
          <span>·</span><span>{matched} 项已对上已确认指令</span>
          <span>·</span><span>{needConfirm} 项为邮件新信息</span>
          {mismatches.length
            ? <><span>·</span><span className="banner-warn">{mismatches.length} 项与指令不符 —— 上手方确认有误</span></>
            : <><span>·</span><span>可比要素已自动核平，你只需确认成交票息</span></>}
        </Panel>
      }
      summary={
        <div className="review-verification-summary">
          <span><CheckCircle2 size={14} />{matched} 项与指令一致</span>
          {mismatches.length
            ? <span className="missing"><AlertTriangle size={14} />{mismatches.length} 项不符，需向上手方更正</span>
            : <span className="muted"><CheckCircle2 size={14} />无差异</span>}
          <span className="muted"><CheckCircle2 size={14} />实际价差 {sp.realisedBp}bp（登记 {sp.registeredBp}bp）</span>
        </div>
      }
      primary={
        <Button
          variant="primary"
          icon={ShieldCheck}
          className="need-primary"
          disabled={role !== 'dealer' || mismatches.length > 0}
          title={
            role !== 'dealer'
              ? '只有交易员本人能登记成交要素'
              : mismatches.length
                ? '有要素与已确认指令不符，先向上手方要更正版'
                : undefined
          }
          onClick={() => confirmThen({
            key: 'confirmTradeRecord',
            title: '核对成交要素并登记？',
            summary: [
              `${d.extracted?.issuer} · ${d.extracted?.underlying}`,
              `${d.extracted?.notional} · Strike ${d.extracted?.strike} · KI ${d.extracted?.ki}`,
              `成交票息 ${d.extracted?.fill} · ${d.extracted?.tradeDate}`,
              `对客 ${sp.clientCoupon.toFixed(2)}%（锁死）→ 实际价差 ${sp.realisedBp}bp`,
            ],
            consequence: '登记后 Trade Support 的簿记直接从这条记录来，不再手工转抄。收到条款书后将做三方比对。',
            ack: '成交票息与成交时间由我本人核对，与我在场外的成交一致',
            confirmLabel: '核对并登记',
          })}
        >
          <span><strong>核对成交要素并登记</strong><small>{mismatches.length ? '有项与指令不符' : '成交票息需你本人确认'}</small></span>
        </Button>
      }
    />
  )
}

/** 交易登记记录：取代交易员手打的那张 Excel */
export function TradeRecordWorkspace() {
  const { artifacts, role, truth } = useEngine()
  const artifact = latestArtifact(artifacts, 'tradeRecord')
  if (!artifact || artifact.data.type !== 'tradeRecord') return null
  const d = artifact.data
  const sp = d.spread
  // 交易员还没登记时，这一屏是"核对邮件"；登记之后才回到 Trade Support 的簿记视图
  if (truth.status === 'TRADE_RECORD_REVIEW') return <FillConfirmReview artifact={artifact} />
  return (
    <div className="stage-workspace">
      <StageEvent time="14:41"><b>已代客下单</b><span>场外指令形式发给 {value(d.fields, 'Issuer')}</span></StageEvent>
      <StageEvent time="14:44" tone="progress"><b>成交回报已到</b><span>上手成交 {sp.issuerFillCoupon.toFixed(2)}% · 对客 {sp.clientCoupon.toFixed(2)}%（锁死）</span></StageEvent>
      <StageCard dragArtifactId={artifact.id} title="交易登记记录" subtitle="Trade Support 据此录入簿记" status={<StatusBadge status={artifact.status} />}
        footer={<StageActionBar source="已确认指令 + 上手成交回报">
          <ActionBtn label="核对并录入簿记" kind="primary" allowed={FCN_WORKFLOW.confirmBooking.allowedRoles} role={role} onClick={() => confirmThen({ key: 'confirmBooking', title: '核对并录入簿记', summary: [`${value(d.fields, 'Direction')} · ${value(d.fields, 'Issuer')}`, `${value(d.fields, 'Notional')} · Strike ${value(d.fields, 'Strike')} · KI ${value(d.fields, 'Knock-In')}`, `上手成交 ${sp.issuerFillCoupon.toFixed(2)}% / 对客 ${sp.clientCoupon.toFixed(2)}%`], consequence: '簿记直接源自这条登记记录，不再从交易员的 Excel 手工转抄。收到发行商条款书后将做三方比对。', confirmLabel: '录入簿记' })} />
        </StageActionBar>}
      >
        {/* 价差核算：对客价锁死，被压缩的是券商的价差——内部损益问题，不惊动客户 */}
        <div className={`spread-panel${sp.breached ? ' breached' : ''}`}>
          <div className="spread-head"><strong>本单价差核算</strong><Tag tone={sp.breached ? 'warning' : 'success'}>{sp.mode}</Tag></div>
          <div className="spread-grid">
            <div><span>上手成交</span><strong>{sp.issuerFillCoupon.toFixed(2)}%</strong></div>
            <div><span>对客（锁死）</span><strong>{sp.clientCoupon.toFixed(2)}%</strong></div>
            <div><span>登记价差</span><strong>{sp.registeredBp}bp</strong></div>
            <div className={sp.breached ? 'warn' : ''}><span>实际价差</span><strong>{sp.realisedBp}bp</strong></div>
          </div>
          {sp.breached ? (
            <div className="spread-alert"><AlertTriangle size={14} /><span>实际价差 {sp.realisedBp}bp 低于阈值 {sp.thresholdBp}bp。对客条款已锁死不受影响——这是内部损益问题，不需要与客户沟通。</span></div>
          ) : null}
        </div>
        <div className="execution-section"><div className="stage-block-label">登记要素</div><TermsTable rows={d.fields} /></div>
        <div className="replaces-note"><Route size={14} /><span><strong>这条记录取代了什么</strong>{d.replacesNote}</span></div>
      </StageCard>
    </div>
  )
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
      <StageEvent time="14:52"><b>簿记已录入</b><span>源自交易登记记录，无手工转抄</span></StageEvent>
      <StageEvent time="14:56" tone="progress"><b>已收到发行商条款书</b><span>三方比对：{mismatch ? '1 项差异（发行商一侧）' : '全部一致'}</span></StageEvent>
      <div className="ai-assessment-banner"><Route size={19} /><div><span>AI 异常评估</span><strong>{mismatch ? '文档差异 · 中等严重度' : '未发现异常'}</strong><p>{mismatch ? '发行商条款书与已执行的结算条款不一致；客户指令与执行记录本身是对得上的。' : '最终条款与执行记录逐项一致。'}</p></div><Tag tone={mismatch ? 'warning' : 'success'}>{mismatch ? '需复核' : '已核对'}</Tag></div>
      <StageCard dragArtifactId={artifact.id} title="条款书核对" subtitle="执行记录 vs 发行商条款书" status={<StatusBadge status={artifact.status} />} className="termsheet-stage-card"
        footer={<StageActionBar source="交易登记记录 + 簿记 · 14:52 + MS Final Term Sheet · 14:56">
          {inException ? <ActionBtn label="异常已解决" kind="primary" allowed={FCN_WORKFLOW.resolveException.allowedRoles} role={role} onClick={() => confirmThen({ key: 'resolveException', title: '关闭文档异常', summary: ['Morgan Stanley 已确认结算应为 T+2', '已收到更正版条款书'], consequence: '案例回到条款书待审批。', confirmLabel: '关闭异常' })} /> : mismatch ? <><ActionBtn label="批准评估" kind="secondary" allowed={['ops', 'dealer']} role={role} onClick={() => store.openDrawer({ type: 'source', payload: { title: 'AI 评估依据', meta: '基于证据的分类', body: '客户指令与执行记录都写的是 T+2，只有发行商条款书写 T+3。因此这条异常被判为文档差异，而不是执行错误。' } })} /><ActionBtn label="请求更正版条款书" kind="primary" allowed={FCN_WORKFLOW.raiseException.allowedRoles} role={role} onClick={() => confirmThen({ key: 'raiseException', title: '请求发行商出更正版条款书？', summary: ['分类：文档差异', '结算 T+2 ≠ T+3', '处理方：Morgan Stanley Documentation'], consequence: '异常将转给发行商处理，不需要客户重新确认。', confirmLabel: '请求更正版', danger: true })} /></> : <ActionBtn label="批准条款书" kind="primary" allowed={FCN_WORKFLOW.approveTermsheet.allowedRoles} role={role} onClick={() => confirmThen({ key: 'approveTermsheet', title: '批准最终条款书？', summary: ['所有字段与执行单一致', '复核人 Mia ≠ 执行人 Ken（职责分离）', '归档材料：客户指令（邮件 + 通话录音）· 执行单 · 最终条款书'], consequence: '案例将标记为完成。', confirmLabel: '批准条款书' })} />}
        </StageActionBar>}
      >
        <div className="termsheet-main-grid"><div className="termsheet-diff"><div className="stage-block-label">三方比对 · 内部两方 vs 发行商</div><table><thead><tr><th>字段</th><th>交易登记记录</th><th>簿记</th><th>发行商条款书</th><th>判定</th></tr></thead><tbody>{d.rows.map((row) => <tr key={row.field} className={row.status !== 'match' ? 'mismatch' : ''}><td><strong>{row.field}</strong></td><td>{row.ticket}</td><td className={row.ticket === row.booking ? 'agrees' : 'differs'}>{row.booking}</td><td className={row.booking === row.termsheet ? '' : 'differs'}>{row.termsheet}</td><td>{row.status === 'match' ? <Tag tone="success">一致</Tag> : <Tag tone="warning">差异</Tag>}</td></tr>)}</tbody></table></div>
          <Panel className="source-document-preview"><div className="split-panel-head"><span><FileText size={15} />发行商原始文件</span><Tag>PDF · 14:56</Tag></div><div className="document-sheet"><strong>MORGAN STANLEY</strong><span>FINAL TERMS AND CONDITIONS</span><hr /><p>Underlying <b>Tencent Holdings 0700.HK</b></p><p>Notional <b>USD 1,000,000</b></p><p>Strike / Knock-In <b>{value(d.rows.map((r) => ({ label: r.field, value: r.termsheet })), 'Strike')} / {value(d.rows.map((r) => ({ label: r.field, value: r.termsheet })), 'Knock-In')}</b></p><p>Coupon <b>{value(d.rows.map((r) => ({ label: r.field, value: r.termsheet })), 'Coupon')} p.a.</b></p><p className="document-error">Settlement <b>{value(d.rows.map((r) => ({ label: r.field, value: r.termsheet })), 'Settlement')}</b></p></div></Panel>
        </div>
        {mismatch ? <div className="exception-classification"><div><span>分类</span><strong>文档差异</strong></div><div><span>严重度与成因</span><strong>中 · 发行商文件与内部记录不一致</strong></div><div><span>处理方</span><strong>MS Documentation / Trade Support</strong></div><div><span>客户影响</span><strong>更正后发出则无影响</strong></div><div><span>需客户重新确认</span><strong>否</strong></div><div><span>建议动作</span><strong>请求更正版条款书</strong></div></div> : null}
      </StageCard>
    </div>
  )
}
