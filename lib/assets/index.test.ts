import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { shots, type Shot } from '@/lib/db/schema';
import type { AssetStore } from '@/lib/storage';
import type { TenantDb } from '@/lib/db/tenant-db';
import {
  closeDb,
  createProjectWithVideo,
  createTenant,
  resetDb,
} from '@/lib/test/fixtures';
import {
  AssetError,
  MAX_BYTES,
  bindAssetToShot,
  getClientAsset,
  kindOf,
  liaisonPour,
  listClientAssets,
  transcribeClientAsset,
  uploadClientAsset,
} from './index';

afterAll(async () => {
  await closeDb();
});

function store() {
  const written: string[] = [];
  const bytes = new Map<string, Buffer>();
  const assets: AssetStore = {
    async put(key, body) {
      written.push(key);
      bytes.set(key, body);
      return key;
    },
    async get(key) {
      const found = bytes.get(key);
      if (!found) throw new Error(`No such object: ${key}`);
      return found;
    },
    async signedUrl(key) {
      return `https://r2.test/${key}`;
    },
  };
  return { assets, written };
}

/** Un transcripteur qui rend ce qu'on lui dit, sans appeler personne. */
function transcripteur(
  sortie = {
    text: 'Voici la bande son.',
    words: [
      { text: 'Voici', start: 0, duration: 0.3 },
      { text: 'la', start: 0.3, duration: 0.2 },
    ],
    language: 'fr',
  }
) {
  const appels: number[] = [];
  return {
    sortie,
    appels,
    transcriber: {
      async transcribe(audio: Buffer) {
        appels.push(audio.length);
        return sortie;
      },
    },
  };
}

/** Un plan, posé à la main : on teste la liaison, pas la génération. */
async function addShot(
  tdb: TenantDb,
  videoId: number,
  type: Shot['type'] = 'image'
): Promise<Shot> {
  const [shot] = await tdb.insert(shots, [
    {
      videoId,
      order: 1,
      type,
      prompt: 'a dashboard on a laptop screen',
      narration: 'Voici le tableau de bord.',
      durationS: 4,
    },
  ]);
  return shot;
}

describe('le genre d un fichier', () => {
  it('reconnaît les images et les vidéos qu on accepte', () => {
    expect(kindOf('image/png')).toBe('image');
    expect(kindOf('video/quicktime')).toBe('video');
  });

  it('refuse le reste en nommant ce qu on accepte', () => {
    // Un PDF déposé par erreur doit dire quoi envoyer, pas « invalid input ».
    expect(() => kindOf('application/pdf')).toThrow(AssetError);
    expect(() => kindOf('application/pdf')).toThrow(/JPEG, PNG or WebP/);
  });
});

describe('le dépôt', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('range le fichier sous le projet et garde son nom d origine', async () => {
    const tdb = await createTenant('Alpha');
    const { project } = await createProjectWithVideo(tdb);
    const { assets, written } = store();

    const asset = await uploadClientAsset(
      tdb,
      project.id,
      {
        bytes: Buffer.from('des octets de png'),
        mimeType: 'image/png',
        originalName: 'capture-tableau-de-bord.png',
        width: 1920,
        height: 1080,
      },
      assets
    );

    // Sous le projet, pas sous la vidéo : les mêmes captures resservent à la
    // deuxième version.
    expect(written[0]).toContain(`projects/${project.id}/imports/`);
    expect(asset.kind).toBe('image');
    expect(asset.originalName).toBe('capture-tableau-de-bord.png');
    expect(asset.bytes).toBe(Buffer.from('des octets de png').length);
    expect(asset.width).toBe(1920);
  });

  it('ne laisse pas deux fichiers s écraser', async () => {
    const tdb = await createTenant('Alpha');
    const { project } = await createProjectWithVideo(tdb);
    const { assets, written } = store();

    for (let n = 0; n < 3; n += 1) {
      await uploadClientAsset(
        tdb,
        project.id,
        { bytes: Buffer.from(`capture ${n}`), mimeType: 'image/png', originalName: 'ecran.png' },
        assets
      );
    }

    // Trois fichiers du même nom déposés à la suite : trois clés distinctes.
    expect(new Set(written).size).toBe(3);
    expect(await listClientAssets(tdb, project.id)).toHaveLength(3);
  });

  it('refuse un fichier vide et un fichier trop lourd', async () => {
    const tdb = await createTenant('Alpha');
    const { project } = await createProjectWithVideo(tdb);
    const { assets } = store();

    await expect(
      uploadClientAsset(tdb, project.id, { bytes: Buffer.alloc(0), mimeType: 'image/png' }, assets)
    ).rejects.toThrow(/empty/);

    await expect(
      uploadClientAsset(
        tdb,
        project.id,
        { bytes: Buffer.alloc(MAX_BYTES + 1), mimeType: 'video/mp4' },
        assets
      )
    ).rejects.toThrow(/limit/);
  });
});

