// 演示层：字幕条 + 目标高亮 + 键盘控制。
// 整层 pointer-events: none，只有控制条本身可点——演示进行中人随时能接管界面。

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from 'lucide-react'
import { director } from './director'
import './demo.css'

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

function useSpotlightRect(el: HTMLElement | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null)
  const raf = useRef<number>(0)
  useEffect(() => {
    if (!el) {
      setRect(null)
      return
    }
    // 布局一直在动（滚动、抽屉、私区开合），每帧重测最省心
    const measure = () => {
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      raf.current = requestAnimationFrame(measure)
    }
    raf.current = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(raf.current)
  }, [el])
  return rect
}

export function DemoOverlay() {
  const state = useSyncExternalStore(director.subscribe, director.getState)
  const rect = useSpotlightRect(state.spotEl)
  const live = state.phase !== 'idle'

  useEffect(() => {
    if (!live) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      switch (e.key) {
        case ' ':
          e.preventDefault()
          director.togglePause()
          break
        case 'ArrowRight':
          e.preventDefault()
          director.next()
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (e.shiftKey) director.rewindTo(state.index - 1)
          else director.replayPrev()
          break
        case 'Escape':
          director.stop()
          break
        case 'r':
        case 'R':
          director.start()
          break
        case 'o':
        case 'O':
          director.toggleOptional()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [live, state.index])

  if (!live) return null
  const paused = state.phase === 'paused'
  const pct = state.total ? ((state.index + 1) / state.total) * 100 : 0

  return (
    <div className="demo-layer">
      {rect ? (
        <div
          className="demo-spot"
          style={{ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 }}
        />
      ) : null}

      <div className={`demo-bar${paused ? ' paused' : ''}`}>
        <div className="demo-progress" style={{ width: `${pct}%` }} />
        <div className="demo-bar-inner">
          <div className="demo-meta">
            <span className="demo-count">
              {state.phase === 'rewinding' ? '回放中' : `${Math.min(state.index + 1, state.total)} / ${state.total}`}
            </span>
            <span className="demo-title">{state.title}</span>
            {state.actor ? <span className="demo-actor">{state.actor}</span> : null}
            {paused ? <span className="demo-paused-tag">已暂停</span> : null}
          </div>
          <p className="demo-caption" key={state.caption}>
            {state.caption}
          </p>
        </div>
        <div className="demo-controls">
          <button title="重播上一幕旁白（Shift+← 真回退）" onClick={() => director.replayPrev()}>
            <ChevronLeft size={16} />
          </button>
          <button title={paused ? '继续（空格）' : '暂停（空格）'} onClick={() => director.togglePause()}>
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button title="下一幕（→）" onClick={() => director.next()}>
            <ChevronRight size={16} />
          </button>
          <button title="从头重来（R）" onClick={() => director.start()}>
            <RotateCcw size={15} />
          </button>
          <button title="退出演示（Esc）" onClick={() => director.stop()}>
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
