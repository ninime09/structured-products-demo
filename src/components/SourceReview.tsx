// 来源核对：左边一份原始文书，右边从它抽出来的字段，两边点哪边都能互相定位。
//
// 这一屏原来是需求阶段的专用页——邮件正文一句一句手打在 JSX 里，产物 id 写死
// 'art-need'。抽出来是因为它在流程里出现第二次：交易员核对上手方的成交确认邮件。
// 两处要的是同一件事——**一份外部文书 + 一份系统抽取的结果 + 一次人工确认**，
// 差别只在文书是谁写的、字段叫什么、确认了之后流程往哪走。
//
// 特意没有做成"配置驱动"的大而全：调用方自己拼 banner / summary / 按钮这些
// ReactNode，因为这几块每屏的语义都不一样，硬塞进一份 schema 只会把两屏的
// 措辞搅成一锅。共用的是骨架与联动，不是文案。

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, CircleAlert, PenLine } from 'lucide-react'
import { Panel } from './primitives'

/** 正文里可点的证据片段——key 与右侧字段对应 */
export interface SourceMark {
  key: string
  text: string
  color: 'purple' | 'green' | 'orange' | 'blue'
}

/** 不可点的高亮（比如客户那句"请给建议"），只做视觉重音 */
export interface PlainMark {
  plain: string
  color?: 'purple' | 'green' | 'orange' | 'blue'
}

/** 段内换行——落款那种「同一段、两行」的排版，拆成两段行距就散了 */
export interface BreakMark { br: true }

export type Segment = string | SourceMark | PlainMark | BreakMark

export interface SourceDoc {
  senderInitials: string
  senderName: string
  /** 收件人那一行的说明，如「收件人: Alice (RM)」 */
  toLabel: string
  time: string
  subject: string
  paragraphs: Segment[][]
  /** 卡片底边左侧那一小行（含图标），由调用方给 */
  footLabel: ReactNode
  sourceIdLabel: string
  sourceId: string
  /**
   * 点了某个字段、但正文里找不到依据时，在正文下方给一句说明。
   * tone 决定是提醒（缺证据）还是确认（值来自别处且合规）。
   */
  missingNotes?: Record<string, { tone: 'warn' | 'ok'; text: string }>
}

export interface ReviewField {
  key: string
  label: string
  value: string
  /** 行尾的完整来源小字 */
  source: string
  /** 来源分类标签的文字 */
  originLabel: string
  /** 来源分类标签的配色档位 */
  originTone: string
  /** 尚无取值 —— 整行走警示色 */
  open: boolean
  editable?: boolean
}

export interface SourceReviewProps {
  /** 两栏的序号标题 */
  sourceColumnLabel: string
  fieldsColumnLabel: string
  banner: ReactNode
  doc: SourceDoc
  fields: ReviewField[]
  briefTitle: string
  /** 摘要卡右上角的计数，如 “7/11 已定” */
  countLabel: string
  /** 摘要卡底部的核实小结 */
  summary: ReactNode
  /** 主操作——渲染在摘要卡底边内 */
  primary: ReactNode
  /** 次级操作——渲染在卡外；没有就整条不出现 */
  secondary?: ReactNode
  /** 默认选中的字段，用来在进屏时就建立左右呼应 */
  initialKey?: string
  onEditField?: (key: string, value: string) => void
}

const isMark = (s: Segment): s is SourceMark => typeof s !== 'string' && 'key' in s
const isPlain = (s: Segment): s is PlainMark => typeof s !== 'string' && 'plain' in s
const isBreak = (s: Segment): s is BreakMark => typeof s !== 'string' && 'br' in s

