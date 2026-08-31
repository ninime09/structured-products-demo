// 数据面访问器：技能只能读它在 manifest 里声明过的数据面。
//
// 这四十行是 manifest 从「说明」变成「约束」的地方。skills.ts 里那行
// reads: ['crm.client_profile', 'crm.holdings'] 以前只是展示用的元数据；
// 接上这一层之后，删掉其中一项，技能就真的拿不到那份数据了。
//
// 接真模型时，这里就是上下文装配的边界：模型能看到什么由 manifest 决定，
// 不由 prompt 决定。

import { SKILL_MANIFESTS } from '../fcn-pack/skills'
import { CLIENTS, getClient, ACTIVE_CLIENT_ID } from './clients'
import { PRODUCTS, UNDERLYINGS, THEMES } from './catalog'
import { MARKET_SNAPSHOT } from './market'

/** 已实现的数据面。manifest 里声明了但这里没有的，属于尚未接入。 */
const PLANES: Record<string, (clientId?: string) => unknown> = {
  'crm.client_profile': (clientId) => {
    const { holdings, ...profile } = getClient(clientId)
    return profile
  },
  'crm.holdings': (clientId) => getClient(clientId).holdings,
  'catalog.products': () => ({ products: PRODUCTS, underlyings: UNDERLYINGS, themes: THEMES }),
  'market.snapshot': () => MARKET_SNAPSHOT,
}

export class DataPlaneDenied extends Error {
  skillId: string
  plane: string
  constructor(skillId: string, plane: string) {
    super(`技能 ${skillId} 未声明读取 ${plane}`)
    this.skillId = skillId
    this.plane = plane
  }
}

/**
 * 按 manifest 授权读取数据面。
 * 未声明 → 抛 DataPlaneDenied；已声明但尚未接入 → 返回 null。
 */
export function readDataPlane(skillId: string, plane: string, clientId: string = ACTIVE_CLIENT_ID): unknown {
  const manifest = SKILL_MANIFESTS[skillId]
  if (!manifest || !manifest.reads.includes(plane)) throw new DataPlaneDenied(skillId, plane)
  const source = PLANES[plane]
  return source ? source(clientId) : null
}

/** 该技能实际能拿到的数据面（声明 ∩ 已接入）——技能抽屉用它展示，而不是只列声明 */
export function availablePlanes(skillId: string): { plane: string; wired: boolean }[] {
  const manifest = SKILL_MANIFESTS[skillId]
  if (!manifest) return []
  return manifest.reads.map((plane) => ({ plane, wired: plane in PLANES }))
}

export const KNOWN_PLANES = Object.keys(PLANES)
export const CLIENT_COUNT = Object.keys(CLIENTS).length
