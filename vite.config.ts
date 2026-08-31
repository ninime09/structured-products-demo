import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { handleHealth, handleLlm, handleTrace } from './server/gateway.js'

/**
 * 模型网关中间件。
 * key 只存在于这个 Node 进程里，前端只认识 /api/llm——不进 bundle。
 */
function llmGateway(env: Record<string, string>): PluginOption {
  return {
    name: 'llm-gateway',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (url === '/api/llm' && req.method === 'POST') return handleLlm(req, res, env)
        if (url === '/api/llm/trace') return handleTrace(res)
        if (url === '/api/llm/health') return handleHealth(res, env)
        next()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // 只读进 Node 侧；没有 VITE_ 前缀，因此不会被注入到客户端
  const env = loadEnv(mode, process.cwd(), '')
  return { plugins: [react(), llmGateway(env)] }
})
