import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, createTenant, resetDb } from '@/lib/test/fixtures';
import { createProject } from '@/lib/projects';
import { createVideo } from '@/lib/videos';
import { handleStatus, handleVoice } from './handlers';

afterAll(async () => {
  await closeDb();
});

const TOKEN = 'test-internal-api-token-isolation';

beforeEach(async () => {
  await resetDb();
  process.env.INTERNAL_API_TOKEN = TOKEN;
});

function authHeaders() {
  return { authorization: `Bearer ${TOKEN}` };
}

describe('Tenant isolation on /api/internal routes', () => {
  it('refuse un accès cross-tenant sur une vidéo d un autre tenant', async () => {
    // Tenant A crée une vidéo
    const { tdb: tdbA } = await createTenant({ plan: 'pro' });
    const projectA = await createProject(tdbA, { name: 'Project A' });
    const videoA = await createVideo(tdbA, {
      projectId: projectA.id,
      title: 'Video A',
      theme: 'Test theme A',
    });

    // Tenant B essaie d'accéder à la vidéo de A
    const { tdb: tdbB } = await createTenant({ plan: 'pro' });

    const body = JSON.stringify({
      tenantId: tdbB.tenantId, // Tenant B
      videoId: videoA.id, // Vidéo de tenant A
    });

    // L'appel doit échouer avec 404 car la vidéo n'existe pas dans le scope de B
    const result = await handleStatus(authHeaders(), body);
    expect(result.status).toBe(404);
    expect(result.body.ok).toBe(false);
    expect(result.body.message).toMatch(/not found/i);
  });

  it('autorise l accès à une vidéo du bon tenant', async () => {
    const { tdb } = await createTenant({ plan: 'pro' });
    const project = await createProject(tdb, { name: 'Project' });
    const video = await createVideo(tdb, {
      projectId: project.id,
      title: 'Video',
      theme: 'Test theme',
    });

    const body = JSON.stringify({
      tenantId: tdb.tenantId,
      videoId: video.id,
    });

    const result = await handleStatus(authHeaders(), body);
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.videoId).toBe(video.id);
  });

  it('refuse si tenantId manque dans le corps', async () => {
    const body = JSON.stringify({ videoId: 123 });

    const result = await handleStatus(authHeaders(), body);
    expect(result.status).toBe(400);
    expect(result.body.message).toMatch(/tenantId and videoId are required/);
  });

  it('refuse si videoId manque dans le corps', async () => {
    const body = JSON.stringify({ tenantId: 1 });

    const result = await handleStatus(authHeaders(), body);
    expect(result.status).toBe(400);
    expect(result.body.message).toMatch(/tenantId and videoId are required/);
  });

  it('refuse un appel sans jeton valide', async () => {
    const body = JSON.stringify({ tenantId: 1, videoId: 1 });

    const result = await handleStatus({}, body);
    expect(result.status).toBe(503); // INTERNAL_API_TOKEN non configuré
  });

  it('refuse un jeton invalide', async () => {
    const body = JSON.stringify({ tenantId: 1, videoId: 1 });

    const result = await handleStatus(
      { authorization: 'Bearer wrong-token' },
      body
    );
    expect(result.status).toBe(401);
    expect(result.body.message).toMatch(/Unauthorized/);
  });

  it('empêche l écriture cross-tenant via tenantDb', async () => {
    // Tenant A crée une vidéo
    const { tdb: tdbA } = await createTenant({ plan: 'pro' });
    const projectA = await createProject(tdbA, { name: 'Project A' });
    const videoA = await createVideo(tdbA, {
      projectId: projectA.id,
      title: 'Video A',
      theme: 'Test theme A',
    });

    // Tenant B crée sa propre vidéo
    const { tdb: tdbB } = await createTenant({ plan: 'pro' });
    const projectB = await createProject(tdbB, { name: 'Project B' });
    const videoB = await createVideo(tdbB, {
      projectId: projectB.id,
      title: 'Video B',
      theme: 'Test theme B',
    });

    // Essayer d'appeler handleVoice avec tenantId de B mais videoId de A
    const body = JSON.stringify({
      tenantId: tdbB.tenantId,
      videoId: videoA.id,
    });

    const result = await handleVoice(authHeaders(), body);
    // Doit échouer car videoA n'appartient pas à tdbB
    expect(result.status).toBe(404);
    expect(result.body.ok).toBe(false);
  });
});
