import { cx } from './kit';
import { fmtG } from '../domain/nutrition';

/** Anneau de progression calorique (SVG, sans dépendance). */
export function Ring({ value, max, size = 168, stroke = 14, children }: { value: number; max: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = max > 0 ? value / max : 0;
  const shown = Math.min(1, Math.max(0, ratio));
  const over = ratio > 1;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-brand-soft)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={over ? 'var(--color-accent)' : 'var(--color-brand)'}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * shown} ${c}`}
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

const MACRO_COLOR = { protein: 'var(--color-protein)', carbs: 'var(--color-carbs)', fat: 'var(--color-fat)' } as const;
const MACRO_LABEL = { protein: 'Protéines', carbs: 'Glucides', fat: 'Lipides' } as const;

export function MacroBar({ kind, value, target, missing }: { kind: keyof typeof MACRO_COLOR; value: number; target: number | null; missing?: number }) {
  const ratio = target ? Math.min(1, value / target) : 0;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate text-[12px] font-semibold text-muted">{MACRO_LABEL[kind]}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-line/70">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${ratio * 100}%`, background: MACRO_COLOR[kind] }} />
      </div>
      <div className="mt-1 text-[13px] tabular-nums">
        <span className="font-bold">{fmtG(value)}</span>
        <span className="text-muted">{target ? ` / ${target} g` : ' g'}</span>
        {missing ? <span className="text-warn" title="Valeurs manquantes pour certains aliments"> *</span> : null}
      </div>
    </div>
  );
}

export function ProgressBar({ value, className, color = 'var(--color-brand)' }: { value: number; className?: string; color?: string }) {
  return (
    <div className={cx('h-2.5 overflow-hidden rounded-full bg-line/70', className)}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
    </div>
  );
}
