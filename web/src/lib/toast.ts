export type ToastTone = 'info' | 'success' | 'warning' | 'error';
export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

type Listener = (toasts: Toast[]) => void;
let toasts: Toast[] = [];
let n = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(toasts);
}

export function toast(title: string, opts: { tone?: ToastTone; detail?: string; ms?: number } = {}): void {
  const t: Toast = { id: ++n, tone: opts.tone ?? 'info', title, detail: opts.detail };
  toasts = [...toasts.slice(-2), t];
  emit();
  setTimeout(() => dismissToast(t.id), opts.ms ?? 3800);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(l: Listener): () => void {
  listeners.add(l);
  l(toasts);
  return () => listeners.delete(l);
}
