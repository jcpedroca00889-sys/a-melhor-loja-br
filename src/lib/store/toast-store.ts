import { create } from "zustand";

/* ============================================================
   TOAST STORE — fila de notificações globais
   ============================================================ */

export type ToastVariant = "success" | "error" | "info";

export interface ToastData {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastState {
  toasts: ToastData[];
  push: (t: Omit<ToastData, "id">) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: nextId++ }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** Helper imperativo: dispara um toast de qualquer lugar */
export function toast(data: Omit<ToastData, "id">) {
  useToastStore.getState().push(data);
}
