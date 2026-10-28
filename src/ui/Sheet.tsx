import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from './icons';
import { IconButton } from './kit';

/** Panneau modal qui monte depuis le bas (plein écran sur mobile si contenu long). */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="anim-fade absolute inset-0 bg-[#0d1a14]/40" onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" className="anim-sheet relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-bg outline-none sm:rounded-[28px]">
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
          <h2 className="min-w-0 truncate pl-1 text-lg font-bold">{title}</h2>
          <IconButton label="Fermer" onClick={onClose}><IconX /></IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="safe-bottom border-t border-line bg-surface/90 px-4 py-3 backdrop-blur">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
