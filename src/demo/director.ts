// 自动演示导演。
//
// 三条规则，和 gateway 一样都是为了现场不出事：
//  1. 不新开一条流程。演示走的是界面上真实存在的那些按钮，脚本只负责"谁来点、
//     什么时候点"。演示路径和手动路径因此永远是同一条——UI 改了演示跟着改，
//     不会出现"演示能跑、手点报错"。
//  2. 不猜时间。store 内部大量 later()/runProcessing()，等的是状态不是秒数；
//     每个等待都有超时兜底，超时只警告不卡死。
//  3. 随时可以被人接管。真人点一下（isTrusted 事件）就自动暂停，空格续播。
//
// 状态不可逆：向前是执行，向后（真回退）只能 reset 后快进重放。

import { store } from '../hooks'
import type { EngineState } from '../store'

export class Aborted extends Error {
  constructor() {
    super('demo-aborted')
  }
}

export type DemoPhase = 'idle' | 'playing' | 'paused' | 'rewinding' | 'done'

export interface DemoState {
  phase: DemoPhase
  /** 当前幕序号，-1 = 未开始 */
  index: number
  total: number
  title: string
  caption: string
  /** 当前以谁的身份在操作，显示在字幕条上 */
  actor: string | null
  spotEl: HTMLElement | null
  speed: number
  /** 是否演出可选支线（默认关） */
  includeOptional: boolean
  /** 幕表（标题），给进度条用 */
  outline: { title: string; optional: boolean }[]
}

export interface ClickOptions {
  /** 命中多个时取最后一个（私区里最新的那张草稿卡在最下面） */
  pick?: 'first' | 'last'
  /** 找不到就跳过而不是警告 */
  optional?: boolean
  /** 点之前停多久，让观众看清要点哪儿 */
  aim?: number
  timeout?: number
}

export interface StepCtx {
  /** 换一句字幕（一幕之内可以说好几句） */
  say(text: string): void
  /** 高亮某个元素：CSS 选择器、按钮文案，或直接给元素 */
  spot(target: string | HTMLElement | null): Promise<void>
  /** 停顿；会被"下一幕"打断，暂停时不计时 */
  hold(ms: number): Promise<void>
  /** 等状态满足；超时返回 false，不抛错 */
  until(pred: (s: EngineState) => boolean, opts?: { timeout?: number; label?: string }): Promise<boolean>
  /** 点真按钮 */
  click(target: string, opts?: ClickOptions): Promise<boolean>
  /** 走确认弹窗：选渠道 → 勾背书 → 停一下 → 确认 */
  confirm(opts?: { channel?: 'email' | 'phone'; ack?: boolean; hold?: number }): Promise<void>
  /** 切换操作角色，字幕条上会显示 */
  as(role: 'rm' | 'ps' | 'dealer' | 'ops', label: string): Promise<void>
  /** 快进重放中——脚本可以据此跳过纯叙事的停顿 */
  fast: boolean
}

export interface DemoStep {
  title: string
  /** 默认不演的支线（返工回路等），按 O 键开启 */
  optional?: boolean
  run: (ctx: StepCtx) => Promise<void>
}

type Listener = () => void

// ── DOM 定位 ────────────────────────────────────────────────────────────
const CLICKABLE = 'button, [role="button"]'

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return r.width > 2 && r.height > 2
}

