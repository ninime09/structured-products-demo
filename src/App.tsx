import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { store, useEngine } from './hooks'
import { AssistantView, TasksView } from './components/Assistant'
import { ConfirmModal, Drawer, HandoffToast } from './components/Overlays'
import { AppHeader, LeftNav } from './components/Shell'
import { PrivateSidebar } from './components/PrivateSidebar'
import { TradeRoom } from './components/TradeRoom'
import { DemoOverlay, startDemo } from './demo'

const NAV_WIDTH_KEY = 'structured-products-nav-width'
const NAV_COLLAPSED_KEY = 'structured-products-nav-collapsed'
const NAV_DEFAULT_WIDTH = 300
const NAV_MIN_WIDTH = 240
const NAV_MAX_WIDTH = 440
const NAV_COLLAPSED_WIDTH = 68

const DETAILS_WIDTH_KEY = 'structured-products-details-width'
const DETAILS_DEFAULT_WIDTH = 340
const DETAILS_MIN_WIDTH = 300
const DETAILS_MAX_WIDTH = 720
/** 中间栏的最小宽度，和 .app 的 grid-template-columns 里那个 minmax 下限一致 */
const MAIN_MIN_WIDTH = 520

function clampNavWidth(width: number) {
  return Math.min(NAV_MAX_WIDTH, Math.max(NAV_MIN_WIDTH, Math.round(width)))
}

function clampDetailsWidth(width: number, max = DETAILS_MAX_WIDTH) {
  return Math.min(max, Math.max(DETAILS_MIN_WIDTH, Math.round(width)))
}

function storedWidth(key: string, fallback: number) {
  if (typeof window === 'undefined') return fallback
  const stored = Number(window.localStorage.getItem(key))
  return Number.isFinite(stored) && stored > 0 ? stored : fallback
}

// 反向门投放区：实测右栏（案例详情或私区侧栏）的几何位置，保证贴合。
function RightDropZone({ artifactId }: { artifactId: string }) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  useEffect(() => {
    const el = document.querySelector('.private-sidebar, aside.details')
    if (el) {
      const r = el.getBoundingClientRect()
      setRect({ top: r.top + 6, left: r.left + 6, width: r.width - 12, height: r.height - 12 })
    }
  }, [])
  return (
    <div
      className="drop-zone right-drop"
      style={rect ?? undefined}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
      onDrop={(e) => { e.preventDefault(); store.dropArtifactToPrivate(artifactId) }}
    >
      <span>松手拉入私区</span>
    </div>
  )
}