describe('ce qu un apport écrit sur un plan', () => {
  it('une image sur un plan fixe est la scène, et le plan est prêt', () => {
    expect(liaisonPour({ kind: 'image', key: 'k/ecran.png' }, 'image')).toEqual({
      sourceImageUrl: 'k/ecran.png',
      assetUrl: 'k/ecran.png',
      status: 'ready',
    });
  });

  it('une image sur un plan animé reste la matière première du clip', () => {
    // `assetUrl` vide, donc `submitClips` ne saute pas ce plan : c'est le cas
    // de la photo de produit qu'on veut animer.
    expect(liaisonPour({ kind: 'image', key: 'k/produit.jpg' }, 'video')).toEqual({
      sourceImageUrl: 'k/produit.jpg',
      assetUrl: null,
    });
  });

  it('une vidéo est le plan entier, et rien ne sera généré', () => {
    // `sourceImageUrl` nul : une vidéo ne peut pas servir d'image de départ au
    // modèle d'animation, qui attend une image.
    expect(liaisonPour({ kind: 'video', key: 'k/rush.mp4' }, 'image')).toEqual({
      sourceImageUrl: null,
      assetUrl: 'k/rush.mp4',
      status: 'ready',
    });
  });
});

describe('la liaison à un plan', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('rend un plan fixe intouchable par les deux étapes payantes', async () => {
    const tdb = await createTenant('Alpha');
    const { project, video } = await createProjectWithVideo(tdb);
    const { assets } = store();
    const shot = await addShot(tdb, video.id, 'image');

    const asset = await uploadClientAsset(
      tdb,
      project.id,
      { bytes: Buffer.from('png'), mimeType: 'image/png' },
      assets
    );
    await bindAssetToShot(tdb, shot.id, asset.id);

    const [lie] = await tdb.findMany(shots, eq(shots.id, shot.id));
    // `generateImages` saute ce qui a un `sourceImageUrl`, `submitClips` ce
    // qui a un `assetUrl` : les deux sont posés, donc aucun fournisseur ne
    // sera appelé pour cette scène.
    expect(lie.sourceImageUrl).toBe(asset.key);
    expect(lie.assetUrl).toBe(asset.key);
    expect(lie.status).toBe('ready');
    expect(lie.sourceAssetId).toBe(asset.id);
  });

  it('laisse un plan animé attendre son clip', async () => {
    const tdb = await createTenant('Alpha');
    const { project, video } = await createProjectWithVideo(tdb);
    const { assets } = store();
    const shot = await addShot(tdb, video.id, 'video');

    const asset = await uploadClientAsset(
      tdb,
      project.id,
      { bytes: Buffer.from('jpg'), mimeType: 'image/jpeg' },
      assets
    );
    await bindAssetToShot(tdb, shot.id, asset.id);

    const [lie] = await tdb.findMany(shots, eq(shots.id, shot.id));
    expect(lie.sourceImageUrl).toBe(asset.key);
    expect(lie.assetUrl).toBeNull();
    expect(lie.status).not.toBe('ready');
  });

  it('fait suivre le type du plan quand le fichier est une vidéo', async () => {
    const tdb = await createTenant('Alpha');
    const { project, video } = await createProjectWithVideo(tdb);
    const { assets } = store();
    const shot = await addShot(tdb, video.id, 'image');

    const asset = await uploadClientAsset(
      tdb,
      project.id,
      { bytes: Buffer.from('mp4'), mimeType: 'video/mp4', durationS: 8.4 },
      assets
    );
    await bindAssetToShot(tdb, shot.id, asset.id);

    const [lie] = await tdb.findMany(shots, eq(shots.id, shot.id));
    // Sans ça, le rendu chercherait une image là où il y a un clip.
    expect(lie.type).toBe('video');
    expect(lie.assetUrl).toBe(asset.key);
  });

  it('refuse un fichier qui n existe pas', async () => {
    const tdb = await createTenant('Alpha');
    const { video } = await createProjectWithVideo(tdb);
    const shot = await addShot(tdb, video.id);

    await expect(bindAssetToShot(tdb, shot.id, 9_999)).rejects.toThrow(/does not exist/);
  });

  it('ne laisse pas un locataire lire le fichier d un autre', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');
    const { project } = await createProjectWithVideo(alpha);
    const { assets } = store();

    const asset = await uploadClientAsset(
      alpha,
      project.id,
      { bytes: Buffer.from('png'), mimeType: 'image/png' },
      assets
    );

    // Le fichier existe, mais pas pour Beta : la portée par locataire doit
    // valoir ici comme partout ailleurs.
    await expect(getClientAsset(beta, asset.id)).rejects.toThrow(/does not exist/);
  });
});

