// 技能插件 manifest：插件的"身份证 + 权限申请表"。
// 展示层的名称/示例在 Overlays 的技能定义里；这里是治理元数据：
// 能读什么、能产出什么、版本、审批人——注册表审批看的就是这张表。
//
// reads 的另一重用途：把所有技能的声明汇总起来，就是「真做这个产品要接哪些库」
// 的清单（数据源面板用的就是它）。

export interface SkillManifest {
  id: string
  version: string
  approvedBy: string
  /** 允许读取的数据面（默认拒绝，声明即上限） */
  reads: string[]
  /** 允许产出的产物（永远是草稿） */
  writes: string[]
  /** 技能永远不能自行触发正式流转 */
  canTriggerTransition: false
}

const M = (
  id: string,
  version: string,
  reads: string[],
  writes: string[],
): SkillManifest => ({ id, version, approvedBy: '合规 · Ashley', reads, writes, canTriggerTransition: false })

export const SKILL_MANIFESTS: Record<string, SkillManifest> = {
  'client-need-extraction': M('client-need-extraction', '1.4', ['email', 'crm.client_profile'], ['artifact.need_brief']),
  'client-follow-up': M('client-follow-up', '1.1', ['case.timeline', 'artifact.client_quote'], ['draft.client_message']),
  'case-prioritization': M('case-prioritization', '1.0', ['case.state', 'case.deadlines'], ['view.priority_list']),
  // 2.1 起加读 crm.holdings：集中度是可算的硬约束，没有持仓就只能给泛泛建议。
  // 这行声明不是装饰——技能能读到什么，直接决定初稿的推导质量。
  'structure-comparator': M('structure-comparator', '2.2', ['artifact.need_brief', 'crm.client_profile', 'crm.holdings', 'catalog.products', 'market.snapshot'], ['artifact.structure_proposal']),
  'suitability-review': M('suitability-review', '1.3', ['crm.client_profile', 'crm.holdings', 'artifact.structure_proposal'], ['check.suitability']),
  // 需求书记员：从交易室讨论里提字段更新。只读客户侧，够它核对讨论里说的数对不对；
  // 写的是草稿字段，最终仍由「确认客户需求」那一步整体把关。
  'need-extractor': M('need-extractor', '1.0', ['case.timeline', 'crm.client_profile', 'crm.holdings'], ['draft.need_fields']),
  // 私区应答：要回答"这个方向为什么不行"这类问题，得能读到算依据的那几个面。
  // 它 writes 的只有草稿——发布仍是人点，manifest 里也没有 transition 权限。
  'trade-room-copilot': M('trade-room-copilot', '1.0', ['case.timeline', 'crm.client_profile', 'crm.holdings', 'catalog.products', 'market.snapshot'], ['draft.private_reply', 'draft.client_message']),
  'structure-stress-test': M('structure-stress-test', '0.9', ['artifact.structure_proposal', 'market.scenarios'], ['report.stress_test']),
  'rfq-packager': M('rfq-packager', '1.4', ['artifact.structure_approved'], ['artifact.rfq_package']),
  'quote-normalizer': M('quote-normalizer', '1.6', ['connector.pricing_api.responses'], ['artifact.quote_matrix']),
  'execution-precheck': M('execution-precheck', '1.0', ['artifact.quote_matrix', 'artifact.instruction'], ['check.freshness']),
  'termsheet-validation': M('termsheet-validation', '1.5', ['artifact.execution_ticket', 'doc.final_termsheet'], ['artifact.ts_validation']),
  'booking-readiness': M('booking-readiness', '1.1', ['artifact.execution_ticket', 'connector.booking'], ['check.booking_fields']),
  'exception-routing': M('exception-routing', '1.0', ['artifact.ts_validation'], ['ticket.issuer_exception']),
  'document-translation': M('document-translation', '2.1', ['doc.attached'], ['doc.translated']),
  'knowledge-search': M('knowledge-search', '1.8', ['kb.approved'], ['answer.cited']),
  'meeting-brief': M('meeting-brief', '1.0', ['case.state', 'calendar.events'], ['draft.brief']),
}
