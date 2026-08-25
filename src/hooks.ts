import { useSyncExternalStore } from 'react'
import { store } from './store'
import type { EngineState } from './store'

export function useEngine(): EngineState {
  return useSyncExternalStore(store.subscribe, store.getState)
}

export { store }
