import { store } from '../hooks'
import type { PendingConfirm } from '../types'

export function confirmThen(confirm: PendingConfirm) {
  store.requestConfirm(confirm)
}
