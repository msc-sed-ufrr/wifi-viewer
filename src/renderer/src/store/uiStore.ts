import { create } from 'zustand'
import { ALL_NETWORKS_KEY } from '../modules/readings/network'

interface UiState {
  selectedPointId: string | null
  selectedNetworkKey: string | null
  selectPoint: (id: string | null) => void
  selectNetwork: (key: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  selectedPointId: null,
  selectedNetworkKey: ALL_NETWORKS_KEY,
  selectPoint: (id) => set({ selectedPointId: id }),
  selectNetwork: (key) => set({ selectedNetworkKey: key })
}))