export default function App() {
  const { view, activeCaseId, role, participants, privateOpen, dragging } = useEngine()
  const [navWidth, setNavWidth] = useState(() => clampNavWidth(storedWidth(NAV_WIDTH_KEY, NAV_DEFAULT_WIDTH)))
  const [detailsWidth, setDetailsWidth] = useState(() => clampDetailsWidth(storedWidth(DETAILS_WIDTH_KEY, DETAILS_DEFAULT_WIDTH)))
  const [navCollapsed, setNavCollapsed] = useState(() => (
    typeof window !== 'undefined' && window.localStorage.getItem(NAV_COLLAPSED_KEY) === 'true'
  ))
  const [resizingNav, setResizingNav] = useState(false)
  const [resizingDetails, setResizingDetails] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth))
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // ?demo=1 直接开演（展台 / 录屏用）；?demo=full 连返工支线一起演
  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get('demo')
    if (!flag) return
    const t = setTimeout(() => startDemo({ includeOptional: flag === 'full' }), 600)
    return () => clearTimeout(t)
  }, [])
  // 左栏收起腾出来的宽度直接给私区——收起左栏就是为了给右边让位置，
  // 让中间那栏独吞没有道理。存的是不含这部分的基准宽，所以反复开合不会漂。
  const detailsBonus = navCollapsed ? Math.max(0, navWidth - NAV_COLLAPSED_WIDTH) : 0
  // 上限还得看窗口给不给得起：中间栏有 minmax 下限，加起来超过视口时 grid 只会
  // 把私区顶出屏幕右侧，而把手是按 --details-width 定位的，就会和面板边界脱开
  // ——看起来就是"拉到最大之后拖不动了"。所以按实际可用宽度封顶。
  const detailsMax = clampDetailsWidth(
    viewportWidth - (navCollapsed ? NAV_COLLAPSED_WIDTH : navWidth) - MAIN_MIN_WIDTH,
  )
  const effectiveDetailsWidth = clampDetailsWidth(detailsWidth + detailsBonus, detailsMax)
  const joined = participants.some((p) => p.person.role === role)
  const showCaseDetails = view === 'room' && activeCaseId === 'SP-001' && joined
  // 案例详情改为按需抽屉；常驻右栏只留给私有工作区
  const showDetails = showCaseDetails && privateOpen
  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = navWidth
    let finalWidth = startWidth
    setResizingNav(true)
    const onMove = (moveEvent: PointerEvent) => {
      const next = clampNavWidth(startWidth + moveEvent.clientX - startX)
      finalWidth = next
      setNavWidth(next)
    }
    const onUp = () => {
      setResizingNav(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.localStorage.setItem(NAV_WIDTH_KEY, String(finalWidth))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }
  const resetNavWidth = () => {
    setNavWidth(NAV_DEFAULT_WIDTH)
    window.localStorage.setItem(NAV_WIDTH_KEY, String(NAV_DEFAULT_WIDTH))
  }
  // 私区往左拖变宽，所以位移取反
  const startDetailsResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = effectiveDetailsWidth
    let finalWidth = detailsWidth
    setResizingDetails(true)
    const onMove = (moveEvent: PointerEvent) => {
      finalWidth = clampDetailsWidth(startWidth - (moveEvent.clientX - startX) - detailsBonus, detailsMax)
      setDetailsWidth(finalWidth)
    }
    const onUp = () => {
      setResizingDetails(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.localStorage.setItem(DETAILS_WIDTH_KEY, String(finalWidth))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }
  const resetDetailsWidth = () => {
    setDetailsWidth(DETAILS_DEFAULT_WIDTH)
    window.localStorage.setItem(DETAILS_WIDTH_KEY, String(DETAILS_DEFAULT_WIDTH))
  }
  const toggleNavCollapsed = () => {
    setNavCollapsed((collapsed) => {
      const next = !collapsed
      window.localStorage.setItem(NAV_COLLAPSED_KEY, String(next))
      return next
    })
  }
  return (
    <div
      className={`app${showDetails ? '' : ' no-details'}${resizingNav ? ' resizing-nav' : ''}${resizingDetails ? ' resizing-details' : ''}${navCollapsed ? ' nav-collapsed' : ''}`}
      style={{
        '--nav-width': `${navCollapsed ? NAV_COLLAPSED_WIDTH : navWidth}px`,
        '--details-width': `${effectiveDetailsWidth}px`,
      } as CSSProperties}
    >
      <AppHeader />
      <LeftNav collapsed={navCollapsed} onToggleCollapse={toggleNavCollapsed} />
      {!navCollapsed && (
        <button
          className="nav-resizer"
          aria-label="调整左侧栏宽度"
          title="拖拽调整左侧栏宽度，双击恢复默认"
          onPointerDown={startResize}
          onDoubleClick={resetNavWidth}
        />
      )}
      {view === 'room' ? <TradeRoom /> : view === 'assistant' ? <AssistantView /> : <TasksView />}
      {showDetails ? (
        <button
          className="details-resizer"
          aria-label="调整私有工作区宽度"
          title="拖拽调整私有工作区宽度，双击恢复默认"
          onPointerDown={startDetailsResize}
          onDoubleClick={resetDetailsWidth}
        />
      ) : null}
      {showDetails ? <PrivateSidebar /> : <div />}
      {dragging?.kind === 'artifact' ? <RightDropZone artifactId={dragging.id} /> : null}
      <Drawer />
      <ConfirmModal />
      <HandoffToast />
      <DemoOverlay />
    </div>
  )
}
