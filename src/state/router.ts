/** Mini-routeur par hash (#/chemin?x=y) : fonctionne dans n'importe quel sous-dossier et hors ligne. */
import { useEffect, useState } from 'react';

export interface Route {
  path: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [p, q = ''] = raw.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function href(path: string, query?: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v != null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return `#/${path.replace(/^\//, '')}${s ? `?${s}` : ''}`;
}

export function navigate(path: string, query?: Record<string, string | number | undefined | null>, opts: { replace?: boolean } = {}) {
  const h = href(path, query);
  if (opts.replace) window.location.replace(h);
  else window.location.hash = h;
}

export function goBack(fallback = 'today') {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback, undefined, { replace: true });
}
