import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { eq } from 'drizzle-orm';
import { shots, videos } from '@/lib/db/schema';
import { createProject } from '@/lib/projects';
import { ResolutionNotAllowedError } from '@/lib/billing/entitlements';
import {
  closeDb,
  createTenant,
  resetDb,
  subscribe,
} from '@/lib/test/fixtures';
import {
  VideoError,
  createVideo,
  deleteVideo,
  getVideo,
  listVideos,
  updateVideo,
} from './service';

afterAll(async () => {
  await closeDb();
});

describe('video creation', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('starts a draft at 480p, inheriting the project pipeline', async () => {
    const tdb = await createTenant('Alpha');
    const project = await createProject(tdb, { name: 'Docs', defaultPipeline: 'video' });

    const video = await createVideo(tdb, {
      projectId: project.id,
      title: 'Les Amazones du Dahomey',
    });

    expect(video).toMatchObject({
      status: 'draft',
      resolution: '480p',
      // null signifie « hériter » ; le défaut du projet n'est pas copié,
      // donc changer le projet change les vidéos qui ne l'ont jamais surchargé.
      pipelineOverride: null,
      theme: null,
      creditsEstimated: 0,
      creditsConsumed: 0,
    });
  });

  it('keeps the theme apart from the title', async () => {
    const tdb = await createTenant('Alpha');
    await subscribe(tdb); // le 720p demande un abonnement actif
    const project = await createProject(tdb, { name: 'Docs' });

    const video = await createVideo(tdb, {
      projectId: project.id,
      title: '  Amazones  ',
      theme: '  The women warriors of the kingdom of Dahomey  ',
      resolution: '720p',
      pipelineOverride: 'image',
    });

    expect(video).toMatchObject({
      title: 'Amazones',
      theme: 'The women warriors of the kingdom of Dahomey',
      resolution: '720p',
      pipelineOverride: 'image',
    });
  });

  it('reads an empty override as "inherit"', async () => {
    const tdb = await createTenant('Alpha');
    const project = await createProject(tdb, { name: 'Docs' });

    for (const value of ['', 'inherit']) {
      const video = await createVideo(tdb, {
        projectId: project.id,
        title: 'Untitled',
        pipelineOverride: value,
      });
      expect(video.pipelineOverride).toBeNull();
    }
  });

  it('refuses a nameless video', async () => {
    const tdb = await createTenant('Alpha');
    const project = await createProject(tdb, { name: 'Docs' });

    await expect(
      createVideo(tdb, { projectId: project.id, title: '   ' })
    ).rejects.toThrow(ZodError);
  });

  it('refuses to hang a video off a project it does not own', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');
    const project = await createProject(alpha, { name: 'Alpha project' });

    await expect(
      createVideo(beta, { projectId: project.id, title: 'Stolen' })
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      createVideo(beta, { projectId: 9_999, title: 'Nowhere' })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(await beta.count(videos)).toBe(0);
  });
});

describe('video reads', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('lists per project, and only its own', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');
    const docs = await createProject(alpha, { name: 'Docs' });
    const shorts = await createProject(alpha, { name: 'Shorts' });
    const betaProject = await createProject(beta, { name: 'Beta' });

    await createVideo(alpha, { projectId: docs.id, title: 'A' });
    await createVideo(alpha, { projectId: shorts.id, title: 'B' });
    await createVideo(beta, { projectId: betaProject.id, title: 'C' });

    expect((await listVideos(alpha)).map((v) => v.title).sort()).toEqual(['A', 'B']);
    expect((await listVideos(alpha, docs.id)).map((v) => v.title)).toEqual(['A']);
    expect(await listVideos(beta, docs.id)).toEqual([]);
  });

  it('answers "not found" for another tenant id', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');
    const project = await createProject(alpha, { name: 'Docs' });
    const video = await createVideo(alpha, { projectId: project.id, title: 'A' });

    await expect(getVideo(beta, video.id)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(getVideo(alpha, 4_242)).rejects.toThrow(VideoError);
  });
});

