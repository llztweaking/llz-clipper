import { create } from "zustand";

interface NetworkState {
  offline: boolean;
  setOffline: (offline: boolean) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  offline: false,
  setOffline: (offline) => set({ offline }),
}));
