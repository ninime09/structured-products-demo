// 数据源清单：把所有技能的 reads 声明汇总成"真做这个产品要接哪些库"。
//
// 这份清单不是手写的——它从 SKILL_MANIFESTS 算出来，改一处技能声明，清单跟着变。
// demo 用的是假数据库，但"需要哪些数据库"这件事是跑完流程之后真的搞清楚了的，
// 这一页就是那个结论。
//
// 关键区分：artifact.* / case.* / draft.* 是本系统自己产出的，不是外部依赖；
// 真正要对接的是 crm / catalog / market / connector / doc / email / kb / calendar。

import { SKILL_MANIFESTS } from './skills'
import { KNOWN_PLANES } from '../mock-data/planes'

export interface DataSourceSystem {
  key: string
  name: string
  /** 真实世界里对应什么系统 */
  realWorld: string
  /** 本系统自产 = 不需要对接 */
  internal: boolean
}

export const SYSTEMS: DataSourceSystem[] = [
  { key: 'crm', name: 'CRM 客户系统', realWorld: '客户档案、分级与适当性、持仓与集中度', internal: false },
  { key: 'catalog', name: '产品目录', realWorld: '可做的产品类型、标的池、发行商覆盖', internal: false },
  { key: 'market', name: '市场数据', realWorld: '行情快照与情景库（定价与压力测试）', internal: false },
  { key: 'connector', name: '外部接口', realWorld: '询价接口回包、簿记系统', internal: false },
  { key: 'doc', name: '文档库', realWorld: '发行商条款书、附件', internal: false },
  { key: 'email', name: '邮件', realWorld: '客户往来邮件（需求的原始来源）', internal: false },
  { key: 'kb', name: '知识库', realWorld: '已审批的产品与政策文档', internal: false },
  { key: 'calendar', name: '日历', realWorld: '会议与日程', internal: false },
  { key: 'artifact', name: '产物库', realWorld: '本系统自己产出的结构化产物', internal: true },
  { key: 'case', name: '案例状态', realWorld: '本系统的状态机与时间线', internal: true },
]

export interface PlaneUsage {
  plane: string
  system: string
  /** 用到它的技能 id */
  skills: string[]
  /** demo 里已接上假数据 */
  wired: boolean
}

/** 汇总所有技能的 reads —— 清单的唯一来源 */
export function dataSourceInventory(): PlaneUsage[] {
  const byPlane = new Map<string, string[]>()
  for (const m of Object.values(SKILL_MANIFESTS)) {
    for (const plane of m.reads) {
      if (!byPlane.has(plane)) byPlane.set(plane, [])
      byPlane.get(plane)!.push(m.id)
    }
  }
  return [...byPlane.entries()]
    .map(([plane, skills]) => ({
      plane,
      system: plane.split('.')[0],
      skills,
      wired: KNOWN_PLANES.includes(plane),
    }))
    // 被越多环节依赖的排前面——那才是真做时最该先接的
    .sort((a, b) => b.skills.length - a.skills.length || a.plane.localeCompare(b.plane))
}

export interface InventorySummary {
  totalPlanes: number
  externalPlanes: number
  externalSystems: number
  wired: number
}

export function inventorySummary(items: PlaneUsage[]): InventorySummary {
  const internal = new Set(SYSTEMS.filter((s) => s.internal).map((s) => s.key))
  const external = items.filter((i) => !internal.has(i.system))
  return {
    totalPlanes: items.length,
    externalPlanes: external.length,
    externalSystems: new Set(external.map((i) => i.system)).size,
    wired: items.filter((i) => i.wired).length,
  }
}

/** 数据面的中文说明——清单上要让业务方看得懂 */
export const PLANE_LABEL: Record<string, string> = {
  'crm.client_profile': '客户档案：分级、适当性、投资目标、历史交易与拒绝记录',
  'crm.holdings': '客户持仓：各标的市值、组合总值、单一标的敞口上限',
  'catalog.products': '产品目录：产品类型、标的池、各标的的发行商覆盖',
  'market.snapshot': '行情快照：定价所需的市场数据',
  'market.scenarios': '情景库：压力测试用的市场情景',
  'connector.pricing_api.responses': '询价接口回包：发行商报价',
  'connector.booking': '簿记系统：录入与回读',
  'doc.final_termsheet': '发行商最终条款书',
  'doc.attached': '流程中附加的文档',
  email: '客户邮件：需求的原始来源',
  'kb.approved': '已审批的知识库文档',
  'calendar.events': '日历事件',
  'artifact.need_brief': '客户需求摘要（本系统产出）',
  'artifact.structure_proposal': '结构方案（本系统产出）',
  'artifact.structure_approved': '已批准结构（本系统产出）',
  'artifact.rfq_package': 'RFQ 包（本系统产出）',
  'artifact.quote_matrix': '报价矩阵（本系统产出）',
  'artifact.client_quote': '客户报价（本系统产出）',
  'artifact.instruction': '客户指令（本系统产出）',
  'artifact.execution_ticket': '下单指令（本系统产出）',
  'artifact.ts_validation': '条款书核对结果（本系统产出）',
  'case.state': '案例状态（本系统产出）',
  'case.timeline': '案例时间线（本系统产出）',
  'case.deadlines': '案例时限（本系统产出）',
}
