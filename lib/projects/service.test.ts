import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { eq } from 'drizzle-orm';
import { pipelineEnum, projects, videos } from '@/lib/db/schema';
import {
  closeDb,
  createProjectWithVideo,
  createTenant,
  resetDb,
} from '@/lib/test/fixtures';
import {
  PIPELINES,
  PROJECT_NAME_MAX,
  ProjectError,
  assertCanDeleteProject,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from './service';

afterAll(async () => {
  await closeDb();
});

describe('project configuration', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('keeps its pipeline list in step with the schema enum', () => {
    // Le formulaire propose ces trois-là ; la colonne accepte exactement ceux-ci.
    expect([...PIPELINES]).toEqual([...pipelineEnum.enumValues]);
  });

  it('creates a project with the documented defaults', async () => {
    const tdb = await createTenant('Alpha');

    const project = await createProject(tdb, { name: 'Histoires du Bénin' });

    expect(project).toMatchObject({
      name: 'Histoires du Bénin',
      defaultPipeline: 'mixed',
      voiceId: null,
      youtubeChannelId: null,
      stylePrompt: null,
      tenantId: tdb.tenantId,
    });
  });

  it('trims what it stores and reads a blank field as cleared', async () => {
    const tdb = await createTenant('Alpha');

    const project = await createProject(tdb, {
      name: '  Shorts  ',
      defaultPipeline: 'video',
      voiceId: '  elevenlabs:rachel  ',
      // Un formulaire poste toujours tous les champs ; vide doit signifier
      // null, pas ''.
      stylePrompt: '   ',
      youtubeChannelId: '',
    });

    expect(project).toMatchObject({
      name: 'Shorts',
      defaultPipeline: 'video',
      voiceId: 'elevenlabs:rachel',
      stylePrompt: null,
      youtubeChannelId: null,
    });
  });

  it('refuses a nameless, overlong or badly piped project', async () => {
    const tdb = await createTenant('Alpha');

    await expect(createProject(tdb, { name: '' })).rejects.toThrow(ZodError);
    await expect(createProject(tdb, { name: '   ' })).rejects.toThrow(ZodError);
    await expect(
      createProject(tdb, { name: 'x'.repeat(PROJECT_NAME_MAX + 1) })
    ).rejects.toThrow(ZodError);
    await expect(
      createProject(tdb, { name: 'Ok', defaultPipeline: 'audio' as never })
    ).rejects.toThrow(ZodError);

    expect(await tdb.count(projects)).toBe(0);
  });

  it('lists its own projects, most recently touched first, with video counts', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');

    const first = await createProject(alpha, { name: 'First' });
    const second = await createProject(alpha, { name: 'Second' });
    await createProject(beta, { name: 'Beta project' });

    await alpha.insert(videos, [
      { projectId: second.id, title: 'One' },
      { projectId: second.id, title: 'Two' },
    ]);
    // Toucher `first` le fait remonter en tête de liste.
    await updateProject(alpha, first.id, { name: 'First, renamed' });

    const listed = await listProjects(alpha);
    expect(listed.map((project) => project.name)).toEqual([
      'First, renamed',
      'Second',
    ]);
    expect(listed.map((project) => project.videoCount)).toEqual([0, 2]);
  });
});

describe('project isolation', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('answers "not found" for an id it does not own', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');
    const project = await createProject(alpha, { name: 'Alpha project' });

    // Pas « interdit » : Beta n'a pas à apprendre que l'id existe.
    for (const call of [
      () => getProject(beta, project.id),
      () => updateProject(beta, project.id, { name: 'Stolen' }),
      () => deleteProject(beta, project.id),
    ]) {
      await expect(call()).rejects.toThrow(ProjectError);
      await expect(call()).rejects.toMatchObject({ statusCode: 404 });
    }

    expect((await getProject(alpha, project.id)).name).toBe('Alpha project');
    expect(await beta.count(projects)).toBe(0);
  });

  it('answers "not found" for an unknown or nonsense id', async () => {
    const tdb = await createTenant('Alpha');

    await expect(getProject(tdb, 4_242)).rejects.toThrow(ProjectError);
    await expect(getProject(tdb, Number.NaN)).rejects.toThrow(ProjectError);
  });
});

describe('project updates', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('touches only the fields it was given', async () => {
    const tdb = await createTenant('Alpha');
    const project = await createProject(tdb, {
      name: 'Shorts',
      defaultPipeline: 'video',
      voiceId: 'elevenlabs:rachel',
      stylePrompt: 'Flat vector illustration.',
    });

    const updated = await updateProject(tdb, project.id, {
      defaultPipeline: 'mixed',
    });

    expect(updated).toMatchObject({
      name: 'Shorts',
      defaultPipeline: 'mixed',
      voiceId: 'elevenlabs:rachel',
      stylePrompt: 'Flat vector illustration.',
    });
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
      project.updatedAt.getTime()
    );
  });

  it('clears a field that comes back empty', async () => {
    const tdb = await createTenant('Alpha');
    const project = await createProject(tdb, {
      name: 'Shorts',
      voiceId: 'elevenlabs:rachel',
    });

    const updated = await updateProject(tdb, project.id, { voiceId: '' });
    expect(updated.voiceId).toBeNull();
  });

  it('is a no-op when nothing was submitted', async () => {
    const tdb = await createTenant('Alpha');
    const project = await createProject(tdb, { name: 'Shorts' });

    const updated = await updateProject(tdb, project.id, {});
    expect(updated).toEqual(project);
  });
});

describe('project deletion', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('deletes an empty project', async () => {
    const tdb = await createTenant('Alpha');
    const project = await createProject(tdb, { name: 'Empty' });

    const deleted = await deleteProject(tdb, project.id);

    expect(deleted.id).toBe(project.id);
    expect(await tdb.count(projects)).toBe(0);
  });

  it('refuses to take paid work down with it', async () => {
    const tdb = await createTenant('Alpha');
    const { project } = await createProjectWithVideo(tdb, { title: 'Amazones' });

    // Ces vidéos portent des crédits consommés et des ids YouTube publiés.
    await expect(deleteProject(tdb, project.id)).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(deleteProject(tdb, project.id)).rejects.toThrow(/1 video/);

    expect(await tdb.count(projects)).toBe(1);
    expect(await tdb.count(videos)).toBe(1);
  });

  it('deletes once the videos are gone', async () => {
    const tdb = await createTenant('Alpha');
    const { project, video } = await createProjectWithVideo(tdb);

    await tdb.delete(videos, eq(videos.id, video.id));
    await deleteProject(tdb, project.id);

    expect(await tdb.count(projects)).toBe(0);
  });

  it('reserves deletion to an owner or an admin', () => {
    expect(() => assertCanDeleteProject({ role: 'owner' })).not.toThrow();
    expect(() => assertCanDeleteProject({ role: 'admin' })).not.toThrow();

    try {
      assertCanDeleteProject({ role: 'member' });
      throw new Error('expected a ProjectError');
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectError);
      expect((error as ProjectError).statusCode).toBe(403);
    }
  });
});
