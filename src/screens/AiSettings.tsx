/** Réglages de l'analyse photo par IA (relais personnel). */
import { useEffect, useState } from 'react';
import { db } from '../data/db';
import { checkAiConnection, DEFAULT_AI_CONFIG, generateAccessCode, isAiReady, loadAiConfig, saveAiConfig, type AiConfig } from '../data/aiClient';
import { Sheet } from '../ui/Sheet';
import { Button, Field, Notice, TextInput, Toggle } from '../ui/kit';
import { useFeedback } from '../ui/feedback';

export const AI_GUIDE_URL = 'https://github.com/mouadeb-sofiane/nutritrack/blob/main/docs/analyse-photo-ia.md';

export function AiSettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [c, setC] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const [showCode, setShowCode] = useState(false);
  const [testing, setTesting] = useState(false);
  const { toast } = useFeedback();
  useEffect(() => { if (open) loadAiConfig(db).then(setC); }, [open]);
  const set = (p: Partial<AiConfig>) => setC((x) => ({ ...x, ...p }));

  const test = async () => {
    setTesting(true);
    const lastCheck = await checkAiConnection({ ...c, endpoint: c.endpoint.trim().replace(/\/+$/, ''), accessCode: c.accessCode.trim() });
    setTesting(false);
    set({ lastCheck });
  };
  const save = async () => {
    await saveAiConfig(db, c);
    toast(isAiReady(c) ? 'Analyse photo par IA activée' : 'Réglages enregistrés');
    onClose();
  };
  const endpointOk = !c.endpoint || /^https:\/\//.test(c.endpoint.trim());

  return (
    <Sheet open={open} onClose={onClose} title="Analyse photo par IA" footer={<Button block onClick={save}>Enregistrer</Button>}>
      <Notice className="mb-3">
        La photo est envoyée à <b>ton propre relais</b> (Cloudflare Workers), qui la transmet au modèle de vision <b>Google Gemini</b> et renvoie les aliments et portions estimés. Les calories sont ensuite calculées sur ton téléphone avec les tables de l’application.
        La clé API Gemini reste dans le relais : elle n’est jamais dans l’application. <a className="font-semibold text-brand" href={AI_GUIDE_URL} target="_blank" rel="noreferrer">Guide d’installation (≈ 15 min)</a>
      </Notice>
      <Field label="Adresse du relais" hint="Ex. https://nutritrack-ia.ton-compte.workers.dev" error={endpointOk ? null : 'L’adresse doit commencer par https://'}>
        <TextInput value={c.endpoint} onChange={(e) => set({ endpoint: e.target.value })} placeholder="https://…workers.dev" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </Field>
      <Field label="Code d’accès" hint="Le même que le secret ACCESS_CODE du relais. Il protège ton relais contre les autres personnes ; il ne donne pas accès à ta clé Gemini.">
        <div className="flex gap-2">
          <TextInput type={showCode ? 'text' : 'password'} value={c.accessCode} onChange={(e) => set({ accessCode: e.target.value })} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <Button variant="secondary" onClick={() => setShowCode(!showCode)}>{showCode ? 'Masquer' : 'Voir'}</Button>
        </div>
        <Button variant="ghost" size="sm" className="mt-1 !px-0" onClick={async () => {
          const code = generateAccessCode();
          set({ accessCode: code });
          setShowCode(true);
          try { await navigator.clipboard.writeText(code); toast('Code généré et copié : colle-le dans ACCESS_CODE sur Cloudflare'); } catch { toast('Code généré : recopie-le dans ACCESS_CODE sur Cloudflare'); }
        }}>Générer un nouveau code</Button>
      </Field>
      <div className="mb-4 rounded-2xl bg-surface p-3.5">
        <div className="mb-2 font-semibold">Confidentialité</div>
        <ul className="mb-3 list-disc space-y-1 pl-5 text-[13px] text-muted">
          <li>Envoyé : la photo choisie (réduite à 1024 px) et la précision que tu écris éventuellement. <b>Rien d’autre</b> : ni profil, ni poids, ni historique.</li>
          <li>Rien n’est envoyé sans que tu appuies sur « Analyser avec l’IA ».</li>
          <li>Ton relais ne conserve ni les photos ni les réponses.</li>
          <li>Google traite la photo selon les conditions de l’API Gemini : avec la facturation activée (ou pour les utilisateurs de l’UE), elles ne servent pas à entraîner les modèles. Vérifie les conditions en vigueur.</li>
        </ul>
        <Toggle checked={c.consent} onChange={(consent) => set({ consent })} label="J’accepte que les photos que je choisis d’analyser soient envoyées à mon relais puis à Google Gemini" />
      </div>
      <Toggle checked={c.enabled} onChange={(enabled) => set({ enabled })} label="Activer l’analyse photo par IA" desc="Désactivée, l’application propose l’identification manuelle." />
      <Button variant="secondary" block disabled={testing || !c.endpoint || !c.accessCode} onClick={test}>{testing ? 'Test en cours…' : 'Tester la connexion'}</Button>
      {c.lastCheck && (
        <Notice tone={c.lastCheck.ok ? 'ok' : 'warn'} className="mt-3">
          {c.lastCheck.ok ? `✓ Relais joignable · ${c.lastCheck.provider} · modèle ${c.lastCheck.model}` : `✗ ${c.lastCheck.error}`}
        </Notice>
      )}
      {!isAiReady(c) && c.enabled && <p className="mt-3 text-[12.5px] text-warn">Pour activer l’analyse : adresse https, code d’au moins 16 caractères et consentement requis.</p>}
    </Sheet>
  );
}
