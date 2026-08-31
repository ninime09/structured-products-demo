# Structured Products Trade Room — AI 工作流 Demo

结构化产品（场外）交易室的 AI 工作流演示原型，以 **FCN（Fixed Coupon Note）** 为试点产品线。

它演的是一条完整的真实链路：**14:02 客户的一封邮件 → 15:00 条款书审批完成归档**。中间跨 4 个角色、8 个阶段、18 条正式流转规则，AI 全程在旁边起草、核算、比对，但**一次都不能自己把流程往前推**。

> ⚠️ 这是一个演示原型。客户、持仓、行情、发行商报价全部是内置假数据，不连任何真实系统。

---

## 快速开始

```bash
pnpm install     # 或 npm install
pnpm dev         # http://localhost:5173
```

打开即用——默认是**脚本模式**，所有 AI 输出走预置台本，不需要任何 API key，断网也能演。

## 演示模式（展台 / 录屏）

| 入口 | 说明 |
| --- | --- |
| `?demo=1` | 自动播放主线 |
| `?demo=full` | 连返工支线一起播 |

播放中的快捷键：

| 键 | 作用 |
| --- | --- |
| `空格` | 暂停 / 继续 |
| `→` | 下一幕 |
| `←` | 重播当前幕（`Shift + ←` 回退一幕） |
| `R` | 从头开始 |
| `O` | 开关返工支线 |
| `Esc` | 停止 |

真人一点界面，演示就自动暂停——合成点击不会误伤自己（靠 `isTrusted` 区分）。

## 接真模型（可选）

```bash
cp .env.example .env   # 填入 DEEPSEEK_API_KEY 或 OPENAI_API_KEY
pnpm dev
```

然后在界面里把 AI 开关切到 **live**。三条硬规则：

1. **默认脚本模式**——配了 key 也不会自动变成真调用，必须手动打开。
2. **任何失败都静默回退脚本**——没 key / 超时 / 上游报错 / 返回空，现场不会弹错。
3. **调用必须过网关**——不过网关就没有 kill switch，所有 AI 接缝统一从 `src/ai/gateway.ts` 走。

API key 只存在于服务端（`server/gateway.ts`，dev 时是 Vite 中间件，线上是 `api/llm/*` 的 Vercel Function）。环境变量刻意不带 `VITE_` 前缀，因此不会被打进前端 bundle。

换 provider = 在 `server/gateway.ts` 的 `PROVIDERS` 里加一条配置，应用侧代码不动。

---

## 演的是什么

### 四个角色

| 角色 | 人 | 职责 |
| --- | --- | --- |
| `rm` | Alice | 客户经理 —— 对客沟通、需求界定、指令确认 |
| `ps` | David | 产品专家 —— 结构设计、适当性、审批结构 |
| `dealer` | Ken | 内部交易员 —— 询价、比价、代客下单、成交登记 |
| `ops` | Mia | Trade Support —— 簿记录入、条款书三方核对、归档 |

还有若干**受邀协作者**（合规 / 交易支援 / 运营）：能参与讨论，但不占正式审批角色。

### 八个阶段

```
需求 need → 结构 structure → 询价 rfq → 定价 pricing
→ 对客 client → 执行 execution → 条款书 termsheet → 完成 done
```

主线之外还有几条真实会发生的支线：结构打回重做、请求重新报价、条款书结算日不符走 Exception 再解决。

### 界面三栏

- **左** 案例导航与任务
- **中** 交易室（Trade Room）—— 全员可见的讨论、产物卡、正式动作按钮
- **右** 私区侧栏 —— 只有你自己看得到的 AI 应答与草稿；拖拽可以把交易室的产物拉进私区追问，也可以把私区草稿发布回交易室

---

## 设计要点

这个 demo 想说明的其实是四件事：

**1. AI 只出草稿，正式流转永远是人点的。**
`src/config/fcn-pack/workflow.ts` 是唯一的流转表，每一行对应一个需要人确认的正式动作，写清了 `from → to`、下一负责人、以及**谁有权限执行**。引擎和 UI 按钮共用这张表，不存在第二份真相。AI 起草、时效标记这类叙事性变化不入表，也就不算流转。

**2. 技能是有权限边界的插件。**
`src/config/fcn-pack/skills.ts` 里每个技能都有 manifest：版本、审批人、**能读哪些数据面**（默认拒绝，声明即上限）、**能产出什么草稿**，以及一条写死的 `canTriggerTransition: false`。工具运行时按 manifest 校验读取，越权直接拒。

**3. 「要接哪些库」是跑完流程后算出来的，不是拍脑袋列的。**
`src/config/fcn-pack/data-sources.ts` 把所有技能的 `reads` 声明汇总成数据源清单——改一处技能声明，清单跟着变。demo 用假数据，但**需要哪些系统**这个结论是真的。

**4. Agent 的过程是可见的。**
`src/ai/agent.ts` 是一个真正的工具调用循环：模型自己决定查什么、按什么顺序查，结果回喂后再想下一步。流式是**步骤级**的（叙述 / 工具调用 / 工具结果），不是 token 级——你看到的是它走过的路径，不是一个转圈的图标。

可用工具（`src/ai/tools.ts`）：`get_client_profile`、`get_holdings`、`compute_exposure`、`price_indicative`、`issuer_coverage`、`structure_template`、`check_suitability`、`list_underlyings`。票息和集中度只能由工具算，提示词里明确禁止模型自行估算。

---

## 目录结构

```
src/
  App.tsx              三栏布局与拖拽投放区
  store.ts             状态机 + 全部业务动作（单一真相源）
  types.ts             角色 / 阶段 / 产物 / 时间线的类型定义
  ai/
    gateway.ts         客户端唯一的模型调用入口（含 kill switch 与兜底）
    agent.ts           工具调用循环，步骤级流式
    tools.ts           工具实现，按 skill manifest 校验数据面读取
    *-agent.ts         需求 / 结构 / 提案 / 应答四个专用 agent
  config/
    fcn-pack/          FCN 产品线配置：流转表、schema、技能、政策、数据源
    mock-data/         假数据：客户、持仓、产品目录、行情、数据面
  components/          交易室、产物、私区、阶段工作区、审阅浮层
  demo/                演示导演：台本、播放器、聚光灯浮层
server/gateway.ts      模型网关（dev 中间件与线上 Function 共用）
api/llm/               Vercel Functions：/api/llm、/health、/trace
```

## 部署

已配好 Vercel（`vercel.json`）：框架 Vite，构建 `npm run build`，产物 `dist`，`/api/*` 之外全部 rewrite 到 `index.html`。

要在线上用真模型，在 Vercel 项目环境变量里配 `DEEPSEEK_API_KEY`（或 `OPENAI_API_KEY`）即可。注意：网关的调用轨迹存在内存里，serverless 实例会回收，所以线上的「调用次数 · 成功率」只反映当前实例。

## 脚本

```bash
pnpm dev       # 开发（含模型网关中间件）
pnpm build     # tsc -b && vite build
pnpm preview   # 预览构建产物（注意：此模式下没有 /api/llm）
pnpm lint      # oxlint
```

## 技术栈

React 19 · TypeScript · Vite 8 · lucide-react · oxlint。无状态管理库——`store.ts` 是一个手写的可订阅 store，配 `useSyncExternalStore`。
