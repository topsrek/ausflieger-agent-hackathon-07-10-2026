import { useEffect, useState } from 'react';
import { AlertOctagon, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import { dismissToast, subscribeToasts, type Toast } from '../lib/toast';

const ICON = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: AlertOctagon };

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setToasts), []);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <button type="button" key={t.id} className={`toast toast-${t.tone}`} onClick={() => dismissToast(t.id)}>
            <Icon size={18} aria-hidden="true" />
            <span className="toast-text">
              <b>{t.title}</b>
              {t.detail ? <span>{t.detail}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
