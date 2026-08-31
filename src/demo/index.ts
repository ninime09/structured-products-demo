import { director } from './director'
import { DEMO_SCRIPT } from './script'

director.load(DEMO_SCRIPT)

export { director }
export { DemoOverlay } from './DemoOverlay'

export function startDemo(opts?: { includeOptional?: boolean }) {
  director.start(opts)
}
