/**
 * Après une photo : reconnaissance LOCALE du plat (si le modèle est installé), puis choix
 * simple. Rien n'est envoyé ; rien n'est enregistré ici. Chaque proposition ouvre l'écran
 * habituel (portion, estimations moyenne et haute), et l'on peut en ajouter plusieurs.
 */
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Recipe } from '../../domain/types';
import { QUICK_IDENTIFY } from '../../domain/photoAnalysis';
import { CONFIDENCE_LABEL, recipesForProposals, type LabelTarget, type Proposal } from '../../domain/recognition';
import { db } from '../../data/db';
import { repo } from '../../state/app';
import { recognize, type LocalRecognition } from '../../vision/recognizer';
import type { MassRange } from '../../domain/photoMass';
import { installedManifest } from '../../vision/modelStore';
import { ModelInstaller } from '../VisionSettings';
import { Sheet } from '../../ui/Sheet';
import { Button, Chip, Notice, cx } from '../../ui/kit';
import { PhotoView } from '../../ui/PhotoView';
import { IconCheck } from '../../ui/icons';

const cache = new Map<string, LocalRecognition>();
const SLOW_MS = 12000;

export function PhotoIdentifySheet({ photoId, open, added, onClose, onText, onHomeDish, onPick, onPickRecipe }: {
  photoId: string | null;
  open: boolean;
  /** Libellés déjà ajoutés au repas depuis cette photo. */
  added: string[];
  onClose: () => void;
  onText: (text: string) => void;
  onHomeDish: () => void;
  onPick: (labelId: string, target: LabelTarget, mass: MassRange | null) => void;
  onPickRecipe: (recipe: Recipe) => void;
}) {
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? [];
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LocalRecognition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInstaller, setShowInstaller] = useState(false);

  const run = async (fast = false) => {
    if (!photoId) return;
    setBusy(true);
    setError(null);
    try {
      const p = await repo.getPhoto(photoId);
      if (!p) throw new Error('Photo introuvable.');
      const r = await recognize(p.blob, { fast });
      cache.set(photoId, r);
      setResult(r);
    } catch (e) {
      setError(`La reconnaissance n’a pas pu s’exécuter sur cet appareil (${(e as Error).message}). Identifie le plat ci-dessous.`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!photoId) return;
    setResult(cache.get(photoId) ?? null);
    setError(null);
    installedManifest().then((m) => {
      setInstalled(!!m);
      if (m && !cache.has(photoId)) run();
    }).catch(() => setInstalled(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId]);

  const suggestions = result ? recipesForProposals(result.proposals, recipes) : [];

  return (
    <Sheet open={open && !!photoId} onClose={onClose} title="Qu’y a-t-il sur la photo ?" footer={added.length ? <Button block onClick={onClose}>Terminer ({added.length} ajouté{added.length > 1 ? 's' : ''})</Button> : undefined}>
      {photoId && <PhotoView id={photoId} className="mb-3 h-36 w-full rounded-2xl" />}

      {installed && busy && (
        <div className="mb-3 rounded-2xl bg-surface p-4 text-center text-[14px]">
          <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          Reconnaissance sur ton téléphone…
          <div className="text-[12px] text-muted">Le premier passage charge le modèle (quelques secondes de plus).</div>
        </div>
      )}
      {error && <Notice tone="warn" className="mb-3">{error}</Notice>}

      {result && !busy && (
        <div className="mb-4">
          {result.notFood && <Notice tone="warn" className="mb-2">La photo ne ressemble pas clairement à un plat. Les propositions ci-dessous sont peu fiables.</Notice>}
          {!result.notFood && result.uncertain && <Notice className="mb-2">Reconnaissance hésitante : vérifie, ou identifie le plat toi-même plus bas.</Notice>}
          {result.mass && !result.notFood && (
            <div className="mb-3 rounded-2xl bg-brand-soft/60 px-3.5 py-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-semibold">Poids estimé de l’assiette</span>
                <span className="text-lg font-extrabold tabular-nums">~{result.mass.normal} g</span>
              </div>
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="text-accent">Estimation haute</span><span className="font-semibold tabular-nums">{result.mass.high} g</span>
              </div>
              <p className="mt-1 text-[11.5px] leading-snug text-muted">
                Fourchette {result.mass.low}–{result.mass.high} g. Calculé sur la photo, pas pesé : erreur typique ±20 %, plus fiable pour une assiette entière photographiée du dessus. Peu adapté à un sandwich emballé, un bol vu de côté ou une boisson. Il sera proposé (modifiable) quand tu choisis la portion.
              </p>
            </div>
          )}
          <div className="mb-1.5 text-[13px] font-semibold">Propositions (touche pour ajouter et choisir la portion)</div>
          <ul className="space-y-1.5">
            {result.proposals.map((p: Proposal) => {
              const done = added.includes(p.label.id);
              return (
                <li key={p.label.id}>
                  <button type="button" onClick={() => onPick(p.label.id, p.label.target, result.notFood ? null : result.mass)} className={cx('flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left active:bg-bg', done ? 'bg-brand-soft' : 'bg-surface')}>
                    <span className="flex-1">
                      <span className="block font-semibold">{p.label.fr}</span>
                      <span className="block text-[12px] text-muted">{CONFIDENCE_LABEL[p.confidence]} · score relatif {p.p < 0.01 ? "< 1" : Math.min(99, Math.round(p.p * 100))} %{p.fromZone ? ' · repéré dans une partie de la photo' : ''}</span>
                    </span>
                    {done ? <IconCheck className="text-brand" /> : <span className="text-[13px] font-semibold text-brand">Ajouter</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {suggestions.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-[13px] font-semibold">Tes recettes qui correspondent</div>
              <div className="flex flex-wrap gap-2">{suggestions.map((r) => <Chip key={r.id} onClick={() => onPickRecipe(r)}>{r.name}</Chip>)}</div>
            </div>
          )}
          <p className="mt-2 text-[11.5px] leading-snug text-muted">
            Reconnaissance locale (OpenCLIP) en {(result.ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s. Les pourcentages sont relatifs à la liste d’aliments connue de l’application, pas des certitudes. La portion n’est pas mesurée sur la photo.
            {result.zones === 5 && result.ms > SLOW_MS && ' Téléphone lent : '}
            {result.zones === 5 && result.ms > SLOW_MS && <button type="button" className="font-semibold text-brand" onClick={() => run(true)}>passer en mode rapide</button>}
          </p>
        </div>
      )}

      {installed === false && (
        <div className="mb-4 rounded-2xl bg-surface p-3.5">
          {showInstaller ? (
            <ModelInstaller compact onInstalled={() => { setInstalled(true); setShowInstaller(false); run(); }} />
          ) : (
            <>
              <p className="text-[13.5px]">📷 Reconnaissance automatique : installe une fois le modèle gratuit (110 Mo), il fonctionnera ensuite hors ligne, sans envoyer tes photos.</p>
              <Button variant="soft" block className="mt-2" onClick={() => setShowInstaller(true)}>Installer la reconnaissance</Button>
            </>
          )}
        </div>
      )}

      <div className="mb-1.5 text-[13px] font-semibold">{result ? 'Ce n’est pas ça ?' : 'Identifier le plat'}</div>
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
    </Sheet>
  );
}
