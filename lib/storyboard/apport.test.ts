import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { clientAssets, shots, videos } from '@/lib/db/schema';
import type { TenantDb } from '@/lib/db/tenant-db';
import { closeDb, createProjectWithVideo, createTenant } from '@/lib/test/fixtures';
import { monterLapport } from './apport';
import { ficheRythme } from './registres';

afterAll(async () => {
  await closeDb();
});

const { min: MIN } = ficheRythme('explainer');

/** Un transcript de trente secondes, un mot toutes les 0,4 s. */
const MOTS = Array.from({ length: 70 }, (_, i) => ({
  text: `mot${i}`,
  start: i * 0.4,
  duration: 0.32,
}));

/** Un apport vidéo, posé à la main : on teste le montage, pas le dépôt. */
async function apport(
  tdb: TenantDb,
  projectId: number,
  surcouche: Record<string, unknown> = {}
) {
  const [ligne] = await tdb.insert(clientAssets, [
    {
      projectId,
      kind: 'video' as const,
      key: 'tenant/projects/1/imports/1-abc.mp4',
      originalName: 'tournage.mp4',
      mimeType: 'video/mp4',
      bytes: 1_700_000,
      width: 848,
      height: 478,
      durationS: 30,
      transcript: MOTS.map((mot) => mot.text).join(' '),
      words: MOTS,
      ...surcouche,
    },
  ]);
  return ligne;
}

async function planDe(tdb: TenantDb, videoId: number) {
  return await tdb.findMany(shots, eq(shots.videoId, videoId));
}

describe('le montage d un apport', () => {
  it('taille plusieurs plans dans un fichier unique', async () => {
    // Ce qui manquait : bindAssetToShot lie un fichier à UN plan, ce qui est
    // juste pour une capture. Une vidéo de trente secondes n'est pas un plan.
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { project, video } = await createProjectWithVideo(tdb);
    const fichier = await apport(tdb, project.id);

    await monterLapport(tdb, video.id, fichier.id);
    const plans = await planDe(tdb, video.id);

    expect(plans.length).toBeGreaterThan(1);
    for (const plan of plans) {
      expect(plan.assetUrl).toBe(fichier.key);
      expect(plan.sourceAssetId).toBe(fichier.id);
      expect(plan.type).toBe('video');
      // Prêt d'emblée : aucune étape payante n'a à toucher ce plan.
      expect(plan.status).toBe('ready');
      expect(plan.durationSource).toBe('measured');
    }
  });

  it('entre dans le fichier à un endroit différent par plan', async () => {
    // C'est tout l'objet du montage : sans décalage, chaque plan rejouerait le
    // fichier depuis zéro.
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { project, video } = await createProjectWithVideo(tdb);
    const fichier = await apport(tdb, project.id);

    await monterLapport(tdb, video.id, fichier.id);
    const plans = await planDe(tdb, video.id);

    const decalages = plans.map(
      (plan) => (plan.render as { mediaStart?: number }).mediaStart ?? 0
    );
    expect(decalages[0]).toBe(0);
    expect(new Set(decalages).size).toBe(plans.length);

    // Contigus : un trou perdrait des images, un recouvrement en rejouerait.
    for (let i = 1; i < plans.length; i += 1) {
      expect(decalages[i]).toBeCloseTo(decalages[i - 1] + plans[i - 1].durationS, 2);
    }
  });

  it('garde la bande son du client et coupe les effets qui la doubleraient', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { project, video } = await createProjectWithVideo(tdb);
    const fichier = await apport(tdb, project.id);

    await monterLapport(tdb, video.id, fichier.id);
    const plans = await planDe(tdb, video.id);

    for (const plan of plans) {
      const render = plan.render as {
        mediaVolume?: number;
        effects?: { transition?: string; zoom?: string };
      };
      // La bande son EST celle du client : la couper livrerait une vidéo muette.
      expect(render.mediaVolume).toBe(1);
      // Un fondu ferait jouer deux fois la même bande, décalée d'une
      // demi-seconde. Un écho.
      expect(render.effects?.transition).toBe('none');
      // Un zoom se battrait avec le mouvement propre de l'image.
      expect(render.effects?.zoom).toBe('none');
    }
  });

  it('alterne le cadrage, pour que la coupe se voie', async () => {
    // Une source continue rejouée contiguë est la même vidéo : c'est le
    // recadrage qui rend la coupe lisible.
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { project, video } = await createProjectWithVideo(tdb);
    const fichier = await apport(tdb, project.id);

    await monterLapport(tdb, video.id, fichier.id);
    const plans = await planDe(tdb, video.id);
    const cadres = plans.map((plan) =>
      Boolean((plan.render as { reframe?: unknown }).reframe)
    );

    expect(cadres[0]).toBe(false);
    for (let i = 1; i < cadres.length; i += 1) {
      expect(cadres[i]).not.toBe(cadres[i - 1]);
    }
  });

  it('remplace les plans existants au lieu de s y ajouter', async () => {
    // Le même contrat que la réécriture du storyboard : des plans à moitié
    // remplacés seraient pire que l'un ou l'autre état.
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { project, video } = await createProjectWithVideo(tdb);
    const fichier = await apport(tdb, project.id);

    await tdb.insert(shots, [
      {
        videoId: video.id,
        order: 1,
        type: 'image' as const,
        prompt: 'a baobab',
        narration: 'Une scène écrite avant.',
        durationS: 4,
      },
    ]);

    await monterLapport(tdb, video.id, fichier.id);
    const plans = await planDe(tdb, video.id);

    expect(plans.map((plan) => plan.prompt)).not.toContain('a baobab');
    expect(plans.map((plan) => plan.order)).toEqual(
      plans.map((_, index) => index + 1)
    );
  });

  it('note la provenance sur la vidéo', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { project, video } = await createProjectWithVideo(tdb);
    const fichier = await apport(tdb, project.id);

    await monterLapport(tdb, video.id, fichier.id);
    const [apres] = await tdb.findMany(videos, eq(videos.id, video.id));

    expect(apres.source).toBe('footage');
  });
});

