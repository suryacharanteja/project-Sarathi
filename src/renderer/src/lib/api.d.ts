import type { SarathiApi } from '@shared/ipc-contract'

declare global {
  interface Window {
    sarathi: SarathiApi
  }
}

export {}
