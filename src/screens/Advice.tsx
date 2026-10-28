/** Conseils : observations calculées sur tes données + alternatives chiffrées (maison / commerce). */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { useApp } from '../state/app';
import { addDays, today } from '../domain/dates';
import { buildInsights, optionLines, optionTotals, SWAPS, type Swap, type SwapOption } from '../domain/advice';
import { fmtG, fmtKcal } from '../domain/nutrition';
import { Card, Notice, SectionTitle, cx } from '../ui/kit';
import { IconChevronRight, IconHome, IconStore } from '../ui/icons';

export function Advice() {
  const { goals } = useApp();
  const from = addDays(today(), -6);
  const meals = useLiveQuery(() => db.meals.where('date').between(from, today(), true, true).toArray(), [from]);
  const [open, setOpen] = useState<string | null>(null);
  if (!meals) return null;
  const insights = buildInsights(meals, goals, from, today(), { averagesTo: addDays(today(), -1) });

  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <header className="safe-top pt-4">
        <h1 className="text-2xl font-extrabold">Conseils</h1>
        <p className="mt-1 text-[14px] text-muted">Des idées concrètes, jamais des obligations. Aucun aliment n’est interdit.</p>
      </header>

      <SectionTitle>Tes 7 derniers jours</SectionTitle>
      {insights.length ? (
        <div className="space-y-2">
          {insights.map((i) => (
            <Card key={i.id} onClick={i.swapId ? () => { setOpen(i.swapId!); document.getElementById(`swap-${i.swapId}`)?.scrollIntoView({ behavior: 'smooth' }); } : undefined}>
              <div className="flex gap-3">
                <span className="text-xl" aria-hidden>{i.tone === 'positive' ? '🌱' : i.tone === 'tip' ? '💡' : '📊'}</span>
                <div className="flex-1">
                  <div className="font-semibold">{i.title}</div>
                  <p className="mt-0.5 text-[14px] leading-snug text-muted">{i.text}</p>
                </div>
                {i.swapId && <IconChevronRight className="self-center text-muted" />}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card><p className="text-[14px] text-muted">Note quelques repas : les observations sont calculées uniquement à partir de ce que tu enregistres.</p></Card>
      )}

      <SectionTitle>Idées d’alternatives</SectionTitle>
      <div className="space-y-2">
        {SWAPS.map((s) => <SwapCard key={s.id} swap={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />)}
      </div>

      <Notice className="mt-6">
        Les comparaisons utilisent des valeurs moyennes indicatives pour des quantités équivalentes. Pour un produit du commerce, l’étiquette fait foi. Ces conseils sont informatifs et ne remplacent pas l’avis d’un(e) diététicien(ne) ou d’un médecin.
      </Notice>
    </div>
  );
}

function SwapCard({ swap, open, onToggle }: { swap: Swap; open: boolean; onToggle: () => void }) {
  const a = optionTotals(swap.original);
  const b = optionTotals(swap.homemade);
  const diff = a.kcal - b.kcal;
  return (
    <div id={`swap-${swap.id}`} className="scroll-mt-4">
      <Card className="!p-0">
        <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={open}>
          <div className="flex-1">
            <div className="font-semibold">{swap.title}</div>
            <div className="text-[13px] text-muted">{b.protein - a.protein >= 5 ? `+${fmtG(b.protein - a.protein)} g de protéines` : `≈ ${fmtKcal(diff)} kcal de moins`} · version maison ou du commerce</div>
          </div>
          <IconChevronRight className={cx('text-muted transition-transform', open && 'rotate-90')} />
        </button>
        {open && (
          <div className="anim-fade border-t border-line px-4 pb-4 pt-3">
            <p className="text-[14px] leading-snug">{swap.why}</p>
            <Compare label="Habituellement" option={swap.original} />
            <div className="mt-3 rounded-2xl bg-brand-soft/60 p-3">
              <div className="flex items-center gap-2 font-semibold text-brand-strong"><IconHome size={18} /> Option A — fait maison</div>
              <Compare label={swap.homemade.title} option={swap.homemade} bare />
              {swap.homemade.extra && <p className="mt-1 text-[12.5px] text-muted">+ {swap.homemade.extra.join(', ')} (non comptés, négligeables ou variables)</p>}
              {swap.homemade.steps && <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[13.5px]">{swap.homemade.steps.map((s) => <li key={s}>{s}</li>)}</ol>}
            </div>
            <div className="mt-3 rounded-2xl bg-bg p-3">
              <div className="flex items-center gap-2 font-semibold"><IconStore size={18} /> Option B — du commerce</div>
              <p className="mt-1 text-[14px]"><b>À chercher :</b> {swap.store.lookFor}</p>
              <p className="mt-1 text-[13.5px] text-muted">{swap.store.label}</p>
              <ul className="mt-1 list-disc pl-5 text-[13px] text-muted">{swap.store.tips.map((t) => <li key={t}>{t}</li>)}</ul>
              <p className="mt-1 text-[12px] text-muted">Aucune marque n’est recommandée : la composition varie selon les produits.</p>
            </div>
            <div className="mt-3">
              <div className="text-[13px] font-semibold">Les compromis</div>
              <ul className="mt-1 list-disc pl-5 text-[13.5px] text-muted">{swap.tradeoffs.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Compare({ label, option, bare }: { label: string; option: SwapOption; bare?: boolean }) {
  const t = optionTotals(option);
  const lines = optionLines(option);
  return (
    <div className={cx(!bare && 'mt-3 rounded-2xl bg-bg p-3')}>
      {!bare && <div className="font-semibold">{label}</div>}
      {bare && <div className="mt-1 text-[14px]">{label}</div>}
      <div className="mt-1 text-[12.5px] text-muted">{lines.map((l) => `${l.name} ${fmtG(l.baseAmount)} ${l.baseUnit}`).join(' + ')}</div>
      <div className="mt-1 text-[13.5px] tabular-nums"><b>~{fmtKcal(t.kcal)} kcal</b> · P {fmtG(t.protein, 1)} g · G {fmtG(t.carbs, 1)} g · L {fmtG(t.fat, 1)} g</div>
    </div>
  );
}
