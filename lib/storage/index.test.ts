import { describe, expect, it } from 'vitest';
import {
  InvalidAssetKeyError,
  StorageNotConfiguredError,
  assetKey,
  createAssetStore,
  keyBelongsToTenant,
} from './index';

describe('asset keys', () => {
  it('prefixes every key with the tenant', () => {
    expect(assetKey(7, 'videos', '42', 'scene-1.mp3')).toBe(
      '7/videos/42/scene-1.mp3'
    );
  });

  it('refuses anything that could climb out of the prefix', () => {
    // Un path traversal dans une clé d'objet est la façon pour un tenant de
    // lire les assets d'un autre.
    for (const parts of [
      ['..', 'other'],
      ['videos/../..'],
      ['videos', '../42'],
      ['a b'],
      [''],
    ]) {
      expect(() => assetKey(7, ...parts)).toThrow(InvalidAssetKeyError);
    }
    expect(() => assetKey(7)).toThrow(InvalidAssetKeyError);
  });

  it('refuses an invalid tenant', () => {
    for (const tenantId of [0, -1, 1.5, Number.NaN]) {
      expect(() => assetKey(tenantId, 'videos')).toThrow(InvalidAssetKeyError);
    }
  });

  it('checks ownership before signing anything', () => {
    expect(keyBelongsToTenant('7/videos/1.mp3', 7)).toBe(true);
    expect(keyBelongsToTenant('7/videos/1.mp3', 8)).toBe(false);
    expect(keyBelongsToTenant('70/videos/1.mp3', 7)).toBe(false);
    expect(keyBelongsToTenant('7/../8/videos/1.mp3', 7)).toBe(false);
  });

  it('says plainly that R2 is not wired up yet', () => {
    expect(() => createAssetStore()).toThrow(StorageNotConfiguredError);
  });
});
