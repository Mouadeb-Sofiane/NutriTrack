import { useEffect, useState } from 'react';
import { repo } from '../state/app';
import { cx } from './kit';

/** Affiche une photo stockée localement (IndexedDB). */
export function PhotoView({ id, className }: { id: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    let alive = true;
    repo.getPhoto(id).then((p) => {
      if (!alive || !p) return;
      u = URL.createObjectURL(p.blob);
      setUrl(u);
    });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [id]);
  if (!url) return <div className={cx('bg-line/60', className)} />;
  return <img src={url} alt="Photo du repas" className={cx('object-cover', className)} />;
}
