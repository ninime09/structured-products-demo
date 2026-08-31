// 客户需求摘要的取值装配。
//
// 抽出来是因为两个地方要用同一份：来源核对页的完整表，和交易室里置顶的那张实时卡。
// 两处显示不一致比显示得丑更糟——这是同一份需求。

import { NEED_BRIEF_SCHEMA } from './schemas'
import type { FieldOrigin } from './schemas'
import type { NeedFieldUpdate, TermRow } from '../../types'

export interface NeedFieldView {
  key: string
  label: string
  value: string
  source: string
  origin: FieldOrigin
  /** 还没定下来 */
  open: boolean
  /** 讨论里定下来的（而不是邮件抽取的） */
  fromDiscussion: boolean
  /** 人工改过 */
  edited: boolean
  requiresClientConfirmation: boolean
}

export interface NeedViewInput {
  needSettled: boolean
  /** 产品专家已发布方向建议 = 推导字段有了 working assumption */
  hasProposal: boolean
  updates: NeedFieldUpdate[]
  /** 产物里的取值，作为兜底 */
  fields: TermRow[]
  zh: boolean
}

export function buildNeedFields(input: NeedViewInput): NeedFieldView[] {
  const { needSettled, hasProposal, updates, fields, zh } = input
  return NEED_BRIEF_SCHEMA.map((f) => {
    // 讨论里写进来的值优先——它比邮件抽取更新
    const live = updates.find((u) => u.key === f.key)
    const derivedResolved = f.origin === 'derived' && hasProposal
    const open = !live && !!f.pendingBeforeSettle && !needSettled && !derivedResolved
    const settledSource = zh ? f.settledSourceZh : f.settledSourceEn
    return {
      key: f.key,
      label: zh ? f.labelZh : f.labelEn,
      value: live
        ? live.value
        : open
          ? f.origin === 'derived'
            ? zh ? '待推导' : 'To be derived'
            : zh ? '客户未提及' : 'Not stated'
          : (zh ? f.valueZh : f.valueEn) ?? fields.find((r) => r.label === f.fieldLabel)?.value ?? '—',
      source: live ? live.source : (!open && settledSource) || (zh ? f.sourceZh : f.sourceEn),
      origin: f.origin,
      open,
      fromDiscussion: !!live && !live.edited,
      edited: !!live?.edited,
      requiresClientConfirmation: !!f.requiresClientConfirmation,
    }
  })
}

/** 简短的来源分类，给紧凑视图用——完整来源写在第二行 */
export function originLabel(origin: FieldOrigin, fromDiscussion: boolean, zh: boolean): string {
  if (fromDiscussion) return zh ? '讨论确认' : 'From discussion'
  switch (origin) {
    case 'stated': return zh ? '客户明确' : 'Client stated'
    case 'inferred': return zh ? 'AI 推断' : 'AI inferred'
    case 'profile': return zh ? 'CRM 档案' : 'CRM profile'
    default: return zh ? '需推导' : 'Derived'
  }
}
