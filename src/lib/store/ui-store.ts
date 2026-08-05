import { create } from "zustand";

/* ============================================================
   UI STORE — estado global de UI (busca, nav mobile)
   ============================================================ */

interface UIState {
  searchOpen: boolean;
  navOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  setNavOpen: (v: boolean) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  searchOpen: false,
  navOpen: false,
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),
  setNavOpen: (v) => set({ navOpen: v }),
}));

/** Selector memoizado: busca aberta/fechada */
export function useSearchOpen(): boolean {
  return useUIStore((s) => s.searchOpen);
}

/** Selector memoizado: nav mobile aberta/fechada */
export function useNavOpen(): boolean {
  return useUIStore((s) => s.navOpen);
}
