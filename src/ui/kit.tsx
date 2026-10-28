import { createContext, useContext, useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import type { Precision, SourceInfo } from '../domain/types';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white active:bg-brand-strong shadow-sm',
  secondary: 'bg-surface text-ink border border-line active:bg-bg',
  ghost: 'text-brand active:bg-brand-soft',
  danger: 'bg-surface text-danger border border-line active:bg-warn-soft',
  soft: 'bg-brand-soft text-brand-strong active:brightness-95',
};

export function Button({ variant = 'primary', size = 'md', block, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; block?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-[background,transform] active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none select-none',
        size === 'sm' ? 'min-h-9 px-3 text-sm' : size === 'lg' ? 'min-h-14 px-5 text-base' : 'min-h-12 px-4 text-[15px]',
        VARIANTS[variant],
        block && 'w-full',
        className,
      )}
    />
  );
}

export function IconButton({ label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest} className={cx('inline-flex h-11 w-11 items-center justify-center rounded-full text-ink active:bg-line/60 disabled:opacity-40', className)} />
  );
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} type={onClick ? 'button' : undefined} className={cx('block w-full rounded-[var(--radius-card)] bg-surface p-4 text-left shadow-[0_1px_2px_rgba(16,40,30,0.06),0_4px_16px_rgba(16,40,30,0.04)]', onClick && 'active:bg-bg transition-colors', className)}>
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between px-1">
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted">{children}</h2>
      {action}
    </div>
  );
}

/** Identifiant fourni par <Field> au premier champ de saisie qu'il contient (association label ↔ champ). */
const FieldId = createContext<string | undefined>(undefined);

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">{label}</label>
      <FieldId.Provider value={id}>{children}</FieldId.Provider>
      {error ? <p id={hintId} role="alert" className="mt-1 text-sm text-danger">{error}</p> : hint ? <p id={hintId} className="mt-1 text-[13px] leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

function useFieldId(own?: string) {
  const ctx = useContext(FieldId);
  return own ?? ctx;
}

export const inputClass = 'w-full min-h-12 rounded-xl border border-line bg-surface px-3.5 text-ink placeholder:text-muted/70 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const id = useFieldId(props.id);
  return <input type="text" {...props} id={id} className={cx(inputClass, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useFieldId(props.id);
  return <textarea {...props} id={id} className={cx(inputClass, 'min-h-24 py-3', props.className)} />;
}

/** Parse un nombre saisi au format français (virgule) ; '' → null. */
export function parseNum(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.');
  if (t === '' || t === '-' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function fmtInput(n: number | null | undefined) {
  return n == null || !Number.isFinite(n) ? '' : String(Math.round(n * 100) / 100).replace('.', ',');
}

/**
 * Champ numérique tolérant (virgule ou point). Renvoie null si vide.
 * Les valeurs négatives sont refusées par défaut.
 */
export function NumberInput({ value, onChange, allowNegative, suffix, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number | null | undefined; onChange: (n: number | null) => void; allowNegative?: boolean; suffix?: string }) {
  const id = useFieldId(rest.id);
  const [text, setText] = useState(fmtInput(value));
  useEffect(() => {
    if (parseNum(text) !== (value ?? null)) setText(fmtInput(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      <input
        inputMode="decimal"
        autoComplete="off"
        {...rest}
        id={id}
        value={text}
        onChange={(e) => {
          let t = e.target.value;
          if (!allowNegative) t = t.replace('-', '');
          if (!/^-?[\d\s]*[.,]?\d*$/.test(t)) return;
          setText(t);
          onChange(parseNum(t));
        }}
        className={cx(inputClass, suffix && 'pr-14', className)}
      />
      {suffix && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">{suffix}</span>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="radiogroup" className={cx('flex rounded-2xl bg-line/60 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('min-h-10 flex-1 rounded-xl px-2 text-sm font-semibold transition-colors', value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, children, onClick, className }: { active?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cx('inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors', active ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-surface text-ink active:bg-bg', className)}>
      {children}
    </button>
  );
}

export function OptionCard({ selected, title, desc, onClick }: { selected: boolean; title: ReactNode; desc?: ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick} className={cx('mb-2 block w-full rounded-2xl border-2 p-3.5 text-left transition-colors', selected ? 'border-brand bg-brand-soft/60' : 'border-line bg-surface active:bg-bg')}>
      <div className="font-semibold">{title}</div>
      {desc && <div className="mt-0.5 text-[13px] leading-snug text-muted">{desc}</div>}
    </button>
  );
}

export function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; desc?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="mb-3 flex w-full items-center justify-between gap-4 text-left">
      <span>
        <span className="block font-medium">{label}</span>
        {desc && <span className="block text-[13px] leading-snug text-muted">{desc}</span>}
      </span>
      <span className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-brand' : 'bg-line')}>
        <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </span>
    </button>
  );
}

const PRECISION_STYLE: Record<Precision, { label: string; cls: string }> = {
  exact: { label: 'Précis', cls: 'bg-brand-soft text-brand-strong' },
  approx: { label: 'Approximatif', cls: 'bg-[#fff6dc] text-[#8a6100]' },
  rough: { label: 'Estimation', cls: 'bg-warn-soft text-warn' },
};

export function PrecisionBadge({ precision }: { precision: Precision }) {
  const s = PRECISION_STYLE[precision];
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', s.cls)}>{s.label}</span>;
}

const SOURCE_LABEL: Record<SourceInfo['kind'], string> = {
  reference: 'Référence',
  openfoodfacts: 'Open Food Facts',
  manual: 'Saisie',
  recipe: 'Recette',
  estimate: 'Estimation',
  official: 'Officiel',
  ai: 'IA',
};

export function SourceBadge({ source }: { source: SourceInfo }) {
  return <span title={source.label} className="inline-flex items-center rounded-full bg-line/70 px-2 py-0.5 text-[11px] font-medium text-muted">{SOURCE_LABEL[source.kind]}</span>;
}

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'warn' | 'ok'; children: ReactNode; className?: string }) {
  const cls = tone === 'warn' ? 'bg-warn-soft text-[#7a3d06]' : tone === 'ok' ? 'bg-brand-soft text-brand-strong' : 'bg-[#eef2f8] text-[#2f3d55]';
  return <div className={cx('rounded-2xl px-3.5 py-3 text-[13.5px] leading-snug', cls, className)}>{children}</div>;
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] font-medium text-muted">{label}</div>
      <div className="truncate text-lg font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[12px] text-muted">{sub}</div>}
    </div>
  );
}
