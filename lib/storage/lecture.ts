import 'server-only';

import { createAssetStore } from './index';

/**
 * Les adresses de lecture d'un média rangé sur R2.
 *
 * **Une clé n'est pas une URL.** `outputUrl`, `assetUrl` et `sourceImageUrl`
 * portent des clés de bucket — `1/videos/4/images/scene-1.jpg`. Mise telle
 * quelle dans un `src`, le navigateur la résout contre l'adresse de la page et
 * demande `/dashboard/videos/1/videos/4/images/scene-1.jpg`, qui n'existe pas.
 * C'est ainsi que l'éditeur n'a jamais montré une seule image.
 *
 * Signer coûte un HMAC local, pas un aller-retour réseau : signer les dix
 * plans d'un storyboard est gratuit à l'échelle d'un rendu de page.
 */

/** Le temps qu'une lecture tient : assez pour regarder, pas pour partager. */
export const LECTURE_TTL_S = 60 * 60;

/**
 * Signe une clé pour la lecture. Rend `null` si le magasin n'est pas
 * configuré — une instance sans R2 doit afficher la page, pas tomber.
 */
export async function lienDeLecture(
  cle: string | null | undefined,
  ttlS: number = LECTURE_TTL_S
): Promise<string | null> {
  if (!cle) return null;
  try {
    return await createAssetStore().signedUrl(cle, ttlS);
  } catch {
    return null;
  }
}

/**
 * Signe plusieurs clés en une fois, indexées par l'identifiant qu'on leur
 * donne. Le magasin n'est construit qu'une fois pour tout le lot.
 */
export async function liensDeLecture<K extends string | number>(
  entrees: Iterable<readonly [K, string | null | undefined]>,
  ttlS: number = LECTURE_TTL_S
): Promise<Record<K, string | null>> {
  const liste = [...entrees];
  const liens = {} as Record<K, string | null>;
  if (liste.length === 0) return liens;

  let magasin;
  try {
    magasin = createAssetStore();
  } catch {
    // Pas de R2 configuré : tout est `null`, la page s'affiche sans média.
    for (const [id] of liste) liens[id] = null;
    return liens;
  }

  await Promise.all(
    liste.map(async ([id, cle]) => {
      if (!cle) {
        liens[id] = null;
        return;
      }
      try {
        liens[id] = await magasin.signedUrl(cle, ttlS);
      } catch {
        liens[id] = null;
      }
    })
  );

  return liens;
}

/**
 * Ce qu'il faut pour choisir la balise : un clip animé est un `.mp4`, et le
 * mettre dans un `<img>` n'affiche rien. La question se pose sur la clé, pas
 * sur l'URL signée, dont la chaîne de requête masque l'extension.
 */
export function estUneVideo(cle: string | null | undefined): boolean {
  return Boolean(cle && /\.(mp4|webm|mov)$/i.test(cle));
}
