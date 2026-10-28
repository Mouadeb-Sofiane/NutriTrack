/**
 * Analyse de photo : interface prévue pour un futur service de vision.
 *
 * Aujourd'hui AUCUN service n'est configuré : l'analyse renvoie « indisponible » et
 * l'application propose une identification rapide manuelle. On n'affiche jamais un
 * résultat présenté comme venant d'une IA si aucune analyse réelle n'a eu lieu.
 */
export interface PhotoAnalysisResult {
  status: 'ok' | 'unavailable' | 'error';
  /** Ce qui est réellement visible, ce qui est supposé, ce qui reste inconnu. */
  visible?: string[];
  assumed?: string[];
  unknown?: string[];
  /** Description utilisable par la saisie libre (« kebab, frites »). */
  description?: string;
  message: string;
}

export interface PhotoAnalyzer {
  id: string;
  label: string;
  analyze(photo: Blob, hint?: string): Promise<PhotoAnalysisResult>;
}

/** Choix rapides proposés à la place d'une analyse automatique. */
export const QUICK_IDENTIFY: { label: string; emoji: string; text: string }[] = [
  { label: 'Kebab', emoji: '🥙', text: 'kebab' },
  { label: 'Kebab + frites', emoji: '🥙', text: 'kebab avec frites' },
  { label: 'Burger + frites', emoji: '🍔', text: 'burger avec frites' },
  { label: 'Tacos', emoji: '🌯', text: 'tacos' },
  { label: 'Pizza', emoji: '🍕', text: 'pizza' },
  { label: 'Frites', emoji: '🍟', text: 'frites' },
  { label: 'Sandwich', emoji: '🥖', text: 'sandwich' },
  { label: 'Chips', emoji: '🥔', text: 'chips' },
  { label: 'Pop-corn', emoji: '🍿', text: 'pop corn' },
  { label: 'Churros', emoji: '🥖', text: 'churros' },
  { label: 'Crêpe', emoji: '🥞', text: 'crepe au sucre' },
  { label: 'Gaufre', emoji: '🧇', text: 'gaufre' },
  { label: 'Gâteau', emoji: '🍰', text: 'part de gateau' },
  { label: 'Glace', emoji: '🍦', text: 'glace' },
  { label: 'Biscuits', emoji: '🍪', text: 'quelques biscuits' },
  { label: 'Sushis', emoji: '🍣', text: 'sushi' },
];

export async function analyzePhoto(photo: Blob, analyzer: PhotoAnalyzer | null, hint?: string): Promise<PhotoAnalysisResult> {
  if (!analyzer) {
    return {
      status: 'unavailable',
      message: 'Analyse automatique non disponible : aucun service de vision n’est configuré. Indique ce que montre la photo en un geste ou quelques mots.',
    };
  }
  try {
    return await analyzer.analyze(photo, hint);
  } catch {
    return { status: 'error', message: 'L’analyse a échoué. Tu peux identifier le plat manuellement.' };
  }
}
