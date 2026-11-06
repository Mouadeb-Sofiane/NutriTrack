/** Progression : poids et historique alimentaire. */
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../data/db';
import { repo, useApp } from '../state/app';
import { href, navigate, type Route } from '../state/router';
import { addDays, formatDayLabel, formatShortDate, isISODate, today } from '../domain/dates';
import { frequentFoods, movingAverage, periodSummary, sortWeights, weeklyAverages, weightProgress } from '../domain/stats';
import { fmtG, fmtKcal } from '../domain/nutrition';
import { Button, Card, Chip, cx, EmptyState, Field, IconButton, Notice, NumberInput, SectionTitle, Segmented, Stat, TextInput } from '../ui/kit';
import { ProgressBar } from '../ui/charts';
import { IconChart, IconChevronLeft, IconChevronRight, IconScale, IconTrash } from '../ui/icons';
import { buildMonthView, deviationText, monthOf, shiftMonth, TONE_LABEL, type DayTone } from '../domain/month';
import { GOAL_LABEL } from './labels';
import { useFeedback } from '../ui/feedback';

type Tab = 'weight' | 'month' | 'history';

export function Progress({ route }: { route: Route }) {
  const tab = (route.query.get('tab') as Tab) || 'weight';
  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <header className="safe-top pt-4">
        <h1 className="mb-3 text-2xl font-extrabold">Progression</h1>
        <Segmented<Tab> value={tab} onChange={(t) => navigate('progress', { tab: t }, { replace: true })} options={[{ value: 'weight', label: 'Poids' }, { value: 'month', label: 'Mois' }, { value: 'history', label: 'Historique' }]} />
      </header>
      {tab === 'weight' ? <Weight /> : tab === 'month' ? <MonthTab route={route} /> : <History />}
    </div>
  );
}

const kg = (n: number | null | undefined, digits = 1) => (n == null ? '—' : `${n.toLocaleString('fr-FR', { maximumFractionDigits: digits })} kg`);

