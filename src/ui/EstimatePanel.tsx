/** Affiche l'estimation moyenne et l'estimation haute, et laisse choisir la valeur retenue. */
import { useEffect, useState } from 'react';
import type { EstimateChoice, EstimateInfo } from '../domain/types';
import { fmtG, fmtKcal } from '../domain/nutrition';
import { hasMeaningfulGap, rangeOf } from '../domain/estimates';
import { NumberInput, cx } from './kit';

export function EstimatePanel({ estimate, onChoose, compact }: { estimate: EstimateInfo; onChoose?: (c: EstimateChoice, customKcal?: number | null) => void; compact?: boolean }) {
  const [custom, setCustom] = useState<number | null>(estimate.custom?.kcal ?? null);
  useEffect(() => setCustom(estimate.custom?.kcal ?? null), [estimate.custom?.kcal]);
  const gap = hasMeaningfulGap(estimate);
  const range = rangeOf({ ...estimate, chosen: 'mean' });
  const showRange = range && estimate.low && range.min < (estimate.mean.kcal ?? 0) - 10;

  const Option = ({ value, label, kcal, sub }: { value: EstimateChoice; label: string; kcal: number | null | undefined; sub?: string }) => {
    const on = estimate.chosen === value;
    return (
      <button type="button" role="radio" aria-checked={on} disabled={!onChoose} onClick={() => onChoose?.(value)}
        className={cx('flex-1 rounded-2xl border-2 px-3 py-2.5 text-left transition-colors', on ? 'border-brand bg-brand-soft/70' : 'border-line bg-surface', onChoose && 'active:bg-bg')}>
        <div className={cx('text-[11.5px] font-bold uppercase tracking-wide', value === 'high' ? 'text-accent' : 'text-muted')}>{label}</div>
        <div className="text-xl font-extrabold tabular-nums">{fmtKcal(kcal)} <span className="text-[13px] font-semibold text-muted">kcal</span></div>
        {sub && <div className="text-[11.5px] text-muted">{sub}</div>}
      </button>
    );
  };

  if (!gap) {
    return (
      <div className="rounded-2xl bg-brand-soft px-4 py-3 text-brand-strong">
        <div className="text-2xl font-extrabold tabular-nums">~{fmtKcal(estimate.mean.kcal)} kcal</div>
        <div className="text-[12.5px]">Estimation peu incertaine : pas d’écart notable entre scénario moyen et haut.</div>
      </div>
    );
  }

  return (
    <div>
      <div role="radiogroup" aria-label="Valeur retenue" className="flex gap-2">
        <Option value="mean" label="Estimation moyenne" kcal={estimate.mean.kcal} sub="scénario le plus plausible" />
        <Option value="high" label="Estimation haute" kcal={estimate.high.kcal} sub="scénario de prudence" />
      </div>
      {showRange && <p className="mt-1.5 text-[12.5px] text-muted">Fourchette plausible : {fmtKcal(range!.min)} – {fmtKcal(range!.max)} kcal{estimate.method !== 'catalog' ? ' (elle-même approximative)' : ''}.</p>}
      {estimate.highlightHigh && (
        <p className="mt-2 rounded-xl bg-warn-soft px-3 py-2 text-[12.5px] leading-snug text-[#7a3d06]">⚠️ {estimate.highlightHigh}</p>
      )}
      {!compact && (
        <details className="mt-2 text-[12.5px] text-muted">
          <summary className="cursor-pointer font-semibold text-ink">Pourquoi ces deux valeurs ?</summary>
          <div className="mt-1.5 space-y-1.5">
            <div><b className="text-ink">Moyenne :</b><ul className="list-disc pl-5">{estimate.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></div>
            <div><b className="text-ink">Haute :</b><ul className="list-disc pl-5">{estimate.highReasons.map((a) => <li key={a}>{a}</li>)}</ul></div>
            <p>Ce sont des scénarios construits à partir de ces hypothèses, pas des mesures ni des probabilités.</p>
          </div>
        </details>
      )}
      {onChoose && !compact && (
        <div className="mt-3">
          <button type="button" className={cx('text-[13px] font-semibold', estimate.chosen === 'custom' ? 'text-brand-strong' : 'text-brand')} onClick={() => onChoose('custom', custom ?? estimate.mean.kcal)}>
            {estimate.chosen === 'custom' ? '✓ Valeur personnalisée retenue' : 'Je connais une autre valeur'}
          </button>
          {estimate.chosen === 'custom' && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1"><NumberInput aria-label="Calories personnalisées" value={custom} onChange={(v) => { setCustom(v); if (v != null && v >= 0) onChoose('custom', v); }} suffix="kcal" inputMode="numeric" /></div>
            </div>
          )}
          {estimate.chosen === 'custom' && <p className="mt-1 text-[12px] text-muted">Les macros sont ajustées proportionnellement à l’estimation moyenne. Les deux estimations restent enregistrées.</p>}
        </div>
      )}
      {!compact && estimate.mean.protein != null && (
        <p className="mt-2 text-[12.5px] tabular-nums text-muted">
          Moyenne : P {fmtG(estimate.mean.protein)} g · G {fmtG(estimate.mean.carbs)} g · L {fmtG(estimate.mean.fat)} g — Haute : P {fmtG(estimate.high.protein)} · G {fmtG(estimate.high.carbs)} · L {fmtG(estimate.high.fat)} g
        </p>
      )}
    </div>
  );
}

/** Mention compacte pour les listes : « moy. 450 · haute 620 ». */
export function EstimateBadge({ estimate }: { estimate: EstimateInfo }) {
  if (!hasMeaningfulGap(estimate)) return null;
  const label = estimate.chosen === 'high' ? 'haute retenue' : estimate.chosen === 'custom' ? 'valeur perso' : `haute ${fmtKcal(estimate.high.kcal)}`;
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', estimate.chosen === 'high' ? 'bg-[#ffe9d6] text-[#a14b00]' : 'bg-line/70 text-muted')}>{label}</span>;
}
