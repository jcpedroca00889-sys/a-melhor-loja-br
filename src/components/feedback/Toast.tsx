import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { toast, useToastStore, type ToastVariant } from "@/lib/store/toast-store";

/* ============================================================
   TOAST — notificações flutuantes com auto-dismiss
   ============================================================ */

const ICONS: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const COLORS: Record<ToastVariant, string> = {
  success: "text-success",
  error: "text-error",
  info: "text-primary",
};

function ToastCard({
  id,
  title,
  description,
  variant,
}: {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}) {
  const dismiss = useToastStore((s) => s.dismiss);
  const Icon = ICONS[variant];

  useEffect(() => {
    const t = setTimeout(() => dismiss(id), 3500);
    return () => clearTimeout(t);
  }, [id, dismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className="glass-strong pointer-events-auto flex w-[min(92vw,22rem)] items-start gap-3 rounded-2xl p-4 shadow-lift"
    >
      <Icon className={`mt-0.5 size-5 shrink-0 ${COLORS[variant]}`} />
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-bold text-text">{title}</p>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-dim">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => dismiss(id)}
        aria-label="Fechar notificação"
        className="cursor-pointer text-dim transition-colors hover:text-text"
      >
        <X className="size-4" />
      </button>
    </motion.div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-[80] flex flex-col gap-3">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastCard key={t.id} {...t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Hook para disparar toasts (mesma API do stub anterior) */
export function useToast() {
  return { toast };
}
