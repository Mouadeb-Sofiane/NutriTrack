/**
 * Redimensionne et compresse une photo sur l'appareil (aucun envoi réseau).
 * Taille max ~1280 px, JPEG qualité 0,8 : suffisant pour se souvenir du plat.
 */
export async function compressImage(file: Blob, maxSide = 1280, quality = 0.8): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image illisible'));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return blob ?? file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Version réduite envoyée à l'analyse IA (1024 px suffisent ; moins de données transmises). */
export function prepareForAi(photo: Blob): Promise<Blob> {
  return compressImage(photo, 1024, 0.8);
}
