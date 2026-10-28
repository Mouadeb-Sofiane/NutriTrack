/**
 * Après une photo : analyse réelle par IA si elle est configurée et que l'utilisateur la
 * demande ; sinon (ou en cas d'échec) identification rapide manuelle.
 * Rien n'est enregistré ici : les éléments retenus sont ajoutés au repas en cours,
 * où ils restent modifiables jusqu'à l'enregistrement.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { LineItem } from '../../domain/types';
import { analyzePhoto, QUICK_IDENTIFY, type PhotoAnalysisResult } from '../../domain/photoAnalysis';
import { linesFromAnalysis, suggestRecipes, VISIBILITY_LABEL, type NutritionSourceKind } from '../../domain/aiAnalysis';
import { createRelayAnalyzer, isAiReady, loadAiConfig } from '../../data/aiClient';
import { scenarioTotals } from '../../domain/estimates';
import { fmtKcal } from '../../domain/nutrition';
import { db } from '../../data/db';
import { newId } from '../../data/ids';
import { repo } from '../../state/app';
import { navigate } from '../../state/router';
import { prepareForAi } from '../../ui/photo';
import { Sheet } from '../../ui/Sheet';
import { Button, Chip, Notice, TextArea, cx } from '../../ui/kit';
import { PhotoView } from '../../ui/PhotoView';
import { IconWand } from '../../ui/icons';

const SOURCE_BADGE: Record<NutritionSourceKind, { label: string; cls: string }> = {
  catalog: { label: 'Valeurs : catalogue', cls: 'bg-line/70 text-muted' },
  reference: { label: 'Valeurs : référence', cls: 'bg-brand-soft text-brand-strong' },
  mine: { label: 'Valeurs : mes aliments', cls: 'bg-brand-soft text-brand-strong' },
  ai: { label: 'Valeurs IA non vérifiées', cls: 'bg-warn-soft text-warn' },
  none: { label: 'Valeurs inconnues', cls: 'bg-warn-soft text-warn' },
};

export function PhotoIdentifySheet({ photoId, onClose, onText, onHomeDish, onAnalyzed, onUseRecipe }: {
  photoId: string | null;
  onClose: () => void;
  onText: (text: string) => void;
  onHomeDish: () => void;
  onAnalyzed: (items: LineItem[], assumptions: string[], name: string) => void;
  onUseRecipe: (recipeId: string) => void;
}) {
  const config = useLiveQuery(() => loadAiConfig(db), []);
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? [];
  const foods = useLiveQuery(() => db.foods.toArray(), []) ?? [];
  const ready = !!config && isAiReady(config);
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PhotoAnalysisResult | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Record<number, string>>({});

  useEffect(() => { setResult(null); setHint(''); setExcluded(new Set()); setAnswers({}); setBusy(false); }, [photoId]);

  const run = async (extraHint = '') => {
    if (!photoId || !config) return;
    setBusy(true);
    const p = await repo.getPhoto(photoId);
    const r = p ? await analyzePhoto(await prepareForAi(p.blob), ready ? createRelayAnalyzer(config) : null, [hint, extraHint].filter(Boolean).join('\n')) : null;
    setBusy(false);
    setResult(r);
    setExcluded(new Set());
    setAnswers({});
  };

  const lines = useMemo(() => (result?.analysis ? linesFromAnalysis(result.analysis, () => newId('li'), { foods }) : null), [result, foods]);
  const allLines = lines ? [...lines.mapped.map((m) => m.line), ...(lines.hiddenFat ? [lines.hiddenFat] : [])] : [];
  const kept = allLines.filter((l) => !excluded.has(l.id));
  const totals = scenarioTotals(kept);
  const suggestions = result?.analysis ? suggestRecipes(result.analysis, recipes) : [];
  const toggle = (id: string) => setExcluded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const answered = Object.entries(answers).map(([i, a]) => `${result?.analysis?.questions[Number(i)]?.text} → ${a}`);

  const manual = (
    <>
      <div className="grid grid-cols-3 gap-2">
        {QUICK_IDENTIFY.map((q) => (
          <button key={q.label} type="button" onClick={() => onText(q.text)} className="flex flex-col items-center gap-1 rounded-2xl bg-surface px-2 py-3 text-center text-[13px] font-semibold active:bg-bg">
            <span className="text-2xl" aria-hidden>{q.emoji}</span>{q.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onHomeDish}>Plat maison / assiette</Button>
        <Button variant="secondary" onClick={() => onText('')}>Décrire en mots</Button>
      </div>
    </>
  );

  const analysis = result?.status === 'ok' ? result.analysis : null;

  return (
    <Sheet open={!!photoId} onClose={onClose} title={analysis ? 'Résultat de l’analyse' : 'Qu’y a-t-il sur la photo ?'} footer={analysis && kept.length ? (
      <Button block onClick={() => onAnalyzed(kept, lines!.assumptions, analysis.dish_name)}>Ajouter au repas · {fmtKcal(totals.retained)} kcal</Button>
    ) : undefined}>
      {photoId && <PhotoView id={photoId} className={cx('mb-3 w-full rounded-2xl', analysis ? 'h-32' : 'h-40')} />}

      {!analysis && ready && (
        <div className="mb-4 rounded-2xl bg-surface p-3.5">
          <TextArea value={hint} onChange={(e) => setHint(e.target.value)} rows={2} placeholder="Facultatif : ce que tu sais déjà (ex. « poulet, un peu de crème, j’ai mangé la moitié »)" aria-label="Précisions pour l’analyse" />
          <Button block className="mt-2" disabled={busy} onClick={() => run()}><IconWand size={18} /> {busy ? 'Analyse en cours…' : 'Analyser avec l’IA'}</Button>
          <p className="mt-2 text-[12px] text-muted">La photo (réduite) {hint.trim() ? 'et ta précision seront envoyées' : 'sera envoyée'} à ton relais puis à {config?.lastCheck?.provider === 'gemini' || !config?.lastCheck ? 'Google Gemini' : config.lastCheck.provider}. Rien d’autre.</p>
        </div>
      )}
      {result && result.status !== 'ok' && <Notice tone={result.status === 'error' ? 'warn' : 'info'} className="mb-3">{result.message} {result.status === 'error' && 'Tu peux identifier le plat ci-dessous.'}</Notice>}
      {!ready && !result && (
        <Notice className="mb-3">
          📷 Analyse automatique non configurée : aucune photo n’est envoyée. Identifie le plat en un geste, ou <button type="button" className="font-semibold text-brand" onClick={() => { onClose(); navigate('profile'); }}>active l’analyse par IA</button>.
        </Notice>
      )}

      {analysis && lines ? (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="rounded-full bg-brand-soft px-2.5 py-1 font-semibold text-brand-strong">Analyse IA réelle · {result!.provider}</span>
            <span className={cx('rounded-full px-2.5 py-1 font-semibold', analysis.confidence === 'high' ? 'bg-brand-soft text-brand-strong' : analysis.confidence === 'medium' ? 'bg-[#fff6dc] text-[#8a6100]' : 'bg-warn-soft text-warn')}>
              Confiance {analysis.confidence === 'high' ? 'élevée' : analysis.confidence === 'medium' ? 'moyenne' : 'faible'}
            </span>
          </div>
          {analysis.dish_name && <h3 className="mb-2 text-lg font-bold">{analysis.dish_name}</h3>}
          {lines.warnings.map((w) => <Notice key={w} tone="warn" className="mb-2">{w}</Notice>)}

          {suggestions.length > 0 && (
            <div className="mb-3 rounded-2xl bg-brand-soft/60 p-3">
              <div className="text-[13px] font-semibold">Ça ressemble à une de tes recettes :</div>
              <div className="mt-2 flex flex-wrap gap-2">{suggestions.map((r) => <Chip key={r.id} onClick={() => onUseRecipe(r.id)}>Utiliser « {r.name} »</Chip>)}</div>
              <p className="mt-1 text-[12px] text-muted">Tes valeurs de recette seront utilisées à la place de l’estimation de l’IA.</p>
            </div>
          )}

          <ul className="space-y-2">
            {lines.mapped.map(({ line, ai, nutritionSource, matchedName }) => (
              <li key={line.id} className={cx('rounded-2xl bg-surface p-3', excluded.has(line.id) && 'opacity-50')}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" aria-label={`Garder ${line.name}`} checked={!excluded.has(line.id)} onChange={() => toggle(line.id)} className="mt-1 h-5 w-5 accent-[var(--color-brand)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold">{line.name}</span>
                      <span className="shrink-0 font-bold tabular-nums">{line.nutrients.kcal == null ? '? kcal' : `${fmtKcal(line.nutrients.kcal)} kcal`}</span>
                    </div>
                    <div className="text-[12.5px] text-muted">~{Math.round(ai.grams_mean)} g (entre {Math.round(Math.min(ai.grams_low, ai.grams_mean))} et {Math.round(Math.max(ai.grams_high, ai.grams_mean))} g) · {VISIBILITY_LABEL[ai.visibility]}</div>
                    {ai.evidence && <div className="text-[12px] italic text-muted">« {ai.evidence} »</div>}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-semibold', SOURCE_BADGE[nutritionSource].cls)} title={matchedName}>{SOURCE_BADGE[nutritionSource].label}{matchedName ? ` (${matchedName})` : ''}</span>
                      {line.estimate && <span className="text-[11.5px] text-muted">moy. {fmtKcal(line.estimate.mean.kcal)} · haute {fmtKcal(line.estimate.high.kcal)}</span>}
                    </div>
                  </div>
                </div>
              </li>
            ))}
            {lines.hiddenFat && (
              <li className={cx('rounded-2xl border border-dashed border-line bg-surface p-3', excluded.has(lines.hiddenFat.id) && 'opacity-50')}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" aria-label="Garder l’hypothèse de matière grasse" checked={!excluded.has(lines.hiddenFat.id)} onChange={() => toggle(lines.hiddenFat!.id)} className="mt-1 h-5 w-5 accent-[var(--color-brand)]" />
                  <div className="flex-1 text-[13px]">
                    <div className="flex justify-between"><span className="font-semibold">{lines.hiddenFat.name}</span><span className="font-bold tabular-nums">{fmtKcal(lines.hiddenFat.nutrients.kcal)} kcal</span></div>
                    <div className="text-muted">Hypothèse ajoutée : invisible sur la photo (moy. 5 g · haute 15 g). Décoche si le plat n’en contenait pas.</div>
                  </div>
                </div>
              </li>
            )}
          </ul>

          <div className="mt-3 rounded-2xl bg-bg p-3 text-[13px]">
            {analysis.items.some((i) => i.visibility === 'visible') && <p><b>Visible :</b> {analysis.items.filter((i) => i.visibility === 'visible').map((i) => i.name).join(', ')}</p>}
            {analysis.items.some((i) => i.visibility !== 'visible') && <p><b>Supposé :</b> {analysis.items.filter((i) => i.visibility !== 'visible').map((i) => i.name).join(', ')}</p>}
            {analysis.hidden_unknowns.length > 0 && <p><b>Inconnu :</b> {analysis.hidden_unknowns.join(' ; ')}</p>}
          </div>

          {kept.length > 0 && (
            <div className="mt-3 rounded-2xl bg-brand-soft px-4 py-3 text-[13.5px] text-brand-strong">
              <div className="flex justify-between"><span>Estimation moyenne</span><b className="tabular-nums">{fmtKcal(totals.mean)} kcal</b></div>
              <div className="flex justify-between"><span>Estimation haute</span><b className="tabular-nums">{fmtKcal(totals.high)} kcal</b></div>
              <p className="mt-1 text-[12px]">Portions estimées sur la photo, pas pesées : la fourchette elle-même reste approximative. Tu pourras modifier chaque aliment, sa portion et la valeur retenue avant d’enregistrer.</p>
            </div>
          )}

          {(
            <div className="mt-3 rounded-2xl bg-surface p-3">
              {analysis.questions.map((q, i) => (
                <div key={i} className="mb-2">
                  <div className="text-[13px] font-semibold">{q.text}</div>
                  <div className="mt-1 flex flex-wrap gap-2">{q.options.map((o) => <Chip key={o} active={answers[i] === o} onClick={() => setAnswers({ ...answers, [i]: o })}>{o}</Chip>)}</div>
                </div>
              ))}
              <TextArea value={hint} onChange={(e) => setHint(e.target.value)} rows={2} placeholder="Corriger ou préciser (ex. « c’était du poulet, pas du bœuf »)" aria-label="Précisions pour relancer l’analyse" />
              <Button variant="secondary" block className="mt-2" disabled={busy || (!hint.trim() && !answered.length)} onClick={() => run(answered.join('\n'))}>{busy ? 'Analyse en cours…' : 'Relancer l’analyse avec ces précisions'}</Button>
              <p className="mt-1 text-[12px] text-muted">Facultatif. Relancer renvoie la photo pour une nouvelle analyse.</p>
            </div>
          )}
        </div>
      ) : (
        !busy && manual
      )}
      {busy && <p className="py-6 text-center text-sm text-muted">Analyse de la photo… (quelques secondes)</p>}
    </Sheet>
  );
}
