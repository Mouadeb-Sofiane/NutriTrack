/** Installation du modèle de reconnaissance photo (sur l'appareil, gratuit, hors ligne). */
import { useEffect, useRef, useState } from 'react';
import { deleteModel, deviceCheck, downloadModel, installedManifest, type VisionManifest } from '../vision/modelStore';
import { disposeEngine, RUNTIME_URLS } from '../vision/recognizer';
import { Button, Card, Notice, SectionTitle } from '../ui/kit';
import { ProgressBar } from '../ui/charts';
import { useFeedback } from '../ui/feedback';

const mb = (n: number) => `${Math.round(n / 1e6)} Mo`;

export function useModelStatus() {
  const [m, setM] = useState<VisionManifest | null | undefined>(undefined);
  const refresh = () => installedManifest().then(setM).catch(() => setM(null));
  useEffect(() => { refresh(); }, []);
  return { manifest: m, refresh };
}

export function ModelInstaller({ onInstalled, compact }: { onInstalled: (m: VisionManifest) => void; compact?: boolean }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const check = deviceCheck();
  const conn = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
  const cellular = conn?.type === 'cellular' || conn?.saveData;

  const start = async () => {
    setError(null);
    setProgress(0);
    abort.current = new AbortController();
    try {
      const m = await downloadModel((p) => setProgress(p.loaded / p.total), abort.current.signal, RUNTIME_URLS);
      setProgress(null);
      onInstalled(m);
    } catch (e) {
      setProgress(null);
      if ((e as Error).name !== 'AbortError') setError((e as Error).message || 'Téléchargement impossible.');
    }
  };

  return (
    <div>
      {!compact && (
        <p className="mb-2 text-[13.5px] leading-snug">
          Le modèle reconnaît le plat <b>directement sur ton téléphone</b> : gratuit, sans compte, hors ligne une fois installé. Les photos ne quittent jamais l’appareil.
        </p>
      )}
      <ul className="mb-3 list-disc space-y-0.5 pl-5 text-[12.5px] text-muted">
        <li>Téléchargement unique d’environ <b>110 Mo</b> (modèle 96 Mo + moteur 15 Mo, Wi-Fi conseillé), stocké dans le navigateur.</li>
        <li>Quelques secondes par photo selon le téléphone ; mémoire conseillée : 3 Go ou plus.</li>
        <li>Il propose des plats probables ; tu choisis la portion (une photo ne donne pas le poids).</li>
      </ul>
      {check.warnings.map((w) => <Notice key={w} tone="warn" className="mb-2">{w}</Notice>)}
      {cellular && <Notice tone="warn" className="mb-2">Tu sembles être en données mobiles : préfère le Wi-Fi pour ce téléchargement.</Notice>}
      {progress != null ? (
        <div>
          <ProgressBar value={progress} />
          <div className="mt-1 flex justify-between text-[12.5px] text-muted">
            <span>Téléchargement… {Math.round(progress * 100)} %</span>
            <button type="button" className="font-semibold text-danger" onClick={() => abort.current?.abort()}>Annuler</button>
          </div>
        </div>
      ) : (
        <Button block disabled={!check.ok} onClick={start}>Télécharger le modèle (110 Mo, une seule fois)</Button>
      )}
      {error && <Notice tone="warn" className="mt-2">{error}</Notice>}
    </div>
  );
}

export function VisionSection() {
  const { manifest, refresh } = useModelStatus();
  const { confirm, toast } = useFeedback();
  const [usage, setUsage] = useState<string | null>(null);
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => e.usage != null && setUsage(mb(e.usage))).catch(() => undefined);
  }, [manifest]);
  return (
    <>
      <SectionTitle>Reconnaissance des photos</SectionTitle>
      <Card>
        {manifest === undefined ? null : manifest ? (
          <>
            <p className="text-[14px]">✓ Modèle installé sur cet appareil ({mb(manifest.size)}). Les photos sont analysées localement, sans connexion et sans frais.</p>
            <p className="mt-1 text-[12.5px] text-muted">{manifest.model} · licence {manifest.license}{usage ? ` · stockage utilisé par l’application : ${usage}` : ''}</p>
            <Button variant="ghost" size="sm" className="mt-2 !px-0 !text-danger" onClick={async () => {
              if (!(await confirm({ title: 'Supprimer le modèle ?', text: 'Libère environ 96 Mo. Tu pourras le retélécharger. Tes repas ne sont pas touchés.', confirm: 'Supprimer', danger: true }))) return;
              disposeEngine();
              await deleteModel();
              await refresh();
              toast('Modèle supprimé');
            }}>Supprimer le modèle</Button>
          </>
        ) : (
          <ModelInstaller onInstalled={() => { refresh(); toast('Modèle installé : la reconnaissance fonctionne maintenant hors ligne'); }} />
        )}
      </Card>
    </>
  );
}
