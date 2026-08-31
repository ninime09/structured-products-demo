// 演示台本：从 14:02 的一封客户邮件，到 15:00 条款书审批完成。
//
// 每一幕的动作优先点界面上真实存在的按钮（ctx.click），只有"切角色 / 开抽屉 /
// 划词批注"这类没有单一按钮入口的才直接调 store。
//
// optional: true 的是返工支线，默认不演，现场按 O 打开。

import { store } from '../hooks'
import type { DemoStep } from './director'

// ── 取材：从当前状态里捞出要划选的原文 ───────────────────────────────
function livePreAnalysis(): string {
  const hit = [...store.getState().timeline]
    .reverse()
    .find((t) => t.kind === 'preAnalysis' && t.target === 'ps' && !t.superseded)
  return hit?.kind === 'preAnalysis' ? hit.text : ''
}

function pendingTradeTerms(): string {
  const m = store
    .getState()
    .privateChats.ps.find((x) => x.draft?.kind === 'tradeTerms' && !x.draft.published)
  return m?.draft?.text ?? ''
}

/** 从一段文本里挑出要划选的那一行；挑不到就退回兜底串（批注仍然成立） */
function pickLine(text: string, re: RegExp, fallback: string): string {
  const line = text
    .split('\n')
    .map((s) => s.trim())
    .find((l) => l.length > 8 && re.test(l))
  return line ? line.slice(0, 64) : fallback
}

const hasArtifact = (id: string) => (s: ReturnType<typeof store.getState>) => !!s.artifacts[id]
const statusIs = (...v: string[]) => (s: ReturnType<typeof store.getState>) => v.includes(s.truth.status)