describe('la transcription d un apport', () => {
  it('écrit le texte et les mots sur la ligne du fichier', async () => {
    const tdb = await createTenant('Alpha');
    const { project } = await createProjectWithVideo(tdb);
    const { assets } = store();
    const apport = await uploadClientAsset(
      tdb,
      project.id,
      { bytes: Buffer.from('mp4'), mimeType: 'video/mp4' },
      assets
    );
    const { transcriber, appels } = transcripteur();

    const apres = await transcribeClientAsset(
      tdb,
      apport.id,
      Buffer.from('wav de 16 kHz'),
      transcriber
    );

    // L'audio vient du navigateur : le serveur ne sait pas extraire une piste
    // d'un MP4, faute de ffmpeg en serverless.
    expect(appels).toEqual([13]);
    expect(apres.transcript).toBe('Voici la bande son.');
    expect(apres.words).toHaveLength(2);

    // Et c'est bien en base, pas seulement dans la valeur rendue.
    expect((await getClientAsset(tdb, apport.id)).transcript).toBe(
      'Voici la bande son.'
    );
  });

  it('refuse une image, qui n a pas de bande son', async () => {
    const tdb = await createTenant('Alpha');
    const { project } = await createProjectWithVideo(tdb);
    const { assets } = store();
    const apport = await uploadClientAsset(
      tdb,
      project.id,
      { bytes: Buffer.from('png'), mimeType: 'image/png' },
      assets
    );

    await expect(
      transcribeClientAsset(
        tdb,
        apport.id,
        Buffer.from('wav'),
        transcripteur().transcriber
      )
    ).rejects.toThrow(AssetError);
  });
});

describe('le transcript à la liaison', () => {
  async function apportTranscrit(tdb: TenantDb, projectId: number) {
    const { assets } = store();
    const apport = await uploadClientAsset(
      tdb,
      projectId,
      { bytes: Buffer.from('mp4'), mimeType: 'video/mp4' },
      assets
    );
    return transcribeClientAsset(
      tdb,
      apport.id,
      Buffer.from('wav'),
      transcripteur().transcriber
    );
  }

  it('recopie les mots sur le plan qu il sert', async () => {
    // Le transcript est fait au dépôt, seul instant où l'audio existe. C'est
    // à la liaison qu'il rejoint la colonne que la composition lit.
    const tdb = await createTenant('Alpha');
    const { project, video } = await createProjectWithVideo(tdb);
    const apport = await apportTranscrit(tdb, project.id);
    const shot = await addShot(tdb, video.id);

    await bindAssetToShot(tdb, shot.id, apport.id);

    const [apres] = await tdb.findMany(shots, eq(shots.id, shot.id));
    expect(apres.words).toHaveLength(2);
  });

  it('garde la narration que le client a écrite', async () => {
    // Le transcript dit ce qui est prononcé, pas ce que le client veut
    // afficher : l'écraser lui ferait perdre son texte.
    const tdb = await createTenant('Alpha');
    const { project, video } = await createProjectWithVideo(tdb);
    const apport = await apportTranscrit(tdb, project.id);
    const shot = await addShot(tdb, video.id);

    await bindAssetToShot(tdb, shot.id, apport.id);

    const [apres] = await tdb.findMany(shots, eq(shots.id, shot.id));
    expect(apres.narration).toBe('Voici le tableau de bord.');
  });

  it('remplit une narration vide avec le transcript', async () => {
    const tdb = await createTenant('Alpha');
    const { project, video } = await createProjectWithVideo(tdb);
    const apport = await apportTranscrit(tdb, project.id);
    const shot = await addShot(tdb, video.id);
    await tdb.update(shots, { narration: '  ' }, eq(shots.id, shot.id));

    await bindAssetToShot(tdb, shot.id, apport.id);

    const [apres] = await tdb.findMany(shots, eq(shots.id, shot.id));
    expect(apres.narration).toBe('Voici la bande son.');
  });
});
