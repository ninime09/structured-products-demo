// 策略插件（声明式规则）：挂载在内核检查点上，由合规维护。
// UI 与流程事件中的合规文案统一从这里取，不散写。

export interface PolicyRule {
  id: string
  titleZh: string
  titleEn: string
  /** 声明式规则表达式（示意） */
  rule: string
  /** 挂载检查点 */
  checkpointsZh: string[]
  /** 检查通过时的展示文案 */
  passZh: string
  passEn: string
}

export const POLICIES: Record<string, PolicyRule> = {
  suitability: {
    id: 'suitability-check',
    titleZh: '适当性检查',
    titleEn: 'Suitability Check',
    rule: 'product.risk_grade ≤ client.grade',
    checkpointsZh: ['需求确认前', '执行前'],
    passZh: '适当性预检通过（FCN·R4 ≤ C4）',
    passEn: 'Suitability pre-check passed (FCN·R4 ≤ C4)',
  },
  segregation: {
    id: 'segregation-of-duties',
    titleZh: '职责分离',
    titleEn: 'Segregation of Duties',
    rule: 'reviewer.person ≠ executor.person',
    checkpointsZh: ['条款书审批'],
    passZh: '复核人 Mia ≠ 执行人 Ken（职责分离）',
    passEn: 'Reviewer Mia ≠ executor Ken (segregation of duties)',
  },
}