export const DEMO_SCRIPT: DemoStep[] = [
  // ── 一、需求 ────────────────────────────────────────────────────────
  {
    title: '开场 · 一封没有标的的邮件',
    async run(ctx) {
      store.reset()
      store.setView('room')
      store.openCase('SP-001')
      store.togglePrivate(false)
      store.closeDrawer()
      await ctx.as('rm', 'Alice · RM')
      ctx.say('14:02，Mr. Chan 的邮件进来：USD 1m、约 6 个月、目标 10% 以上、中等风险、看好中国互联网科技。')
      await ctx.spot('#anchor-art-need, .need-pin')
      await ctx.hold(2600)
      ctx.say('但他没说做哪只标的，也没说做什么结构——这封邮件还不是一笔可执行的需求。')
      await ctx.hold(3200)
    },
  },
  {
    title: 'AI 提取 · 五项明确、三项推断、三项待推导',
    async run(ctx) {
      ctx.say('AI 把邮件拆成了结构化的需求要素，每一项都标了来源：客户明确说的、AI 推断的、来自 CRM 档案的、还没定的。')
      await ctx.spot('#anchor-art-need, .need-pin')
      await ctx.hold(3400)
      ctx.say('区分来源是这里的关键——推断值和客户原话不能混为一谈。推导出来的值，必须经客户确认才能进询价。')
      await ctx.hold(3600)
      store.openDrawer({
        type: 'source',
        payload: {
          title: 'Email from Mr. Chan',
          body: 'Client need email received at 14:02 — return range, horizon and sector theme only; no underlying named.',
          meta: 'Source ID: email-20250516-1402',
        },
      })
      ctx.say('每一项都能点回原文。这是后面所有审计的起点。')
      await ctx.hold(3000)
      store.closeDrawer()
      await ctx.hold(600)
    },
  },
  {
    title: '（支线）人工补录字段',
    optional: true,
    async run(ctx) {
      ctx.say('流动性偏好客户没提。RM 想起上周电话里聊过，可以直接补——人工改动会标记出来并进审计。')
      store.editNeedField('liquidity', '6 个月内不需要流动性（RM 电话确认）')
      await ctx.spot('#anchor-art-need, .need-pin')
      await ctx.hold(3000)
    },
  },
  {
    title: 'RM @ 产品专家 · @ 即入场',
    async run(ctx) {
      ctx.say('标的和结构不是 RM 一个人能定的。她在交易室 @ 了产品专家 David。')
      store.consultSpecialist()
      await ctx.until((s) => s.participants.some((p) => p.person.role === 'ps'), { label: '产品专家入场' })
      await ctx.hold(1200)
      ctx.say('没有"等对方接受"这一步——两个人本来就在同一间办公室。@ 即入场，参与事实立刻留痕。')
      await ctx.spot('.feed-pre')
      await ctx.hold(3400)
      ctx.say('David 的 agent 已经替他读过客户邮件和 CRM 档案，方向初稿就摆在这儿等他处置。')
      await ctx.hold(3200)
    },
  },
  {
    title: '切到 David · Context Brief 而不是聊天记录',
    async run(ctx) {
      await ctx.as('ps', 'David · 产品专家')
      ctx.say('David 进来看到的不是一整条聊天记录，是一张 Context Brief：他需要知道什么、依据在哪、下一步该他做什么。')
      await ctx.spot('.brief-lines')
      await ctx.hold(4200)
    },
  },
  {
    title: '划词批注 · 让 agent 改初稿',
    async run(ctx) {
      await ctx.spot('.feed-pre')
      ctx.say('初稿给了三个方向。David 不同意第三个——恒生科技指数波动率太低，达不到 10% 的目标。')
      await ctx.hold(3200)
      const quote = pickLine(livePreAnalysis(), /恒生科技|指数/, '恒生科技指数挂钩票据')
      store.annotateDraft(
        quote,
        '这条删掉，指数达不到 10% 的目标；另外单一标的的 KI 从 70% 压到 65%，集中度已经逼近上限了。',
      )
      ctx.say('他直接在初稿上圈出那一句，写一句话发给自己的 agent——不用复述上下文，agent 知道他在说哪一行。')
      await ctx.hold(2200)
      await ctx.until((s) => s.specialistDraftRevised, { label: 'agent 改稿完成' })
      await ctx.spot('.private-sidebar')
      await ctx.hold(1200)
      ctx.say('进审计的是"他改了什么"，不是"他点了同意"。否则人就只是个橡皮图章。')
      await ctx.hold(3600)
    },
  },
  {
    title: '发布到交易室 · 私区与公区的那道门',
    async run(ctx) {
      await ctx.click('[aria-label="确认并发布"]', { pick: 'last' })
      ctx.say('发布是一道显式的门：只有他确认的这一版进公共上下文和审计，他和 agent 的讨论过程留在私区。')
      await ctx.confirm({ hold: 2200 })
      await ctx.until((s) => s.specialistProposalPublished, { label: '方向建议已发布' })
      ctx.say('落到交易室的这条带双署名：agent 初稿 · 产品专家修改确认。谁写的、谁改的、谁认的，一眼看得出来。')
      await ctx.hold(3600)
    },
  },
  {
    title: '返工 · RM 打回产品专家的方案',
    async run(ctx) {
      await ctx.as('rm', 'Alice · RM')
      ctx.say('Alice 不同意。')
      await ctx.hold(1400)
      store.pushBackOnProposal()
      await ctx.hold(1800)
      ctx.say('KI 压到 65% 之后票息只剩 10% 出头，而 Mr. Chan 对收益敏感——缓冲厚薄是客户的风险偏好，不该由我们替他定。')
      await ctx.hold(4200)
      ctx.say('这条判断来自客户关系，不来自产品知识。这是 RM 不可替代的地方，也是这套流程里人必须在场的理由。')
      await ctx.hold(4000)
      await ctx.until((s) => s.privateChats.ps.some((m) => m.draft?.kind === 'specialistProposal' && !m.draft.published), {
        label: 'v3 初稿到达 David 私区',
      })
    },
  },
  {
    title: 'David 出 v3 · 把选择权交回客户',
    async run(ctx) {
      await ctx.as('ps', 'David · 产品专家')
      store.togglePrivate(true)
      ctx.say('意见经意图识别路由回作者。agent 据此出了 v3：65% 和 70% 两档都留着，让客户自己选缓冲厚薄。')
      await ctx.spot('.private-sidebar')
      await ctx.hold(3400)
      await ctx.click('[aria-label="确认并发布"]', { pick: 'last' })
      await ctx.confirm({ hold: 1600 })
      await ctx.hold(1200)
    },
  },
  {
    title: '对客脱敏 · 同一份内容，两个受众',
    async run(ctx) {
      await ctx.as('rm', 'Alice · RM')
      store.draftClientBrief()
      await ctx.until((s) => s.privateChats.rm.some((m) => m.draft?.kind === 'clientBrief'), { label: '对客说明起草完成' })
      await ctx.spot('.private-sidebar')
      ctx.say('要发给客户了。agent 起草对客版本时移除了 6 项内部信息：指示价、持仓敞口、风控参数、发行商覆盖度。')
      await ctx.hold(4000)
      ctx.say('询价还没做，任何票息数字发出去都会被客户当成准报价。这不是措辞问题，是合规问题。')
      await ctx.hold(3800)
      await ctx.click('[aria-label="确认并发布"]', { pick: 'last' })
      await ctx.confirm({ hold: 1800 })
      ctx.say('客户回复了：做腾讯单一标的、缓冲要 65%、钱 6 个月不用可以持有到期、接货没问题。')
      await ctx.until((s) => s.needSettled, { label: '需求共创完成', timeout: 25000 })
      await ctx.spot('#anchor-art-need, .need-pin')
      await ctx.hold(2000)
      ctx.say('三项"待推导"这时才有了主：标的、集中度约束、接货意愿——全部来自与客户的共创，不是 AI 猜的。案例到这一刻才有名字：Tencent FCN。')
      await ctx.hold(4600)
    },
  },
  {
    title: '确认需求 · 第一次正式流转',
    async run(ctx) {
      await ctx.click('确认客户需求')
      ctx.say('确认弹窗把这一步的后果、下一个负责人、需要人背书的那一条摆出来。')
      await ctx.confirm({ hold: 2800 })
      await ctx.until(statusIs('CLIENT_NEED_APPROVED'), { label: '需求已确认' })
      ctx.say('需求确认，负责人转给产品专家。五步骨架的第一步走完了。')
      await ctx.hold(2600)
    },
  },

  // ── 二、结构 ────────────────────────────────────────────────────────
  {
    title: '交易要素 · 锁死的部分 agent 碰不到',
    async run(ctx) {
      await ctx.as('ps', 'David · 产品专家')
      store.togglePrivate(true)
      await ctx.until((s) => s.privateChats.ps.some((m) => m.draft?.kind === 'tradeTerms' && !m.draft.published), {
        label: 'agent 细化交易要素',
        timeout: 25000,
      })
      await ctx.spot('.private-sidebar')
      ctx.say('agent 把已确认的需求细化成交易要素。客户确认过的五项——标的、KI 65%、6M、名义本金、接货——已经锁死。')
      await ctx.hold(4000)
      ctx.say('这五项不是"提示 agent 别改"，是它们根本不在模型的输出 schema 里。碰不到，就不用担心被改。')
      await ctx.hold(4000)
      const quote = pickLine(pendingTradeTerms(), /85%|变体 B/, '变体 B')
      store.annotateDraft(quote, '这个变体删掉：接股价太高了。客户能接受接货，不等于愿意接贵货。')
      ctx.say('David 又删了一个变体：客户 2025 年 9 月敲入接股后一直持有到反弹才了结，接股价越高，等待期越长。')
      await ctx.until((s) => s.tradeTermsRevised, { label: '交易要素已修改' })
      await ctx.hold(3400)
      await ctx.click('[aria-label="确认并发布"]', { pick: 'last' })
      await ctx.confirm({ hold: 1600 })
      await ctx.until(hasArtifact('art-structure'), { label: '结构方案已发布' })
      await ctx.hold(1200)
    },
  },
  {
    title: '请求询价 · 交易台不代客户收窄',
    async run(ctx) {
      await ctx.spot('.structure-stage-card')
      ctx.say('剩下两个变体一起送去询价，最后由客户选一个。交易台不替客户提前收窄选择。')
      await ctx.hold(3600)
      await ctx.click('请求询价')
      await ctx.confirm({ hold: 2200 })
      await ctx.until(hasArtifact('art-rfq'), { label: 'RFQ 包生成', timeout: 25000 })
      await ctx.hold(1400)
    },
  },
  {
    title: '（支线）交易员退回结构',
    optional: true,
    async run(ctx) {
      await ctx.as('dealer', 'Ken · Dealer')
      ctx.say('交易员复核 RFQ 后也可以直接退回——退回同样是一次正式流转，会写进审计。')
      await ctx.click('退回修改')
      await ctx.confirm({ hold: 1800 })
      await ctx.until(statusIs('STRUCTURE_MODIFICATION_REQUIRED'), { label: '已退回结构' })
      ctx.say('RFQ 包作废，结构重新开放修改，案例回到产品专家名下。')
      await ctx.hold(3600)
      // 支线必须把流程还回原处，否则后面每一幕的前置条件都不成立
      await ctx.as('ps', 'David · 产品专家')
      ctx.say('产品专家复核后重新送审，流程回到询价——退回不是死路，是一条会留痕的回路。')
      await ctx.click('请求询价')
      await ctx.confirm({ hold: 1600 })
      await ctx.until(hasArtifact('art-rfq'), { label: 'RFQ 重新生成', timeout: 25000 })
      await ctx.hold(1600)
    },
  },

  // ── 三、询价与定价 ──────────────────────────────────────────────────
  {
    title: '切到交易员 · 发向市场',
    async run(ctx) {
      await ctx.as('dealer', 'Ken · Dealer')
      ctx.say('案例交接到交易员。他同样先收到一张 Context Brief，而不是被拉进一个 200 条的群。')
      await ctx.hold(3200)
      await ctx.click('接受询价请求')
      await ctx.confirm({ hold: 2000 })
      ctx.say('询价通过标准接口发给 5 家发行商，报价陆续回来。')
      await ctx.hold(3000)
      await ctx.until((s) => Object.keys(s.artifacts).some((k) => k.startsWith('art-matrix')), {
        label: '报价矩阵生成',
        timeout: 30000,
      })
      await ctx.hold(1200)
    },
  },
  {
    title: '可比性 · 报得最高的那家被隔离了',
    async run(ctx) {
      await ctx.spot('.quote-matrix-card, .stage-card')
      ctx.say('BNP 报 10.85%，全场最高。但它把 KI 改成了 65% 以外的档——下行保护和批准结构对不上。')
      await ctx.hold(4000)
      ctx.say('所以它被隔离在"条款不可比"区，不参与比较。更高的票息如果来自更高的风险，那就不是更好的报价。')
      await ctx.hold(4200)
      await ctx.click('准备客户报价')
      await ctx.confirm({ hold: 2000 })
      await ctx.until(hasArtifact('art-cq'), { label: '客户报价卡生成', timeout: 25000 })
      ctx.say('每个变体各取自己那一档的最优可比报价，扣掉登记在案的分销价差，形成对客票息。')
      await ctx.hold(3800)
    },
  },

  // ── 四、客户 ────────────────────────────────────────────────────────
  {
    title: '发给客户 · 人看到什么才算审过什么',
    async run(ctx) {
      await ctx.as('rm', 'Alice · RM')
      await ctx.spot('.client-quote-stage-card')
      ctx.say('报价回到 RM 手上。发出去之前，要发的正文全文摆在确认弹窗里。')
      await ctx.hold(3000)
      await ctx.click('给客户')
      await ctx.hold(1600)
      ctx.say('渠道决定的不是措辞，是留痕方式。邮件本身就是证据；电话没有原始记录——这次走电话。')
      await ctx.confirm({ channel: 'phone', hold: 3400 })
      await ctx.hold(1600)
    },
  },
  {
    title: '通话录音 · 客户说的话怎么进系统',
    async run(ctx) {
      ctx.say('电话打完了。客户说了什么，只有把录音传回来才进得了系统。')
      await ctx.click('上传通话录音')
      await ctx.until(hasArtifact('art-transcript'), { label: '通话转写完成', timeout: 25000 })
      await ctx.spot('#anchor-art-transcript')
      ctx.say('转写、标出关键句、识别意图。客户在三个选项里选了不设赎回那个——收窄到 1 是客户做的，不是我们做的。')
      await ctx.hold(4600)
      await ctx.until(hasArtifact('art-inst'), { label: '客户指令卡生成', timeout: 25000 })
      await ctx.hold(1000)
    },
  },
  {
    title: '指令确认 · 92% 的置信度也不算数',
    async run(ctx) {
      await ctx.spot('.instruction-stage-card')
      ctx.say('AI 只能识别出"一条可能的客户指令"，置信度 92%。它自己不能把这变成正式指令。')
      await ctx.hold(4000)
      await ctx.click('确认为正式指令')
      ctx.say('RM 复核确认，正式客户指令才成立，对客票息就此锁死——之后上手价怎么动，都不改对客承诺。')
      await ctx.confirm({ hold: 2800 })
      await ctx.until(statusIs('CLIENT_INSTRUCTION_CONFIRMED'), { label: '客户指令已确认', timeout: 25000 })
      await ctx.hold(1600)
    },
  },

  // ── 五、执行 ────────────────────────────────────────────────────────
  {
    title: '代客下单 · 最高风险的那一步',
    async run(ctx) {
      await ctx.as('dealer', 'Ken · Dealer')
      await ctx.spot('.execution-stage-card')
      ctx.say('场外产品不走接口，交易员以指令形式代客下单。')
      await ctx.hold(2800)
      await ctx.click('确认并代客下单')
      ctx.say('三项控制项已核，外加一条必须由人亲手勾的背书——整个流程里只有两处这么要求，这是其中之一。')
      await ctx.confirm({ ack: true, hold: 3000 })
      await ctx.until(hasArtifact('art-rec'), { label: '成交回报到达', timeout: 30000 })
      await ctx.hold(1400)
    },
  },
  {
    title: '成交登记 · 这一关不能省',
    async run(ctx) {
      await ctx.spot('#anchor-art-rec')
      ctx.say('上手方成交确认邮件回来了，可比要素系统自动核平。但成交票息在内部没有可比对象——')
      await ctx.hold(3800)
      ctx.say('只有交易员本人知道自己成交在哪个价。所以这条记录必须他签字，它才有归属。')
      await ctx.hold(3800)
      await ctx.click('核对成交要素并登记')
      await ctx.confirm({ hold: 2400 })
      await ctx.until(statusIs('BOOKING_REVIEW'), { label: '成交要素已登记', timeout: 25000 })
      await ctx.hold(1400)
    },
  },

  // ── 六、簿记与条款书 ────────────────────────────────────────────────
  {
    title: '切到 Trade Support · 簿记不再手工转抄',
    async run(ctx) {
      await ctx.as('ops', 'Mia · Trade Support')
      ctx.say('簿记直接从交易员那条登记记录来，不再从他的 Excel 手工抄一遍。抄写这一步消失了，抄错的可能也就消失了。')
      await ctx.hold(4200)
      await ctx.click('核对并录入簿记')
      await ctx.confirm({ hold: 2200 })
      ctx.say('接下来等发行商的条款书，到了做三方比对：交易登记记录 / 簿记 / 条款书。')
      await ctx.until(hasArtifact('art-tv'), { label: '条款书三方核对完成', timeout: 35000 })
      await ctx.hold(1600)
    },
  },
  {
    title: '异常 · 差异在谁那一侧',
    async run(ctx) {
      await ctx.spot('.termsheet-stage-card')
      ctx.say('六项里五项一致，Settlement 对不上：登记记录 T+2、簿记 T+2、条款书 T+3。')
      await ctx.hold(4000)
      ctx.say('内部两方一致，差异指向发行商文档。所以这是文档差异，不是执行错误——请发行商出更正版，不需要客户重新确认。')
      await ctx.hold(4400)
      await ctx.click('请求更正版条款书')
      await ctx.confirm({ hold: 2400 })
      await ctx.until(statusIs('EXCEPTION'), { label: '异常已提出', timeout: 20000 })
      await ctx.hold(2000)
      ctx.say('MS 确认是条款书笔误，T+2 正确，更正版已重发。')
      await ctx.click('异常已解决')
      await ctx.confirm({ hold: 1800 })
      await ctx.until(statusIs('TERMSHEET_REVIEW'), { label: '异常已关闭', timeout: 20000 })
      await ctx.hold(1600)
    },
  },
  {
    title: '批准条款书 · 职责分离',
    async run(ctx) {
      ctx.say('最后一道：复核人 Mia ≠ 执行人 Ken。这条检查在整个流程里从不豁免，连批准流程偏离时也不豁免。')
      await ctx.hold(4000)
      await ctx.click('批准条款书')
      await ctx.confirm({ hold: 2400 })
      await ctx.until(statusIs('COMPLETED'), { label: '案例完成', timeout: 25000 })
      ctx.say('归档材料齐备：客户指令（通话录音 + 转写）· 执行单 · 发行商最终条款书 · 核对记录。交易确认书已发给客户。')
      await ctx.hold(4600)
    },
  },

  // ── 七、收尾 ────────────────────────────────────────────────────────
  {
    title: '全程审计 · 从 14:02 到 15:00',
    async run(ctx) {
      store.openDrawer({ type: 'history' })
      ctx.say('从 14:02 的邮件到 15:00 的完成，一个小时。每一次状态流转、每一处人的修改、每一条 AI 起草，都在这里。')
      await ctx.hold(5000)
      ctx.say('AI 起草了大部分内容，但没有一次流转是 AI 自己完成的——每一步都停在一个人面前，等他签字。')
      await ctx.hold(4800)
      store.openDrawer({ type: 'skills' })
      ctx.say('这一单里 agent 用到的技能，以及它们各自被授权读了哪些数据。')
      await ctx.hold(4000)
      store.openDrawer({ type: 'data' })
      ctx.say('数据面：CRM 档案、持仓、产品目录、市场快照——哪些技能读过哪一张表，也是可查的。')
      await ctx.hold(4000)
      store.closeDrawer()
      await ctx.hold(800)
    },
  },
]
