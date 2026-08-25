import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useEngine } from './hooks'
import { AssistantView, TasksView } from './components/Assistant'
import { ConfirmModal, Drawer, HandoffToast } from './components/Overlays'
import { AppHeader, CaseDetailsPanel, LeftNav } from './components/Shell'
import { TradeRoom } from './components/TradeRoom'

const NAV_WIDTH_KEY = 'structured-products-nav-width'
const NAV_COLLAPSED_KEY = 'structured-products-nav-collapsed'
const NAV_DEFAULT_WIDTH = 300
const NAV_MIN_WIDTH = 240
const NAV_MAX_WIDTH = 440
const NAV_COLLAPSED_WIDTH = 68

function clampNavWidth(width: number) {
  return Math.min(NAV_MAX_WIDTH, Math.max(NAV_MIN_WIDTH, Math.round(width)))
}

export default function App() {
  const { view, activeCaseId, detailsCollapsed, role, participants } = useEngine()
  const [navWidth, setNavWidth] = useState(() => {
    if (typeof window === 'undefined') return NAV_DEFAULT_WIDTH
    const stored = Number(window.localStorage.getItem(NAV_WIDTH_KEY))
    return Number.isFinite(stored) && stored > 0 ? clampNavWidth(stored) : NAV_DEFAULT_WIDTH
  })
  const [navCollapsed, setNavCollapsed] = useState(() => (
    typeof window !== 'undefined' && window.localStorage.getItem(NAV_COLLAPSED_KEY) === 'true'
  ))
  const [resizingNav, setResizingNav] = useState(false)
  const joined = participants.some((p) => p.person.role === role)
  const showCaseDetails = view === 'room' && activeCaseId === 'SP-001' && joined
  const showDetails = showCaseDetails
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
  const toggleNavCollapsed = () => {
    setNavCollapsed((collapsed) => {
      const next = !collapsed
      window.localStorage.setItem(NAV_COLLAPSED_KEY, String(next))
      return next
    })
  }
  return (
    <div
      className={`app${showCaseDetails && detailsCollapsed ? ' details-rail' : ''}${showDetails ? '' : ' no-details'}${resizingNav ? ' resizing-nav' : ''}${navCollapsed ? ' nav-collapsed' : ''}`}
      style={{ '--nav-width': `${navCollapsed ? NAV_COLLAPSED_WIDTH : navWidth}px` } as CSSProperties}
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
      {showCaseDetails ? <CaseDetailsPanel /> : <div />}
      <Drawer />
      <ConfirmModal />
      <HandoffToast />
    </div>
  )
}
