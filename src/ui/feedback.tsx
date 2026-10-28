/** Confirmations (actions destructives) et messages courts. */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './kit';

interface ConfirmOpts {
  title: string;
  text?: ReactNode;
  confirm?: string;
  cancel?: string;
  danger?: boolean;
}

interface Ctx {
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  toast: (msg: string, tone?: 'ok' | 'error') => void;
}

const FeedbackCtx = createContext<Ctx | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone: 'ok' | 'error' }[]>([]);
  const seq = useRef(0);

  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setDialog({ ...o, resolve })), []);
  const toast = useCallback((msg: string, tone: 'ok' | 'error' = 'ok') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 5000 : 2600);
  }, []);

  const close = (v: boolean) => {
    dialog?.resolve(v);
    setDialog(null);
  };

  return (
    <FeedbackCtx.Provider value={{ confirm, toast }}>
      {children}
      {dialog &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
            <div className="anim-fade absolute inset-0 bg-[#0d1a14]/45" onClick={() => close(false)} />
            <div role="alertdialog" aria-modal="true" className="anim-sheet relative w-full max-w-sm rounded-3xl bg-surface p-5 shadow-xl">
              <h2 className="text-lg font-bold">{dialog.title}</h2>
              {dialog.text && <div className="mt-2 text-[15px] leading-snug text-muted">{dialog.text}</div>}
              <div className="mt-5 flex flex-col gap-2">
                <Button variant={dialog.danger ? 'danger' : 'primary'} className={dialog.danger ? '!bg-danger !text-white !border-danger' : ''} onClick={() => close(true)} autoFocus>
                  {dialog.confirm ?? 'Confirmer'}
                </Button>
                <Button variant="secondary" onClick={() => close(false)}>{dialog.cancel ?? 'Annuler'}</Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      {createPortal(
        <div className="safe-top pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-4" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`anim-sheet pointer-events-auto max-w-sm rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg ${t.tone === 'error' ? 'bg-danger' : 'bg-ink'}`}>
              {t.msg}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </FeedbackCtx.Provider>
  );
}

export function useFeedback() {
  const c = useContext(FeedbackCtx);
  if (!c) throw new Error('FeedbackProvider manquant');
  return c;
}
