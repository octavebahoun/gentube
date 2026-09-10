import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import {
  AGENT_TOOLS,
  generateVoiceoverTool,
  generateImagesTool,
  submitClipsTool,
  startRenderTool,
  checkStatusTool,
} from './tools';
import * as client from './client';

vi.mock('./client');

describe('Agent Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports all 5 tools in the registry', () => {
    expect(AGENT_TOOLS).toHaveLength(5);
    expect(AGENT_TOOLS).toContain(generateVoiceoverTool);
    expect(AGENT_TOOLS).toContain(generateImagesTool);
    expect(AGENT_TOOLS).toContain(submitClipsTool);
    expect(AGENT_TOOLS).toContain(startRenderTool);
    expect(AGENT_TOOLS).toContain(checkStatusTool);
  });

  describe('generateVoiceoverTool', () => {
    it('has correct metadata', () => {
      expect(generateVoiceoverTool.name).toBe('generate_voiceover');
      expect(generateVoiceoverTool.description).toContain('voix-off');
      expect(generateVoiceoverTool.schema).toBeInstanceOf(z.ZodObject);
    });

    it('calls internal voice endpoint', async () => {
      const mockResponse = { ok: true, voiced: 2, skipped: 1 };
      vi.mocked(client.callInternal).mockResolvedValueOnce(mockResponse);

      const result = await generateVoiceoverTool.execute({
        tenantId: 10,
        videoId: 20,
      });

      expect(client.callInternal).toHaveBeenCalledWith({
        endpoint: 'voice',
        tenantId: 10,
        videoId: 20,
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('generateImagesTool', () => {
    it('has correct metadata', () => {
      expect(generateImagesTool.name).toBe('generate_images');
      expect(generateImagesTool.description).toContain('images');
    });

    it('calls internal images endpoint', async () => {
      const mockResponse = { ok: true, generated: 5 };
      vi.mocked(client.callInternal).mockResolvedValueOnce(mockResponse);

      const result = await generateImagesTool.execute({
        tenantId: 10,
        videoId: 20,
      });

      expect(client.callInternal).toHaveBeenCalledWith({
        endpoint: 'images',
        tenantId: 10,
        videoId: 20,
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('submitClipsTool', () => {
    it('has correct metadata', () => {
      expect(submitClipsTool.name).toBe('submit_clips');
      expect(submitClipsTool.description).toContain('clips');
    });

    it('calls internal clips endpoint', async () => {
      const mockResponse = { ok: true, submitted: 3, skipped: 0 };
      vi.mocked(client.callInternal).mockResolvedValueOnce(mockResponse);

      const result = await submitClipsTool.execute({
        tenantId: 10,
        videoId: 20,
      });

      expect(client.callInternal).toHaveBeenCalledWith({
        endpoint: 'clips',
        tenantId: 10,
        videoId: 20,
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('startRenderTool', () => {
    it('has correct metadata', () => {
      expect(startRenderTool.name).toBe('start_render');
      expect(startRenderTool.description).toContain('rendu');
    });

    it('calls internal render endpoint', async () => {
      const mockResponse = { ok: true, videoStatus: 'rendering' };
      vi.mocked(client.callInternal).mockResolvedValueOnce(mockResponse);

      const result = await startRenderTool.execute({
        tenantId: 10,
        videoId: 20,
      });

      expect(client.callInternal).toHaveBeenCalledWith({
        endpoint: 'render',
        tenantId: 10,
        videoId: 20,
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('checkStatusTool', () => {
    it('has correct metadata', () => {
      expect(checkStatusTool.name).toBe('check_status');
      expect(checkStatusTool.description).toContain('statut');
    });

    it('calls internal status endpoint', async () => {
      const mockResponse = { ok: true, videoStatus: 'completed', outputUrl: 'https://example.com/video.mp4' };
      vi.mocked(client.callInternal).mockResolvedValueOnce(mockResponse);

      const result = await checkStatusTool.execute({
        tenantId: 10,
        videoId: 20,
      });

      expect(client.callInternal).toHaveBeenCalledWith({
        endpoint: 'status',
        tenantId: 10,
        videoId: 20,
      });
      expect(result).toEqual(mockResponse);
    });
  });
});
