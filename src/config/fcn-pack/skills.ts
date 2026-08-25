// 技能插件 manifest：插件的"身份证 + 权限申请表"。
// 展示层的名称/示例在 Overlays 的技能定义里；这里是治理元数据：
// 能读什么、能产出什么、版本、审批人、评测——注册表审批看的就是这张表。

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
  /** 金标集回归结果（升版本门禁） */
  evalNote: string
}

const M = (
  id: string,
  version: string,
  reads: string[],
  writes: string[],
  evalNote: string,
): SkillManifest => ({ id, version, approvedBy: '合规 · Ashley', reads, writes, canTriggerTransition: false, evalNote })

export const SKILL_MANIFESTS: Record<string, SkillManifest> = {
  'client-need-extraction': M('client-need-extraction', '1.3', ['email', 'crm.client_profile'], ['artifact.need_brief'], '金标集 47/47 通过'),
  'client-follow-up': M('client-follow-up', '1.1', ['case.timeline', 'artifact.client_quote'], ['draft.client_message'], '金标集 32/33 通过'),
  'case-prioritization': M('case-prioritization', '1.0', ['case.state', 'case.deadlines'], ['view.priority_list'], '规则型 · 无需回归'),
  'structure-comparator': M('structure-comparator', '2.0', ['artifact.need_brief', 'catalog.products'], ['artifact.structure_proposal'], '金标集 21/21 通过'),
  'suitability-review': M('suitability-review', '1.2', ['crm.client_profile', 'artifact.structure_proposal'], ['check.suitability'], '策略绑定 · 合规维护'),
  'structure-stress-test': M('structure-stress-test', '0.9', ['artifact.structure_proposal', 'market.scenarios'], ['report.stress_test'], '试点中'),
  'rfq-packager': M('rfq-packager', '1.4', ['artifact.structure_approved'], ['artifact.rfq_package'], '金标集 18/18 通过'),
  'quote-normalizer': M('quote-normalizer', '1.6', ['connector.pricing_api.responses'], ['artifact.quote_matrix'], '金标集 40/41 通过'),
  'execution-precheck': M('execution-precheck', '1.0', ['artifact.quote_matrix', 'artifact.instruction'], ['check.freshness'], '规则型 · 无需回归'),
  'termsheet-validation': M('termsheet-validation', '1.5', ['artifact.execution_ticket', 'doc.final_termsheet'], ['artifact.ts_validation'], '金标集 25/26 通过（错例已入集）'),
  'booking-readiness': M('booking-readiness', '1.1', ['artifact.execution_ticket', 'connector.booking'], ['check.booking_fields'], '金标集 15/15 通过'),
  'exception-routing': M('exception-routing', '1.0', ['artifact.ts_validation'], ['ticket.issuer_exception'], '规则型 · 无需回归'),
  'document-translation': M('document-translation', '2.1', ['doc.attached'], ['doc.translated'], '术语表回归通过'),
  'knowledge-search': M('knowledge-search', '1.8', ['kb.approved'], ['answer.cited'], '引用率评测通过'),
  'meeting-brief': M('meeting-brief', '1.0', ['case.state', 'calendar.events'], ['draft.brief'], '金标集 12/12 通过'),
}
