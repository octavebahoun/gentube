/**
 * Point d'entrée public du module agent.
 * Exporte les outils et le client pour les appels internes.
 */

export { callInternal, InternalApiError } from './client';
export {
  AGENT_TOOLS,
  generateVoiceoverTool,
  generateImagesTool,
  submitClipsTool,
  startRenderTool,
  checkStatusTool,
  type AgentTool,
  type ToolTarget,
} from './tools';