function normalize(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** 以 . # [ 开头当 CSS 选择器，否则按按钮文案找 */
function queryAll(target: string): HTMLElement[] {
  if (/^[.#[]/.test(target)) {
    return [...document.querySelectorAll<HTMLElement>(target)].filter(isVisible)
  }
  const all = [...document.querySelectorAll<HTMLElement>(CLICKABLE)].filter(isVisible)
  const enabled = all.filter((el) => !(el as HTMLButtonElement).disabled)
  const pool = enabled.length ? enabled : all
  const exact = pool.filter((el) => normalize(el) === target)
  if (exact.length) return exact
  const starts = pool.filter((el) => normalize(el).startsWith(target))
  if (starts.length) return starts
  return pool.filter((el) => normalize(el).includes(target))
}

// ── 导演 ────────────────────────────────────────────────────────────────
class Director {
  private steps: DemoStep[] = []
  private listeners = new Set<Listener>()
  private epoch = 0
  private skip = false
  /** 本幕剩下的停顿全部略过（按了「下一幕」） */
  private rush = false
  private restartAt: number | null = null

  state: DemoState = {
    phase: 'idle',
    index: -1,
    total: 0,
    title: '',
    caption: '',
    actor: null,
    spotEl: null,
    speed: 1,
    includeOptional: false,
    outline: [],
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getState = () => this.state

  private set(patch: Partial<DemoState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
  }

  load(steps: DemoStep[]) {
    this.steps = steps
    this.set({ outline: steps.map((s) => ({ title: s.title, optional: !!s.optional })) })
  }

  private active(): DemoStep[] {
    return this.state.includeOptional ? this.steps : this.steps.filter((s) => !s.optional)
  }

  // ── 控制 ──────────────────────────────────────────────────────────────
  start(opts?: { includeOptional?: boolean }) {
    if (opts?.includeOptional !== undefined) this.state.includeOptional = opts.includeOptional
    this.stop()
    void this.run(0)
  }

  stop() {
    this.epoch++
    this.set({ phase: 'idle', index: -1, title: '', caption: '', actor: null, spotEl: null })
  }

  togglePause() {
    if (this.state.phase === 'playing') this.set({ phase: 'paused' })
    else if (this.state.phase === 'paused') this.set({ phase: 'playing' })
  }

  /** 被真人接管：只暂停，不打断在途动作 */
  pause() {
    if (this.state.phase === 'playing') this.set({ phase: 'paused' })
  }

  /**
   * 往下走：把当前这一幕剩下的旁白停顿全部略过。
   *
   * 只压缩"停顿"，不跳过"动作"——该点的按钮还是会点，该等的状态还是会等。
   * 否则连按几下就会把流程跳出一个前置条件不成立的坑，后面每一幕都在超时等待。
   */
  next() {
    this.rush = true
    this.skip = true
    if (this.state.phase === 'paused') this.set({ phase: 'playing' })
  }

  /** 重播上一幕的旁白与高亮（不回滚状态） */
  replayPrev() {
    const idx = Math.max(0, this.state.index - 1)
    this.restartAt = idx
    this.rush = true
    this.skip = true
    if (this.state.phase === 'paused') this.set({ phase: 'playing' })
  }

  /** 真回退：reset 后快进重放到指定幕 */
  rewindTo(index: number) {
    this.epoch++
    void this.run(0, { fastUntil: Math.max(0, index) })
  }

  setSpeed(speed: number) {
    this.set({ speed: Math.min(4, Math.max(0.5, speed)) })
  }

  toggleOptional() {
    this.set({ includeOptional: !this.state.includeOptional })
  }

  // ── 播放循环 ──────────────────────────────────────────────────────────
  private async run(from: number, opts?: { fastUntil?: number }) {
    const ep = ++this.epoch
    const steps = this.active()
    const fastUntil = opts?.fastUntil ?? -1
    this.set({
      phase: fastUntil >= 0 ? 'rewinding' : 'playing',
      total: steps.length,
      index: from,
      caption: '',
      spotEl: null,
    })
    try {
      for (let i = from; i < steps.length; i++) {
        this.assert(ep)
        const fast = i < fastUntil
        if (!fast && this.state.phase === 'rewinding') this.set({ phase: 'playing' })
        const step = steps[i]
        this.rush = false
        this.skip = false
        // 字幕不清空——换幕时留着上一句，等新的一句说出来再替换。
        // 清空会在幕与幕之间闪一条空白，看着像卡了一下。
        this.set({ index: i, title: step.title, spotEl: null })
        await step.run(this.ctx(ep, fast))
        if (this.restartAt !== null) {
          const back = this.restartAt
          this.restartAt = null
          i = back - 1
        }
      }
      this.assert(ep)
      this.set({ phase: 'done', title: '演示结束', caption: '按 R 重来，按 Esc 退出演示。', spotEl: null })
    } catch (err) {
      if (!(err instanceof Aborted)) {
        console.error('[demo] 中断：', err)
        this.set({ phase: 'paused', caption: `演示出错并已暂停：${String(err)}` })
      }
    }
  }

  private assert(ep: number) {
    if (ep !== this.epoch) throw new Aborted()
  }

  private async gate(ep: number) {
    while (this.state.phase === 'paused') {
      await new Promise((r) => setTimeout(r, 90))
      this.assert(ep)
    }
    this.assert(ep)
  }

  private ctx(ep: number, fast: boolean): StepCtx {
    const scale = (ms: number) => (fast ? Math.min(ms, 120) : ms / this.state.speed)

    const hold = async (ms: number) => {
      if (this.rush) return
      await this.gate(ep)
      const target = scale(ms)
      const started = Date.now()
      while (Date.now() - started < target) {
        if (this.skip || this.rush) {
          this.skip = false
          return
        }
        await new Promise((r) => setTimeout(r, 40))
        this.assert(ep)
        await this.gate(ep)
      }
    }

    const until = async (
      pred: (s: EngineState) => boolean,
      o?: { timeout?: number; label?: string },
    ): Promise<boolean> => {
      const timeout = o?.timeout ?? 20000
      const started = Date.now()
      while (!pred(store.getState())) {
        if (Date.now() - started > timeout) {
          console.warn(`[demo] 等待超时：${o?.label ?? '条件未满足'}，继续下一步`)
          return false
        }
        await new Promise((r) => setTimeout(r, 60))
        this.assert(ep)
        await this.gate(ep)
      }
      this.assert(ep)
      return true
    }

    const findEl = async (target: string, o?: ClickOptions): Promise<HTMLElement | null> => {
      // 赶进度时不为了找一个高亮目标等满 8 秒——找不到就算了，动作照做
      const timeout = this.rush ? 400 : o?.timeout ?? 8000
      const started = Date.now()
      for (;;) {
        const hits = queryAll(target).filter((el) => !(el as HTMLButtonElement).disabled)
        if (hits.length) return o?.pick === 'last' ? hits[hits.length - 1] : hits[0]
        if (Date.now() - started > timeout) return null
        await new Promise((r) => setTimeout(r, 80))
        this.assert(ep)
        await this.gate(ep)
      }
    }

    const spot = async (target: string | HTMLElement | null) => {
      if (target === null) {
        this.set({ spotEl: null })
        return
      }
      // 高亮只是装饰：目标一时不在（卡片被折叠、还没渲染出来）就不画，
      // 绝不为它把整幕堵住——之前这里等 4 秒，表现出来就是"按了下一幕没反应"。
      const el = typeof target === 'string' ? await findEl(target, { timeout: 900 }) : target
      if (!el) {
        this.set({ spotEl: null })
        return
      }
      el.scrollIntoView({ behavior: fast ? 'auto' : 'smooth', block: 'center' })
      this.set({ spotEl: el })
      await hold(fast ? 0 : 420)
    }

    const click = async (target: string, o?: ClickOptions): Promise<boolean> => {
      const el = await findEl(target, o)
      if (!el) {
        if (!o?.optional) console.warn(`[demo] 没找到可点的目标：${target}`)
        return false
      }
      await spot(el)
      await hold(o?.aim ?? 520)
      this.assert(ep)
      el.click()
      return true
    }

    const confirm = async (o?: { channel?: 'email' | 'phone'; ack?: boolean; hold?: number }) => {
      const ok = await until((s) => !!s.confirm, { timeout: 6000, label: '确认弹窗未出现' })
      if (!ok) return
      const modal = document.querySelector<HTMLElement>('.confirm-lite')
      if (modal) this.set({ spotEl: modal })
      await hold(700)
      if (o?.channel) {
        const wanted = o.channel === 'phone' ? '电话' : '邮件'
        const chan = [...document.querySelectorAll<HTMLElement>('.cl-channel')]
          .find((el) => normalize(el).includes(wanted))
        if (chan) {
          chan.click()
          await hold(500)
        }
      }
      if (o?.ack) {
        const box = document.querySelector<HTMLInputElement>('.cl-ack input')
        // 已勾上的别再点——那会取消勾选，确认按钮反而变灰
        if (box && !box.checked) {
          box.click()
          await hold(450)
        }
      }
      await hold(o?.hold ?? 1500)
      const go = document.querySelector<HTMLElement>(
        '.confirm-lite .m-actions .btn-primary, .confirm-lite .m-actions .btn-danger-ghost',
      )
      if (go) go.click()
      else console.warn('[demo] 确认弹窗里没找到确认按钮')
      this.set({ spotEl: null })
      await hold(600)
    }

    const as = async (role: 'rm' | 'ps' | 'dealer' | 'ops', label: string) => {
      store.setRole(role)
      this.set({ actor: label })
      await hold(fast ? 0 : 700)
    }

    return {
      say: (text: string) => this.set({ caption: text }),
      spot,
      hold,
      until,
      click,
      confirm,
      as,
      fast,
    }
  }
}

export const director = new Director()

// 和 store 的 __sp 一样：现场出问题时能从 console 里看导演走到哪一幕、卡在哪
if (import.meta.env.DEV) {
  ;(window as unknown as { __demo: Director }).__demo = director
}

// 真人插手就停下来。合成点击（el.click()）的 isTrusted 是 false，不会误伤自己。
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (!e.isTrusted) return
      if (director.getState().phase !== 'playing') return
      const el = e.target as HTMLElement | null
      if (el?.closest('.demo-bar')) return
      director.pause()
    },
    true,
  )
}
