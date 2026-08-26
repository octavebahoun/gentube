import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HyperframesStoryboard } from '@/lib/storyboard/render';
import { COMPOSITION_DIR, composeHtml } from './composition';

/**
 * Prépare un dossier de rendu sur disque.
 *
 * HyperFrames rend un **répertoire** : un `index.html`, ses feuilles de style,
 * ses scripts et ses médias, tous résolus en chemins relatifs par un Chrome
 * headless. Nos médias vivent sur R2 derrière des URLs signées à durée de vie
 * courte. Il faut donc les poser sur un disque avant de rendre.
 *
 * **Pourquoi pas laisser Chrome charger les URLs signées.** Trois raisons, dans
 * l'ordre où elles font mal : une URL signée expire au milieu d'un rendu de
 * plusieurs minutes ; le rendu de Lambda peut n'avoir aucun accès réseau ; et
 * un plan qui échoue à charger ne fait pas échouer le rendu, il produit une
 * scène noire dans une vidéo déjà facturée.
 *
 * Le dossier est temporaire et jetable. Ce qui est durable — la feuille de
 * style, GSAP, la configuration — vit dans `render/gentube-v1` et est recopié
 * à chaque fois.
 */

/** Ce qui sait lire un asset. Injectable, pour que les tests ne touchent pas R2. */
export interface AssetReader {
  read(key: string): Promise<Buffer>;
}

export type MaterializedRender = {
  /** Le dossier à passer à `hyperframes render`. */
  dir: string;
  /** Le storyboard réécrit en chemins locaux. */
  storyboard: HyperframesStoryboard;
  /** Supprime le dossier. À appeler dans un `finally`, toujours. */
  cleanup(): Promise<void>;
};

/**
 * Nom de fichier local d'un asset, dérivé de sa position dans le storyboard.
 *
 * Volontairement pas dérivé de la clé R2 : celle-ci porte l'identifiant du
 * tenant, et un chemin qui traverse Chrome finit dans des logs. Le dossier
 * temporaire ne dit rien de qui possède la vidéo.
 */
function localName(kind: string, index: number, key: string): string {
  const extension = key.includes('.') ? key.slice(key.lastIndexOf('.')) : '';
  return `${kind}/scene-${index + 1}${extension}`;
}

export async function materialize(
  storyboard: HyperframesStoryboard,
  reader: AssetReader,
  { watermark = false }: { watermark?: boolean } = {}
): Promise<MaterializedRender> {
  const dir = await mkdtemp(join(tmpdir(), 'gentube-render-'));

  const cleanup = async () => {
    await rm(dir, { recursive: true, force: true });
  };

  try {
    // Le squelette de composition d'abord : style, GSAP, configuration.
    await cp(COMPOSITION_DIR, dir, { recursive: true });
    await mkdir(join(dir, 'media'), { recursive: true });
    await mkdir(join(dir, 'voice'), { recursive: true });

    const scenes = await Promise.all(
      storyboard.scenes.map(async (scene, index) => {
        const next = { ...scene };

        if (scene.mediaPath) {
          const name = localName('media', index, scene.mediaPath);
          await writeFile(join(dir, name), await reader.read(scene.mediaPath));
          next.mediaPath = name;
        }
        if (scene.audioPath) {
          const name = localName('voice', index, scene.audioPath);
          await writeFile(join(dir, name), await reader.read(scene.audioPath));
          next.audioPath = name;
        }

        return next;
      })
    );

    let music = storyboard.music;
    if (music) {
      const name = localName('media', storyboard.scenes.length, music);
      await writeFile(join(dir, name), await reader.read(music));
      music = name;
    }

    const local: HyperframesStoryboard = { ...storyboard, scenes, music };
    await writeFile(
      join(dir, 'index.html'),
      composeHtml({ storyboard: local, watermark })
    );

    return { dir, storyboard: local, cleanup };
  } catch (error) {
    // Un dossier temporaire abandonné sur un échec est une fuite de disque
    // qui ne se voit qu'une fois la machine pleine.
    await cleanup();
    throw error;
  }
}