export function SourceReviewWorkspace({
  sourceColumnLabel,
  fieldsColumnLabel,
  banner,
  doc,
  fields,
  briefTitle,
  countLabel,
  summary,
  primary,
  secondary,
  initialKey,
  onEditField,
}: SourceReviewProps) {
  const [editing, setEditing] = useState<string | null>(null)
  const [linkedKey, setLinkedKey] = useState<string | null>(initialKey ?? null)
  const [pulseTarget, setPulseTarget] = useState<{ side: 'source' | 'field'; key: string } | null>(null)
  const pulseTimer = useRef<number | null>(null)
  useEffect(() => () => {
    if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current)
  }, [])

  // 正文里有这个 key 的高亮吗？没有的话，滚动目标退回整段正文——
  // 否则点「流动性偏好」这种邮件里根本没提的字段，页面会一动不动。
  const markedKeys = new Set(doc.paragraphs.flat().filter(isMark).map((m) => m.key))

  const activateEvidence = (key: string, from: 'source' | 'field') => {
    setLinkedKey(key)
    setPulseTarget(null)
    const targetSide = from === 'source' ? 'field' : 'source'
    requestAnimationFrame(() => {
      setPulseTarget({ side: targetSide, key })
      const targetId = targetSide === 'source' && !markedKeys.has(key)
        ? 'source-email-body'
        : `${targetSide}-evidence-${key}`
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    })
    if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current)
    pulseTimer.current = window.setTimeout(() => setPulseTarget(null), 850)
  }

  const evidenceKeyDown = (event: React.KeyboardEvent, key: string, from: 'source' | 'field') => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    activateEvidence(key, from)
  }

  const sourceClass = (key: string, color: string) =>
    `evidence-mark ${color}${linkedKey === key ? ' linked-active' : ''}${
      pulseTarget?.side === 'source' && pulseTarget.key === key ? ' evidence-pulse' : ''
    }`

  // 选中的字段在正文里没有对应高亮时，整段正文闪一下 + 出说明
  const bodyPulse = pulseTarget?.side === 'source' && !markedKeys.has(pulseTarget.key)
  const note = linkedKey ? doc.missingNotes?.[linkedKey] : undefined

  return (
    <div className="need-review-workspace">
      {banner}

      <div className="need-review-grid">
        <Panel className="review-source-column">
          <div className="review-column-label">1. &nbsp;{sourceColumnLabel}</div>
          <div className="review-email-card">
            <div className="review-email-sender">
              <span className="client-avatar">{doc.senderInitials}</span>
              <span><strong>{doc.senderName}</strong><small>{doc.toLabel}</small></span>
              <time>{doc.time}</time>
            </div>
            <div className="review-email-subject">{doc.subject}</div>
            <div className={`review-email-body${bodyPulse ? ' missing-evidence-pulse' : ''}`} id="source-email-body">
              {doc.paragraphs.map((segments, i) => (
                <p key={i}>
                  {segments.map((seg, j) => {
                    if (typeof seg === 'string') return <span key={j}>{seg}</span>
                    if (isBreak(seg)) return <br key={j} />
                    if (isPlain(seg)) return <mark key={j} className={seg.color ?? 'orange'}>{seg.plain}</mark>
                    return (
                      <mark
                        key={j}
                        id={`source-evidence-${seg.key}`}
                        className={sourceClass(seg.key, seg.color)}
                        role="button"
                        tabIndex={0}
                        aria-controls={`field-evidence-${seg.key}`}
                        aria-pressed={linkedKey === seg.key}
                        onClick={() => activateEvidence(seg.key, 'source')}
                        onKeyDown={(e) => evidenceKeyDown(e, seg.key, 'source')}
                      >
                        {seg.text}
                      </mark>
                    )
                  })}
                </p>
              ))}
              {note ? (
                <div className="source-missing-evidence">
                  {note.tone === 'warn' ? <CircleAlert size={13} /> : <CheckCircle2 size={13} />}
                  <span>{note.text}</span>
                </div>
              ) : null}
            </div>
            <div className="review-email-foot">
              {doc.footLabel}
              <span>{doc.sourceIdLabel}: {doc.sourceId}</span>
            </div>
          </div>
        </Panel>

        <Panel className="review-extraction-column">
          <div className="review-column-label">2. &nbsp;{fieldsColumnLabel}</div>
          <div className="review-brief-head">
            <strong>{briefTitle}</strong>
            <span className="rbh-count">{countLabel}</span>
          </div>
          {/* 一字段一行。之前按来源分组 + 每个字段一张卡，堆起来一屏都放不下——
              这里要的是一眼看完，来源退成行尾的小字。 */}
          <div className="need-rows">
            {fields.map((field) => (
              <div
                id={`field-evidence-${field.key}`}
                className={`need-row${field.open ? ' open' : ''}${linkedKey === field.key ? ' linked-active' : ''}${
                  pulseTarget?.side === 'field' && pulseTarget.key === field.key ? ' evidence-pulse' : ''
                }`}
                key={field.key}
                role="button"
                tabIndex={0}
                aria-pressed={linkedKey === field.key}
                onClick={() => activateEvidence(field.key, 'field')}
                onKeyDown={(e) => evidenceKeyDown(e, field.key, 'field')}
              >
                <span className="nr-label">{field.label}</span>
                {editing === field.key && onEditField ? (
                  <input
                    className="nr-input"
                    autoFocus
                    defaultValue={field.open ? '' : field.value}
                    placeholder="填写取值，回车保存"
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => { onEditField(field.key, e.currentTarget.value); setEditing(null) }}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') { onEditField(field.key, e.currentTarget.value); setEditing(null) }
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                ) : (
                  <strong className="nr-value">{field.value}</strong>
                )}
                <span className={`nr-origin ${field.originTone}`}>{field.originLabel}</span>
                <span className="nr-src" title={field.source}>{field.source}</span>
                {onEditField && field.editable !== false ? (
                  <button
                    className="nr-edit"
                    title="修改这一项"
                    onClick={(e) => { e.stopPropagation(); setEditing(field.key) }}
                  ><PenLine size={11} /></button>
                ) : null}
              </div>
            ))}
          </div>
          {summary}
          {/* 主操作长在摘要卡的底边上——确认的就是这张卡，按钮不该浮在卡外面。 */}
          <div className="need-confirm-bar">{primary}</div>
        </Panel>
      </div>

      {secondary ? <div className="need-review-actions">{secondary}</div> : null}
    </div>
  )
}