function Weight() {
  const { profile } = useApp();
  const weights = useLiveQuery(() => db.weights.toArray(), []);
  const [date, setDate] = useState(today());
  const [value, setValue] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const { toast, confirm } = useFeedback();
  if (!weights) return null;
  const sorted = sortWeights(weights);
  const target = profile?.targetWeightKg ?? null;
  const prog = weightProgress(sorted, target);
  const series = movingAverage(sorted).map((p) => ({ ...p, label: formatShortDate(p.date) }));

  const add = async () => {
    try {
      await repo.addWeight(date, value ?? 0, note);
      setValue(null); setNote('');
      toast('Pesée enregistrée');
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  return (
    <div className="mt-4">
      <Card>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <NumberInput value={value} onChange={setValue} suffix="kg" placeholder="Poids du jour" />
          <input type="date" value={date} max={today()} onChange={(e) => isISODate(e.target.value) && setDate(e.target.value)} className="h-12 rounded-xl border border-line bg-surface px-2 text-sm" aria-label="Date de la pesée" />
        </div>
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Commentaire (facultatif)" className="mt-2" />
        <Button block className="mt-3" disabled={!value} onClick={add}>Enregistrer la pesée</Button>
      </Card>

      {sorted.length === 0 ? (
        <EmptyState icon={<IconScale />} title="Aucune pesée" text="Pèse-toi idéalement dans les mêmes conditions (le matin, à jeun) une à quelques fois par semaine." />
      ) : (
        <>
          <Card className="mt-3">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Départ" value={kg(prog.start?.kg)} sub={prog.start && formatShortDate(prog.start.date)} />
              <Stat label="Actuel" value={kg(prog.latest?.kg)} sub={prog.latest && formatShortDate(prog.latest.date)} />
              <Stat label="Cible" value={kg(target)} />
            </div>
            <div className="mt-3 flex items-baseline justify-between text-[14px]">
              <span className="text-muted">Évolution depuis le départ</span>
              <span className="font-bold tabular-nums">{prog.change != null ? `${prog.change > 0 ? '+' : ''}${kg(prog.change)}` : '—'}</span>
            </div>
            {prog.progress != null && (<><ProgressBar value={prog.progress} className="mt-2" /><div className="mt-1 text-right text-[12.5px] text-muted">{Math.round(prog.progress * 100)} % du chemin vers la cible</div></>)}
            {prog.weeklyTrend != null && <p className="mt-2 text-[13px] text-muted">Tendance sur les 4 dernières semaines : <b>{prog.weeklyTrend > 0 ? '+' : ''}{kg(prog.weeklyTrend, 2)}/semaine</b>.</p>}
          </Card>
          {series.length >= 2 && (
            <Card className="mt-3 !px-2">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="var(--color-line)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 11, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v.toFixed(0)} />
                    <Tooltip formatter={(v, name) => [`${Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg`, name === 'avg' ? 'Moyenne 7 j' : 'Pesée']} />
                    {target && <ReferenceLine y={target} stroke="var(--color-accent)" strokeDasharray="4 4" />}
                    <Line type="monotone" dataKey="kg" stroke="var(--color-muted)" strokeWidth={0} dot={{ r: 3, fill: 'var(--color-muted)' }} isAnimationActive={false} />
                    <Line type="monotone" dataKey="avg" stroke="var(--color-brand)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="px-2 text-[12px] text-muted"><span className="text-brand">━</span> moyenne mobile 7 jours · ● pesées{target ? ' · ┅ cible' : ''}</p>
            </Card>
          )}
          <Notice className="mt-3">
            Le poids varie naturellement d’un jour à l’autre (eau, glycogène, contenu digestif, sel…). Une pesée isolée n’indique pas une variation de masse grasse : regarde plutôt la moyenne sur plusieurs semaines. Tes objectifs ne sont jamais modifiés automatiquement.
          </Notice>
          <SectionTitle>Historique des pesées</SectionTitle>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
            {[...sorted].reverse().map((w) => (
              <li key={w.id} className="flex items-center gap-2 pl-4">
                <div className="min-w-0 flex-1 py-2.5">
                  <div className="font-semibold tabular-nums">{kg(w.kg, 2)}</div>
                  <div className="truncate text-[12.5px] text-muted">{formatDayLabel(w.date)}{w.note ? ` · ${w.note}` : ''}</div>
                </div>
                <IconButton label="Supprimer la pesée" className="text-muted" onClick={async () => (await confirm({ title: 'Supprimer cette pesée ?', confirm: 'Supprimer', danger: true })) && repo.deleteWeight(w.id)}><IconTrash size={19} /></IconButton>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

type Period = '7' | '30' | '90' | 'custom';

function History() {
  const { goals } = useApp();
  const [period, setPeriod] = useState<Period>('7');
  const [from, setFrom] = useState(addDays(today(), -13));
  const [to, setTo] = useState(today());
  const range = period === 'custom' ? { from: from <= to ? from : to, to: from <= to ? to : from } : { from: addDays(today(), -(Number(period) - 1)), to: today() };
  const meals = useLiveQuery(() => db.meals.where('date').between(range.from, range.to, true, true).toArray(), [range.from, range.to]);
  const summary = useMemo(() => (meals ? periodSummary(meals, range.from, range.to) : null), [meals, range.from, range.to]);
  if (!meals || !summary) return null;
  const chart = summary.days.map((d) => ({ label: formatShortDate(d.date), date: d.date, kcal: d.totals ? Math.round(d.totals.kcal) : null }));
  const weekly = weeklyAverages(meals, range.from, range.to);
  const frequent = frequentFoods(meals, 8);

  return (
    <div className="mt-4">
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 no-scrollbar">
        {(['7', '30', '90'] as Period[]).map((p) => <Chip key={p} active={period === p} onClick={() => setPeriod(p)}>{p} jours</Chip>)}
        <Chip active={period === 'custom'} onClick={() => setPeriod('custom')}>Personnalisée</Chip>
      </div>
      {period === 'custom' && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Field label="Du"><input type="date" value={from} max={today()} onChange={(e) => isISODate(e.target.value) && setFrom(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-surface px-2" /></Field>
          <Field label="Au"><input type="date" value={to} max={today()} onChange={(e) => isISODate(e.target.value) && setTo(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-surface px-2" /></Field>
        </div>
      )}
      {summary.loggedDays === 0 ? (
        <EmptyState icon={<IconChart />} title="Aucun repas sur cette période" text="Les statistiques sont calculées uniquement à partir de tes repas enregistrés." action={<Button onClick={() => navigate('add', { fresh: 1 })}>Ajouter un repas</Button>} />
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Moyenne / jour noté" value={`${fmtKcal(summary.avg!.kcal)} kcal`} sub={goals ? `objectif ${fmtKcal(goals.kcal)} kcal` : undefined} />
              <Stat label="Jours notés" value={`${summary.loggedDays} / ${summary.totalDays}`} sub="les jours vides ne comptent pas" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[13px] tabular-nums">
              <div><span className="text-protein">●</span> P <b>{fmtG(summary.avg!.protein)} g</b></div>
              <div><span className="text-carbs">●</span> G <b>{fmtG(summary.avg!.carbs)} g</b></div>
              <div><span className="text-fat">●</span> L <b>{fmtG(summary.avg!.fat)} g</b></div>
            </div>
          </Card>
          <Card className="mt-3 !px-2">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-line)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v) => [`${fmtKcal(Number(v))} kcal`, 'Consommé']} />
                  {goals && <ReferenceLine y={goals.kcal} stroke="var(--color-accent)" strokeDasharray="4 4" />}
                  <Bar dataKey="kcal" fill="var(--color-brand)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="px-2 text-[12px] text-muted">Calories par jour noté{goals ? ' · ┅ objectif' : ''}. Les jours sans repas restent vides (pas de zéro inventé).</p>
          </Card>
          {weekly.length > 1 && (
            <>
              <SectionTitle>Moyennes hebdomadaires</SectionTitle>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface text-[14px]">
                {weekly.map((w) => (
                  <li key={w.week} className="flex justify-between px-4 py-2.5"><span>Semaine du {formatShortDate(w.week)}</span><span className="tabular-nums"><b>{fmtKcal(w.avgKcal)}</b> kcal <span className="text-muted">({w.days} j)</span></span></li>
                ))}
              </ul>
            </>
          )}
          {frequent.length > 0 && (
            <>
              <SectionTitle>Aliments les plus fréquents</SectionTitle>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface text-[14px]">
                {frequent.map((f) => (
                  <li key={f.name} className="flex justify-between gap-2 px-4 py-2.5"><span className="truncate">{f.name}</span><span className="shrink-0 tabular-nums text-muted">{f.count}× · {fmtKcal(f.kcal)} kcal</span></li>
                ))}
              </ul>
            </>
          )}
          <SectionTitle>Jours</SectionTitle>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface text-[14px]">
            {[...summary.days].reverse().filter((d) => d.totals).map((d) => (
              <li key={d.date}>
                <a href={href('today', { date: d.date === today() ? undefined : d.date })} className="flex justify-between px-4 py-3 active:bg-bg">
                  <span className="first-letter:uppercase">{formatDayLabel(d.date)}</span>
                  <span className="font-semibold tabular-nums">{fmtKcal(d.totals!.kcal)} kcal</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Couleurs informatives (jamais un jugement) : même palette que les badges existants. */
const TONE_STYLE: Record<DayTone, string> = {
  near: 'bg-brand-soft text-brand-strong',
  moderate: 'bg-[#fff6dc] text-[#8a6100]',
  marked: 'bg-[#ffe2c4] text-[#9a4a05]',
  large: 'bg-[#fde8e4] text-[#a8321b]',
};

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function MonthTab({ route }: { route: Route }) {
  const { goals, profile } = useApp();
  const qm = route.query.get('m');
  const month = qm && /^\d{4}-\d{2}$/.test(qm) ? qm : monthOf(today());
  const setMonth = (m: string) => navigate('progress', { tab: 'month', m: m === monthOf(today()) ? undefined : m }, { replace: true });
  const [selected, setSelected] = useState<string | null>(null);
  const first = `${month}-01`;
  const last = `${month}-31`;
  const meals = useLiveQuery(() => db.meals.where('date').between(first, last, true, true).toArray(), [first, last]);
  const exercises = useLiveQuery(() => db.exercises.where('date').between(first, last, true, true).toArray(), [first, last]);
  const view = useMemo(() => meals && exercises ? buildMonthView(month, meals, {
    history: goals?.history ?? [],
    current: goals ? { kcal: goals.kcal, goal: profile?.goal ?? 'maintain' } : null,
    exercises, energyMethod: profile?.energyMethod, exerciseCredit: profile?.exerciseCredit,
  }) : null, [month, meals, exercises, goals, profile]);
  if (!view) return null;
  const s = view.stats;
  const isCurrent = month === monthOf(today());
  const sel = selected ? view.grid.find((d) => d.date === selected) : null;
  const goalMode = profile?.goal ?? 'maintain';

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <IconButton label="Mois précédent" onClick={() => { setSelected(null); setMonth(shiftMonth(month, -1)); }}><IconChevronLeft /></IconButton>
        <div className="text-center">
          <div className="text-lg font-extrabold first-letter:uppercase">{view.label}</div>
          {!isCurrent && <button type="button" className="text-[12px] font-medium text-brand" onClick={() => setMonth(monthOf(today()))}>Revenir au mois en cours</button>}
        </div>
        <IconButton label="Mois suivant" disabled={isCurrent} onClick={() => { setSelected(null); setMonth(shiftMonth(month, 1)); }}><IconChevronRight /></IconButton>
      </div>

      <Card className="!p-2.5">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted">
          {WEEKDAYS.map((w, i) => <div key={i} className="py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {view.grid.map((d) => {
            const day = Number(d.date.slice(8));
            if (!d.inMonth) return <div key={d.date} />;
            const future = d.date > today();
            return (
              <button
                key={d.date}
                type="button"
                disabled={future}
                onClick={() => setSelected(selected === d.date ? null : d.date)}
                aria-label={`${formatDayLabel(d.date)}${d.totals ? ` : ${fmtKcal(d.totals.kcal)} kcal` : ' : aucun repas'}${d.tone ? `, ${TONE_LABEL[d.tone]}` : ''}`}
                aria-pressed={selected === d.date}
                className={cx('flex min-h-[54px] flex-col items-center justify-center rounded-xl px-0.5 tabular-nums transition-colors',
                  d.tone ? TONE_STYLE[d.tone] : d.totals ? 'bg-line/50' : 'bg-bg text-muted',
                  selected === d.date && 'ring-2 ring-ink/70', d.date === today() && 'font-extrabold', future && 'opacity-40')}
              >
                <span className="text-[12px] leading-none">{day}</span>
                {d.totals && <span className="mt-1 text-[11px] font-semibold leading-none">{fmtKcal(d.totals.kcal)}</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11.5px] text-muted">
          {(Object.keys(TONE_LABEL) as DayTone[]).map((t) => <span key={t} className="inline-flex items-center gap-1"><span className={cx('inline-block h-3 w-3 rounded', TONE_STYLE[t])} />{TONE_LABEL[t]}</span>)}
        </div>
      </Card>

      {sel && (
        <Card className="anim-fade mt-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-bold first-letter:uppercase">{formatDayLabel(sel.date)}</div>
              {sel.totals ? (
                <div className="mt-1 text-[14px] tabular-nums">
                  <b>{fmtKcal(sel.totals.kcal)} kcal</b>{sel.target ? <span className="text-muted"> / objectif {fmtKcal(sel.target)} kcal</span> : null}
                  {sel.target != null && sel.goal && <div className="text-[13px] text-muted">{deviationText(sel.totals.kcal, sel.target, sel.goal)}{sel.tone ? ` · ${TONE_LABEL[sel.tone].toLowerCase()}` : ''}</div>}
                  <div className="mt-1 text-[12.5px] text-muted">P {fmtG(sel.totals.protein)} g · G {fmtG(sel.totals.carbs)} g · L {fmtG(sel.totals.fat)} g</div>
                </div>
              ) : <div className="mt-1 text-[14px] text-muted">Aucun repas noté ce jour-là.</div>}
            </div>
          </div>
          <Button variant="secondary" block className="mt-3" onClick={() => navigate('today', { date: sel.date === today() ? undefined : sel.date })}>{sel.totals ? 'Voir le journal du jour' : 'Ajouter des repas ce jour-là'}</Button>
        </Card>
      )}

      {s.loggedDays === 0 ? (
        <EmptyState icon={<IconChart />} title="Aucun repas ce mois-ci" text="Les jours notés apparaissent ici avec leurs calories et l’écart à ton objectif." />
      ) : (
        <>
          <Card className="mt-3">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Moyenne / jour noté" value={`${fmtKcal(s.avgKcal)} kcal`} sub={s.avgDiff != null ? `${s.avgDiff > 0 ? '+' : ''}${fmtKcal(s.avgDiff)} kcal vs objectif` : undefined} />
              <Stat label="Jours suivis" value={`${s.loggedDays} / ${s.daysInMonth}`} sub={`${s.nearDays} proche(s) de l’objectif`} />
              <Stat label="Total du mois" value={`${fmtKcal(s.totalKcal)} kcal`} sub="jours notés uniquement" />
              <Stat label="Objectif" value={goals ? `${fmtKcal(goals.kcal)} kcal` : '—'} sub={GOAL_LABEL[goalMode]} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[13px] tabular-nums">
              <div><span className="text-protein">●</span> P <b>{fmtG(s.avgProtein)} g</b></div>
              <div><span className="text-carbs">●</span> G <b>{fmtG(s.avgCarbs)} g</b></div>
              <div><span className="text-fat">●</span> L <b>{fmtG(s.avgFat)} g</b></div>
            </div>
            <p className="mt-1 text-[12px] text-muted">Moyennes par jour noté.</p>
          </Card>
          {s.weeks.filter((w) => w.days).length > 1 && (
            <>
              <SectionTitle>Évolution au fil du mois</SectionTitle>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface text-[14px]">
                {s.weeks.map((w) => (
                  <li key={w.label} className="flex justify-between px-4 py-2.5"><span>Du {w.label}</span><span className="tabular-nums">{w.avgKcal != null ? <><b>{fmtKcal(w.avgKcal)}</b> kcal/j <span className="text-muted">({w.days} j)</span></> : <span className="text-muted">aucun jour noté</span>}</span></li>
                ))}
              </ul>
            </>
          )}
          <Notice className="mt-3">
            Les couleurs indiquent l’écart à l’objectif {goalMode === 'gain' ? 'de prise de masse : un léger dépassement est attendu' : goalMode === 'lose' ? 'de perte : un apport très bas est aussi signalé' : 'du jour'}. Ce sont des repères, pas un jugement : seule la tendance sur plusieurs semaines compte. Chaque jour est comparé à l’objectif qui s’appliquait à cette date.
          </Notice>
        </>
      )}
    </div>
  );
}