describe('ce que le montage refuse', () => {
  it('refuse une image, qui est déjà une scène', async () => {
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { project, video } = await createProjectWithVideo(tdb);
    const image = await apport(tdb, project.id, {
      kind: 'image' as const,
      mimeType: 'image/png',
      durationS: null,
      words: null,
    });

    await expect(monterLapport(tdb, video.id, image.id)).rejects.toThrow(
      /Only a video/
    );
  });

  it('refuse un fichier sans durée mesurée', async () => {
    // Sans elle on ne sait pas où s'arrête le dernier plan, et le déduire du
    // dernier mot couperait la fin. Le serveur ne peut pas la lire : il n'y a
    // pas de ffprobe en serverless.
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { project, video } = await createProjectWithVideo(tdb);
    const sansDuree = await apport(tdb, project.id, { durationS: null });

    await expect(monterLapport(tdb, video.id, sansDuree.id)).rejects.toThrow(
      /no measured duration/
    );
  });

  it('cache un fichier d un autre locataire', async () => {
    const alpha = await createTenant('Alpha', { credits: 1_000 });
    const beta = await createTenant('Beta', { credits: 1_000 });
    const { project } = await createProjectWithVideo(alpha);
    const fichier = await apport(alpha, project.id);
    const { video: sienne } = await createProjectWithVideo(beta);

    await expect(monterLapport(beta, sienne.id, fichier.id)).rejects.toThrow();
  });
});

describe('sans transcript', () => {
  it('rend un plan unique plutôt que de couper à l aveugle', async () => {
    // Il n'y a aucun silence où couper : un plan franc vaut mieux qu'un
    // découpage inventé.
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const { project, video } = await createProjectWithVideo(tdb);
    const muet = await apport(tdb, project.id, { words: null, transcript: null });

    await monterLapport(tdb, video.id, muet.id);
    const plans = await planDe(tdb, video.id);

    expect(plans).toHaveLength(1);
    expect(plans[0].durationS).toBe(30);
    expect(plans[0].durationS).toBeGreaterThan(MIN);
  });
});