describe('video edits', () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function draft() {
    const tdb = await createTenant('Alpha');
    const project = await createProject(tdb, { name: 'Docs' });
    const video = await createVideo(tdb, {
      projectId: project.id,
      title: 'Draft',
      theme: 'Something',
    });
    return { tdb, video };
  }

  it('touches only what it was given', async () => {
    const { tdb, video } = await draft();
    await subscribe(tdb);

    const updated = await updateVideo(tdb, video.id, { resolution: '720p' });

    expect(updated).toMatchObject({
      title: 'Draft',
      theme: 'Something',
      resolution: '720p',
    });
  });

  it('clears the theme when it comes back empty', async () => {
    const { tdb, video } = await draft();
    expect((await updateVideo(tdb, video.id, { theme: '' })).theme).toBeNull();
  });

  it('refuses to reshape anything that left draft', async () => {
    const { tdb, video } = await draft();
    await tdb.update(videos, { status: 'generating' }, eq(videos.id, video.id));

    // Les crédits ont alors été facturés : le storyboard est un historique,
    // plus un formulaire.
    await expect(
      updateVideo(tdb, video.id, { title: 'Too late' })
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(deleteVideo(tdb, video.id)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('video deletion', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('takes the storyboard with it', async () => {
    const tdb = await createTenant('Alpha');
    const project = await createProject(tdb, { name: 'Docs' });
    const video = await createVideo(tdb, { projectId: project.id, title: 'A' });
    await tdb.insert(shots, {
      videoId: video.id,
      order: 1,
      type: 'video',
      prompt: 'A shot',
      durationS: 5,
    });

    await deleteVideo(tdb, video.id);

    expect(await tdb.count(videos)).toBe(0);
    expect(await tdb.count(shots)).toBe(0);
  });

  it('refuses a video that has consumed credits', async () => {
    const tdb = await createTenant('Alpha', { credits: 100 });
    const project = await createProject(tdb, { name: 'Docs' });
    const video = await createVideo(tdb, { projectId: project.id, title: 'A' });
    await tdb.update(videos, { creditsConsumed: 25 }, eq(videos.id, video.id));

    // Une ligne de grand livre pointant vers une vidéo supprimée serait de
    // l'argent bougé pour une raison que personne ne peut retrouver.
    await expect(deleteVideo(tdb, video.id)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(await tdb.count(videos)).toBe(1);
  });
});

describe('the trial', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('refuses 720p without an active plan, even on a forged request', async () => {
    // Le formulaire n'offre pas le choix ; une requête directe, si.
    const tdb = await createTenant('Alpha');
    const project = await createProject(tdb, { name: 'Docs' });

    await expect(
      createVideo(tdb, {
        projectId: project.id,
        title: 'Amazones',
        resolution: '720p',
      })
    ).rejects.toThrow(ResolutionNotAllowedError);
  });

  it('refuses to upgrade an existing draft to 720p either', async () => {
    const tdb = await createTenant('Alpha');
    const project = await createProject(tdb, { name: 'Docs' });
    const video = await createVideo(tdb, {
      projectId: project.id,
      title: 'Amazones',
    });

    await expect(
      updateVideo(tdb, video.id, { resolution: '720p' })
    ).rejects.toThrow(ResolutionNotAllowedError);
  });

  it('still allows 480p', async () => {
    const tdb = await createTenant('Alpha');
    const project = await createProject(tdb, { name: 'Docs' });

    const video = await createVideo(tdb, {
      projectId: project.id,
      title: 'Amazones',
      resolution: '480p',
    });

    expect(video.resolution).toBe('480p');
  });

  it('opens 720p as soon as a plan is active', async () => {
    const tdb = await createTenant('Alpha');
    await subscribe(tdb);
    const project = await createProject(tdb, { name: 'Docs' });

    const video = await createVideo(tdb, {
      projectId: project.id,
      title: 'Amazones',
      resolution: '720p',
    });

    expect(video.resolution).toBe('720p');
  });

  it('lets a draft choose its music, and drop it again', async () => {
    // Le champ existait en base et n'était réglable nulle part : une vidéo ne
    // pouvait pas porter de musique, quoi qu'en dise la colonne.
    const tdb = await createTenant('Alpha', { credits: 1_000 });
    const project = await createProject(tdb, { name: 'Docs' });
    const video = await createVideo(tdb, { projectId: project.id, title: 'Test' });

    const avec = await updateVideo(tdb, video.id, {
      musicUrl: 'sounds/music/weightless-horizon.mp3',
    });
    expect(avec.musicUrl).toBe('sounds/music/weightless-horizon.mp3');

    // Une chaîne vide retire la musique plutôt que d'enregistrer du vide.
    const sans = await updateVideo(tdb, video.id, { musicUrl: '' });
    expect(sans.musicUrl).toBeNull();
  });
});
