/**
 * Estimation guidée sans balance : choix d'un type de plat, de la taille de portion et
 * de la quantité de matière grasse. Le résultat est une HYPOTHÈSE modifiable ligne par ligne.
 */
import { useEffect, useState } from 'react';
import type { LineItem } from '../../domain/types';
import { buildTemplateItems, DISH_TEMPLATES, FAT_LABEL, PLATE_LABEL, type FatLevel, type PlateSize } from '../../domain/templates';
import { fmtKcal, sumItems } from '../../domain/nutrition';
import { newId } from '../../data/ids';
import { Sheet } from '../../ui/Sheet';
import { Button, Field, Notice, Segmented, cx } from '../../ui/kit';

export function GuidedSheet({ open, onClose, onAdd, title = 'Estimation sans balance', multiplier = 1, multiplierLabel }: {
  open: boolean;
  onClose: () => void;
  onAdd: (items: LineItem[], assumptions: string[]) => void;
  title?: string;
  /** Pour un plat familial : nombre d'assiettes préparées. */
  multiplier?: number;
  multiplierLabel?: string;
}) {
  const [tpl, setTpl] = useState<string | null>(null);
  const [size, setSize] = useState<PlateSize>('medium');
  const [fat, setFat] = useState<FatLevel>('medium');
  useEffect(() => { if (open) { setTpl(null); setSize('medium'); setFat('medium'); } }, [open]);

  const t = DISH_TEMPLATES.find((x) => x.id === tpl);
  const built = t ? buildTemplateItems(t, size, fat, () => newId('li')) : null;
  const scaled = built && multiplier !== 1
    ? built.items.map((i) => ({
        ...i,
        quantity: i.quantity != null ? Math.round(i.quantity * multiplier) : null,
        baseAmount: i.baseAmount != null ? Math.round(i.baseAmount * multiplier) : null,
        nutrients: { kcal: mul(i.nutrients.kcal), protein: mul(i.nutrients.protein), carbs: mul(i.nutrients.carbs), fat: mul(i.nutrients.fat) },
        kcalRange: i.kcalRange ? { min: i.kcalRange.min * multiplier, max: i.kcalRange.max * multiplier } : null,
      }))
    : built?.items;
  function mul(v: number | null) { return v == null ? null : v * multiplier; }
  const totals = scaled ? sumItems(scaled) : null;

  return (
    <Sheet open={open} onClose={onClose} title={title} footer={t && totals ? (
      <Button block onClick={() => { onAdd(scaled!, multiplierLabel ? [...built!.assumptions, multiplierLabel] : built!.assumptions); onClose(); }}>
        Utiliser cette estimation · ~{fmtKcal(totals.kcal)} kcal
      </Button>
    ) : undefined}>
      <p className="mb-3 text-[13.5px] text-muted">Choisis ce qui ressemble le plus à ton assiette. Tu pourras ensuite corriger chaque ingrédient.</p>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {DISH_TEMPLATES.map((d) => (
          <button key={d.id} type="button" onClick={() => setTpl(d.id)} className={cx('rounded-2xl border-2 p-3 text-left transition-colors', tpl === d.id ? 'border-brand bg-brand-soft/60' : 'border-transparent bg-surface active:bg-bg')}>
            <div className="text-xl" aria-hidden>{d.emoji}</div>
            <div className="text-[14px] font-semibold leading-tight">{d.label}</div>
            <div className="mt-0.5 text-[11.5px] leading-tight text-muted">{d.hint}</div>
          </button>
        ))}
      </div>
      {t && built && totals && (
        <div className="anim-fade">
          <Field label="Taille de la portion">
            <Segmented<PlateSize> value={size} onChange={setSize} options={(['small', 'medium', 'large'] as PlateSize[]).map((v) => ({ value: v, label: PLATE_LABEL[v] }))} />
          </Field>
          <Field label={t.fat.label}>
            <Segmented<FatLevel> value={fat} onChange={setFat} options={(['low', 'medium', 'high'] as FatLevel[]).map((v) => ({ value: v, label: FAT_LABEL[v] }))} />
          </Field>
          <div className="rounded-2xl bg-surface p-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold text-muted">Estimation</span>
              <span className="text-xl font-extrabold tabular-nums">~{fmtKcal(totals.kcal)} kcal</span>
            </div>
            <div className="text-right text-[12.5px] text-muted">fourchette plausible : {fmtKcal(totals.kcalRange.min)} – {fmtKcal(totals.kcalRange.max)} kcal</div>
            <ul className="mt-2 space-y-1 text-[13px]">
              {scaled!.map((i) => (
                <li key={i.id} className="flex justify-between gap-2"><span className="truncate">{i.name} · {Math.round(i.baseAmount ?? 0)} {i.baseUnit}</span><span className="tabular-nums text-muted">{fmtKcal(i.nutrients.kcal)}</span></li>
              ))}
            </ul>
          </div>
          <Notice className="mt-3">
            Hypothèse de composition, pas une mesure. Les éléments les plus incertains : quantité d’huile ou de sauce, poids réel des féculents, ingrédients invisibles.
          </Notice>
        </div>
      )}
    </Sheet>
  );
}
