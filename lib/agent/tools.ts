/**
 * Définitions d'outils AI agent qui wrappent `/api/internal`.
 * Chaque outil correspond à une route interne existante.
 */

import { z } from 'zod';
import { callInternal } from './client';

/**
 * Schema de base pour tous les outils : tenantId + videoId.
 */
const baseTargetSchema = z.object({
  tenantId: z.number().int().positive().describe('ID du tenant'),
  videoId: z.number().int().positive().describe('ID de la vidéo'),
});

export type ToolTarget = z.infer<typeof baseTargetSchema>;

/**
 * Outil 1: génération de voix-off (voiceover).
 */
export const generateVoiceoverTool = {
  name: 'generate_voiceover',
  description:
    'Genere les voix-off pour toutes les scenes ayant une narration. Retourne le nombre de scenes vocalisees et les jobs associes.',
  schema: baseTargetSchema,
  execute: async (params: ToolTarget) => {
    return await callInternal({
      endpoint: 'voice',
      tenantId: params.tenantId,
      videoId: params.videoId,
    });
  },
};

/**
 * Outil 2: génération d'images.
 */
export const generateImagesTool = {
  name: 'generate_images',
  description:
    'Genere les images pour toutes les scenes du storyboard. Retourne le nombre d\'images generees et les jobs associes.',
  schema: baseTargetSchema,
  execute: async (params: ToolTarget) => {
    return await callInternal({
      endpoint: 'images',
      tenantId: params.tenantId,
      videoId: params.videoId,
    });
  },
};

/**
 * Outil 3: soumission des clips d'animation.
 */
export const submitClipsTool = {
  name: 'submit_clips',
  description:
    'Soumet les clips video pour animation (image -> video). Retourne le nombre de clips soumis et les jobs associes.',
  schema: baseTargetSchema,
  execute: async (params: ToolTarget) => {
    return await callInternal({
      endpoint: 'clips',
      tenantId: params.tenantId,
      videoId: params.videoId,
    });
  },
};

/**
 * Outil 4: démarrage du rendu final.
 */
export const startRenderTool = {
  name: 'start_render',
  description:
    'Demarre le montage et rendu final de la video. Retourne le statut de la video et le job de rendu.',
  schema: baseTargetSchema,
  execute: async (params: ToolTarget) => {
    return await callInternal({
      endpoint: 'render',
      tenantId: params.tenantId,
      videoId: params.videoId,
    });
  },
};

/**
 * Outil 5: vérification du statut.
 */
export const checkStatusTool = {
  name: 'check_status',
  description:
    'Verifie le statut global de la video et de tous ses jobs (voiceover, images, clips, render). Collecte le rendu si termine.',
  schema: baseTargetSchema,
  execute: async (params: ToolTarget) => {
    return await callInternal({
      endpoint: 'status',
      tenantId: params.tenantId,
      videoId: params.videoId,
    });
  },
};

/**
 * Registry de tous les outils disponibles.
 * Exporté pour une future boucle LLM tool-calling.
 */
export const AGENT_TOOLS = [
  generateVoiceoverTool,
  generateImagesTool,
  submitClipsTool,
  startRenderTool,
  checkStatusTool,
] as const;

export type AgentTool = (typeof AGENT_TOOLS)[number];
