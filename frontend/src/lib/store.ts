import { create } from "zustand";

interface SidebarState {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  open: () => void;
}

export const useSidebar = create<SidebarState>((set) => ({
  isOpen: true,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),
  open: () => set({ isOpen: true }),
}));
