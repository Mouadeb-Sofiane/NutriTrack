/** Après une photo : analyse automatique si un service existe, sinon identification rapide. */
import { useEffect, useState } from 'react';
import { analyzePhoto, QUICK_IDENTIFY, type PhotoAnalysisResult } from '../../domain/photoAnalysis';
import { repo } from '../../state/app';
import { Sheet } from '../../ui/Sheet';
import { Button, Notice } from '../../ui/kit';
import { PhotoView } from '../../ui/PhotoView';

export function PhotoIdentifySheet({ photoId, onClose, onText, onHomeDish }: { photoId: string | null; onClose: () => void; onText: (text: string) => void; onHomeDish: () => void }) {
  const [result, setResult] = useState<PhotoAnalysisResult | null>(null);
  useEffect(() => {
    setResult(null);
    if (!photoId) return;
    // Aucun service de vision n'est configuré pour l'instant : l'analyse renvoie « indisponible ».
    repo.getPhoto(photoId).then((p) => (p ? analyzePhoto(p.blob, null) : null)).then(setResult);
  }, [photoId]);
  return (
    <Sheet open={!!photoId} onClose={onClose} title="Qu’y a-t-il sur la photo ?">
      {photoId && <PhotoView id={photoId} className="mb-3 h-40 w-full rounded-2xl" />}
      {result && result.status !== 'ok' && <Notice className="mb-3">📷 {result.message} La photo reste sur ton téléphone.</Notice>}
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
