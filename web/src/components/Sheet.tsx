import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Modal bottom sheet. Drag the handle down or press Escape to close. */
export function Sheet({ open, onClose, title, children, labelledBy }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; labelledBy?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [dragY, setDragY] = useState(0);
  const start = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(r);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), 280);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => panel.current?.focus(), 50);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted) return null;
  const root = document.getElementById('app-frame') ?? document.body;
  return createPortal(
    <div className={`sheet-root ${visible ? 'is-open' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        ref={panel}
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div
          className="sheet-handle-zone"
          onPointerDown={(e) => { start.current = e.clientY; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { if (start.current != null) setDragY(Math.max(0, e.clientY - start.current)); }}
          onPointerUp={() => {
            if (dragY > 90) onClose();
            start.current = null;
            setDragY(0);
          }}
          onPointerCancel={() => { start.current = null; setDragY(0); }}
        >
          <span className="sheet-handle" />
        </div>
        <button type="button" data-testid="sheet-close" className="icon-btn sheet-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        {title ? <div className="sheet-title">{title}</div> : null}
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    root,
  );
}
